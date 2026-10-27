package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/api"
	"github.com/disharoy-08/spectrapulse-backend/internal/generator"
	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/disharoy-08/spectrapulse-backend/internal/pubsub"
	"github.com/disharoy-08/spectrapulse-backend/internal/storage"
	"github.com/disharoy-08/spectrapulse-backend/internal/websocket"
)

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func main() {
	port := getEnv("PORT", "8080")
	nodeID := getEnv("NODE_ID", "node-a")
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisChannel := getEnv("REDIS_CHANNEL", "telemetry:events")
	dbURL := getEnv("DB_URL", "")
	genEnabled := getEnv("GENERATE_METRICS", "true") == "true"
	genIntervalMs, _ := strconv.Atoi(getEnv("GENERATE_INTERVAL_MS", "500"))

	log.Printf("==================================================================")
	log.Printf("⚡ SpectraPulse Distributed Telemetry Server starting...")
	log.Printf("   Node ID       : %s", nodeID)
	log.Printf("   HTTP/WS Port  : %s", port)
	log.Printf("   Redis Address : %s (Channel: %s)", redisAddr, redisChannel)
	log.Printf("   Generator     : %v (Interval: %dms)", genEnabled, genIntervalMs)
	log.Printf("==================================================================")

	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// 1. Initialize Storage (PostgreSQL with In-Memory fallback)
	store := storage.NewStore(rootCtx, dbURL)
	defer store.Close()

	// 2. Initialize Redis Pub/Sub Broker (with Local in-memory fallback)
	broker := pubsub.NewBroker(redisAddr, redisChannel)
	defer broker.Close()

	// 3. Initialize WebSocket Hub
	hub := websocket.NewHub(rootCtx)

	// 4. Connect Redis subscription -> WebSocket Hub broadcast
	// Whenever this node receives an event from Redis (whether generated locally or by another node),
	// it pushes it to its own connected WebSocket clients.
	err := broker.Subscribe(rootCtx, func(event *model.MetricEvent) {
		hub.Broadcast(event)
	})
	if err != nil {
		log.Printf("[Server] Warning: Subscription initialization: %v", err)
	}

	// 5. Initialize Metric Generator
	var gen *generator.Generator
	gen = generator.NewGenerator(nodeID, time.Duration(genIntervalMs)*time.Millisecond, func(event *model.MetricEvent) {
		// Asynchronously save to historical store
		go func(e *model.MetricEvent) {
			_ = store.Save(context.Background(), e)
		}(event)

		// Publish to distributed Redis bus (fans out to all nodes, including this one)
		_ = broker.Publish(context.Background(), event)
	})

	if genEnabled {
		go gen.Start(rootCtx)
		log.Printf("[Generator] Telemetry simulator running on %s", nodeID)
	}

	// 6. Build HTTP REST & WebSocket Server
	server := api.NewServer(store, broker, hub, gen, nodeID)
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      server.Router(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in background goroutine
	go func() {
		log.Printf("[HTTP] SpectraPulse listening on http://0.0.0.0:%s", port)
		log.Printf("[WS]   Live stream endpoint ws://0.0.0.0:%s/ws/metrics", port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[HTTP] Fatal server error: %v", err)
		}
	}()

	// 7. Graceful Shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("[Server] Received shutdown signal (%v). Initiating graceful termination...", sig)

	rootCancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("[Server] Forced HTTP shutdown: %v", err)
	}

	log.Printf("[Server] SpectraPulse shutdown complete.")
}
