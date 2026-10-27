package generator

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/google/uuid"
)

// Monotonic global sequence counter across all generated events
var globalSeqID int64 = 0

// NextSeqID returns a strictly increasing 64-bit integer
func NextSeqID() int64 {
	return atomic.AddInt64(&globalSeqID, 1)
}

// CurrentSeqID returns the latest sequence ID
func CurrentSeqID() int64 {
	return atomic.LoadInt64(&globalSeqID)
}

type ServiceConfig struct {
	Name            string
	BaseCPU         float64
	BaseMemoryMB    float64
	BaseRPS         float64
	BaseErrorRate   float64
	BaseLatencyMS   float64
	SpikeMultiplier float64
	SpikeUntil      time.Time
}

type Generator struct {
	nodeID    string
	interval  time.Duration
	services  map[string]*ServiceConfig
	onEmit    func(event *model.MetricEvent)
	mu        sync.RWMutex
	stepCount int64
}

func NewGenerator(nodeID string, interval time.Duration, onEmit func(event *model.MetricEvent)) *Generator {
	if interval <= 0 {
		interval = 500 * time.Millisecond
	}

	services := map[string]*ServiceConfig{
		"api-gateway": {
			Name:          "api-gateway",
			BaseCPU:       28.0,
			BaseMemoryMB:  420.0,
			BaseRPS:       1250.0,
			BaseErrorRate: 0.12,
			BaseLatencyMS: 14.5,
		},
		"auth-service": {
			Name:          "auth-service",
			BaseCPU:       35.0,
			BaseMemoryMB:  310.0,
			BaseRPS:       820.0,
			BaseErrorRate: 0.05,
			BaseLatencyMS: 22.0,
		},
		"payment-service": {
			Name:          "payment-service",
			BaseCPU:       45.0,
			BaseMemoryMB:  680.0,
			BaseRPS:       450.0,
			BaseErrorRate: 0.02,
			BaseLatencyMS: 38.0,
		},
		"order-worker": {
			Name:          "order-worker",
			BaseCPU:       52.0,
			BaseMemoryMB:  950.0,
			BaseRPS:       600.0,
			BaseErrorRate: 0.18,
			BaseLatencyMS: 28.5,
		},
	}

	return &Generator{
		nodeID:   nodeID,
		interval: interval,
		services: services,
		onEmit:   onEmit,
	}
}

// Start runs the periodic emission loop until ctx is canceled
func (g *Generator) Start(ctx context.Context) {
	ticker := time.NewTicker(g.interval)
	defer ticker.Stop()

	// Seed random for natural variation
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			g.stepCount++
			step := float64(g.stepCount)

			g.mu.RLock()
			for _, svc := range g.services {
				mult := 1.0
				if now.Before(svc.SpikeUntil) {
					mult = svc.SpikeMultiplier
				}

				// CPU Usage (Sine wave oscillation + random walk)
				cpuOscillation := math.Sin(step/10.0)*8.0 + (r.Float64()*4.0 - 2.0)
				cpu := math.Max(5.0, math.Min(98.0, (svc.BaseCPU+cpuOscillation)*mult))
				g.emit(svc.Name, "cpu_usage_pct", round(cpu, 1), "%", now)

				// Memory Usage MB
				memDrift := math.Cos(step/15.0)*30.0 + (r.Float64()*10.0 - 5.0)
				mem := math.Max(100.0, (svc.BaseMemoryMB+memDrift)*mult)
				g.emit(svc.Name, "memory_usage_mb", round(mem, 1), "MB", now)

				// Request Rate RPS
				rpsDrift := math.Sin(step/8.0)*150.0 + (r.Float64()*50.0 - 25.0)
				rps := math.Max(10.0, (svc.BaseRPS+rpsDrift)*mult)
				g.emit(svc.Name, "request_rate_rps", round(rps, 0), "req/s", now)

				// Error Rate %
				errBase := svc.BaseErrorRate
				if mult > 1.2 {
					errBase *= 3.5 // Errors spike non-linearly under load
				}
				errRate := math.Max(0.0, math.Min(15.0, errBase+(r.Float64()*0.08-0.04)))
				g.emit(svc.Name, "error_rate_pct", round(errRate, 2), "%", now)

				// Latency p95 MS
				latDrift := math.Sin(step/12.0)*6.0 + (r.Float64()*4.0 - 2.0)
				latency := math.Max(2.0, (svc.BaseLatencyMS+latDrift)*mult)
				g.emit(svc.Name, "latency_p95_ms", round(latency, 1), "ms", now)
			}
			g.mu.RUnlock()
		}
	}
}

func (g *Generator) emit(service, name string, val float64, unit string, t time.Time) {
	event := &model.MetricEvent{
		ID:        uuid.New().String(),
		SeqID:     NextSeqID(),
		Service:   service,
		Name:      name,
		Value:     val,
		Unit:      unit,
		NodeID:    g.nodeID,
		Timestamp: t.UTC(),
	}
	if g.onEmit != nil {
		g.onEmit(event)
	}
}

// TriggerSpike applies a traffic burst multiplier to a specific service
func (g *Generator) TriggerSpike(service string, multiplier float64, duration time.Duration) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	svc, ok := g.services[service]
	if !ok {
		return fmt.Errorf("service %s not found", service)
	}

	if multiplier <= 1.0 {
		multiplier = 2.5
	}
	if duration <= 0 {
		duration = 15 * time.Second
	}

	svc.SpikeMultiplier = multiplier
	svc.SpikeUntil = time.Now().Add(duration)
	return nil
}

func round(val float64, precision int) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(val*ratio) / ratio
}
