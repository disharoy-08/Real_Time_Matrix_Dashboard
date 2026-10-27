package model

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Role definitions for RBAC
type Role string

const (
	RoleViewer   Role = "viewer"
	RoleOperator Role = "operator"
	RoleAdmin    Role = "admin"
)

// MetricEvent represents a single telemetry data point in the pipeline.
// SeqID is a monotonically increasing sequence ID used to verify application-level zero packet drops.
type MetricEvent struct {
	ID        string    `json:"id"`
	SeqID     int64     `json:"seq_id"`
	Service   string    `json:"service"`
	Name      string    `json:"name"`
	Value     float64   `json:"value"`
	Unit      string    `json:"unit"`
	NodeID    string    `json:"node_id"`
	Timestamp time.Time `json:"timestamp"`
}

// ClientMessage is sent by a WebSocket client for filtering/subscriptions.
type ClientMessage struct {
	Action   string   `json:"action"`   // "subscribe", "ping"
	Services []string `json:"services"` // e.g. ["api-gateway", "auth-service"]
}

// ServerMessage is wrapped for WebSocket clients when necessary.
type ServerMessage struct {
	Type    string      `json:"type"` // "event", "gap_response", "system_stats", "pong"
	Payload interface{} `json:"payload"`
}

// User credentials & identity
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"-"`
	Role     Role   `json:"role"`
}

// LoginRequest for REST auth
type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse returns JWT token and User profile
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// JWTClaims custom claims
type JWTClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Role     Role   `json:"role"`
	jwt.RegisteredClaims
}

// HealthStatus returns health metrics of the current instance
type HealthStatus struct {
	Status          string            `json:"status"`
	NodeID          string            `json:"node_id"`
	UptimeSeconds   int64             `json:"uptime_seconds"`
	ConnectedWS     int               `json:"connected_ws_clients"`
	TotalDispatched int64             `json:"total_events_dispatched"`
	TotalIngested   int64             `json:"total_events_ingested"`
	ZeroDropActive  bool              `json:"zero_drop_guarantee_active"`
	Database        string            `json:"database_status"`
	Redis           string            `json:"redis_status"`
	Services        []string          `json:"monitored_services"`
	Meta            map[string]string `json:"meta"`
}

// ChaosSpikeRequest triggers a simulated burst
type ChaosSpikeRequest struct {
	Service    string  `json:"service" binding:"required"`
	Multiplier float64 `json:"multiplier"` // e.g. 3.5x
	DurationMs int     `json:"duration_ms"` // duration of spike in ms
}
