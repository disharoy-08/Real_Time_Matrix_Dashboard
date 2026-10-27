package pubsub

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/redis/go-redis/v9"
)

// Broker handles distributed event fan-out across multiple Go instances
type Broker interface {
	Publish(ctx context.Context, event *model.MetricEvent) error
	Subscribe(ctx context.Context, handler func(event *model.MetricEvent)) error
	Status() string
	TotalPublished() int64
	TotalIngested() int64
	Close() error
}

type RedisBroker struct {
	client     *redis.Client
	channel    string
	published  int64
	ingested   int64
	subMu      sync.Mutex
	isSubbed   bool
	cancelSub  context.CancelFunc
}

type LocalBroker struct {
	channel   string
	handlers  []func(event *model.MetricEvent)
	mu        sync.RWMutex
	published int64
	ingested  int64
}

// NewBroker attempts to connect to Redis; falls back gracefully to LocalBroker if unavailable
func NewBroker(redisAddr string, channel string) Broker {
	if channel == "" {
		channel = "telemetry:events"
	}

	if redisAddr != "" {
		rdb := redis.NewClient(&redis.Options{
			Addr:            redisAddr,
			MaxRetries:      3,
			DialTimeout:     2 * time.Second,
			ReadTimeout:     2 * time.Second,
			WriteTimeout:    2 * time.Second,
		})

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		if err := rdb.Ping(ctx).Err(); err == nil {
			log.Printf("[PubSub] Connected to distributed Redis at %s (channel: %s)", redisAddr, channel)
			return &RedisBroker{
				client:  rdb,
				channel: channel,
			}
		}
		log.Printf("[PubSub] Redis ping failed at %s, using local in-memory event bus", redisAddr)
		rdb.Close()
	} else {
		log.Printf("[PubSub] No Redis address configured, using local in-memory event bus")
	}

	return &LocalBroker{
		channel:  channel,
		handlers: make([]func(event *model.MetricEvent), 0),
	}
}

// ----------------- Redis Implementation -----------------

func (r *RedisBroker) Publish(ctx context.Context, event *model.MetricEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	err = r.client.Publish(ctx, r.channel, data).Err()
	if err == nil {
		atomic.AddInt64(&r.published, 1)
	}
	return err
}

func (r *RedisBroker) Subscribe(ctx context.Context, handler func(event *model.MetricEvent)) error {
	r.subMu.Lock()
	defer r.subMu.Unlock()

	pubsub := r.client.Subscribe(ctx, r.channel)
	// Confirm subscription
	_, err := pubsub.Receive(ctx)
	if err != nil {
		return fmt.Errorf("failed to subscribe to redis channel: %w", err)
	}

	subCtx, cancel := context.WithCancel(ctx)
	r.cancelSub = cancel
	r.isSubbed = true

	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case <-subCtx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var event model.MetricEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err == nil {
					atomic.AddInt64(&r.ingested, 1)
					handler(&event)
				}
			}
		}
	}()

	return nil
}

func (r *RedisBroker) Status() string {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	if err := r.client.Ping(ctx).Err(); err != nil {
		return fmt.Sprintf("Redis Degraded (%v)", err)
	}
	return fmt.Sprintf("Redis Pub/Sub Active (Published: %d, Received: %d)",
		atomic.LoadInt64(&r.published), atomic.LoadInt64(&r.ingested))
}

func (r *RedisBroker) TotalPublished() int64 {
	return atomic.LoadInt64(&r.published)
}

func (r *RedisBroker) TotalIngested() int64 {
	return atomic.LoadInt64(&r.ingested)
}

func (r *RedisBroker) Close() error {
	if r.cancelSub != nil {
		r.cancelSub()
	}
	return r.client.Close()
}

// ----------------- Local In-Memory Fallback -----------------

func (l *LocalBroker) Publish(ctx context.Context, event *model.MetricEvent) error {
	atomic.AddInt64(&l.published, 1)

	l.mu.RLock()
	handlers := append([]func(event *model.MetricEvent){}, l.handlers...)
	l.mu.RUnlock()

	for _, h := range handlers {
		atomic.AddInt64(&l.ingested, 1)
		h(event)
	}
	return nil
}

func (l *LocalBroker) Subscribe(ctx context.Context, handler func(event *model.MetricEvent)) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.handlers = append(l.handlers, handler)
	return nil
}

func (l *LocalBroker) Status() string {
	return fmt.Sprintf("Local In-Memory Bus (Published: %d, Dispatched: %d)",
		atomic.LoadInt64(&l.published), atomic.LoadInt64(&l.ingested))
}

func (l *LocalBroker) TotalPublished() int64 {
	return atomic.LoadInt64(&l.published)
}

func (l *LocalBroker) TotalIngested() int64 {
	return atomic.LoadInt64(&l.ingested)
}

func (l *LocalBroker) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.handlers = nil
	return nil
}
