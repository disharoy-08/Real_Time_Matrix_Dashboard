package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/auth"
	"github.com/disharoy-08/spectrapulse-backend/internal/generator"
	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/disharoy-08/spectrapulse-backend/internal/pubsub"
	"github.com/disharoy-08/spectrapulse-backend/internal/storage"
	"github.com/disharoy-08/spectrapulse-backend/internal/websocket"
	"github.com/gin-gonic/gin"
)

type Server struct {
	router    *gin.Engine
	store     storage.Store
	broker    pubsub.Broker
	hub       *websocket.Hub
	gen       *generator.Generator
	nodeID    string
	startTime time.Time
}

func NewServer(
	store storage.Store,
	broker pubsub.Broker,
	hub *websocket.Hub,
	gen *generator.Generator,
	nodeID string,
) *Server {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// Custom CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	s := &Server{
		router:    r,
		store:     store,
		broker:    broker,
		hub:       hub,
		gen:       gen,
		nodeID:    nodeID,
		startTime: time.Now(),
	}

	s.setupRoutes()
	return s
}

func (s *Server) Router() *gin.Engine {
	return s.router
}

func (s *Server) setupRoutes() {
	// Public Health check
	s.router.GET("/health", s.handleHealth)

	// Auth routes
	authGroup := s.router.Group("/api/auth")
	{
		authGroup.POST("/login", s.handleLogin)
	}

	// Metrics REST API
	apiGroup := s.router.Group("/api")
	{
		apiGroup.GET("/metrics/latest", s.handleLatestMetrics)
		apiGroup.GET("/metrics/history", s.handleHistoryMetrics)

		// Operator & Admin only: chaos spike simulation
		apiGroup.POST("/chaos/spike", auth.RequireRole(model.RoleOperator, model.RoleAdmin), s.handleChaosSpike)
	}

	// Live WebSocket stream
	s.router.GET("/ws/metrics", s.handleWebSocket)
}

func (s *Server) handleHealth(c *gin.Context) {
	status := model.HealthStatus{
		Status:          "healthy",
		NodeID:          s.nodeID,
		UptimeSeconds:   int64(time.Since(s.startTime).Seconds()),
		ConnectedWS:     s.hub.ConnectedCount(),
		TotalDispatched: s.hub.TotalDispatched(),
		TotalIngested:   s.broker.TotalIngested(),
		ZeroDropActive:  true,
		Database:        s.store.Status(),
		Redis:           s.broker.Status(),
		Services:        []string{"api-gateway", "auth-service", "payment-service", "order-worker"},
		Meta: map[string]string{
			"version":     "1.0.0",
			"engine":      "Go 1.24 / Gin / Gorilla",
			"environment": "production-ready",
		},
	}
	c.JSON(http.StatusOK, status)
}

func (s *Server) handleLogin(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid login payload"})
		return
	}

	user, err := auth.Authenticate(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	token, err := auth.GenerateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create authorization token"})
		return
	}

	c.JSON(http.StatusOK, model.LoginResponse{
		Token: token,
		User:  *user,
	})
}

func (s *Server) handleLatestMetrics(c *gin.Context) {
	latest, err := s.store.GetLatest(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"node_id": s.nodeID,
		"data":    latest,
	})
}

func (s *Server) handleHistoryMetrics(c *gin.Context) {
	service := c.Query("service")
	metricName := c.Query("name")
	limitStr := c.DefaultQuery("limit", "100")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	limit, _ := strconv.Atoi(limitStr)

	// Default to last 15 minutes if not provided
	to := time.Now().UTC()
	from := to.Add(-15 * time.Minute)

	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			from = t
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			to = t
		}
	}

	history, err := s.store.QueryHistory(c.Request.Context(), service, metricName, from, to, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"service": service,
		"name":    metricName,
		"from":    from,
		"to":      to,
		"count":   len(history),
		"data":    history,
	})
}

func (s *Server) handleChaosSpike(c *gin.Context) {
	var req model.ChaosSpikeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid spike parameters"})
		return
	}

	duration := time.Duration(req.DurationMs) * time.Millisecond
	if err := s.gen.TriggerSpike(req.Service, req.Multiplier, duration); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    fmt.Sprintf("Traffic spike triggered on %s", req.Service),
		"multiplier": req.Multiplier,
		"duration":   duration.String(),
	})
}

func (s *Server) handleWebSocket(c *gin.Context) {
	token := c.Query("token")
	userRole := model.RoleViewer // default role if anonymous in dev

	if token != "" {
		claims, err := auth.ValidateToken(token)
		if err == nil {
			userRole = claims.Role
		}
	}

	// Optional initial services filter
	servicesQuery := c.Query("services")
	var initialServices []string
	if servicesQuery != "" {
		initialServices = strings.Split(servicesQuery, ",")
	}

	err := s.hub.HandleWS(c.Writer, c.Request, userRole, initialServices)
	if err != nil {
		// Log WebSocket handshake error
		return
	}
}
