package storage

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store defines operations for historical metrics persistence and bounded window queries
type Store interface {
	Save(ctx context.Context, event *model.MetricEvent) error
	SaveBatch(ctx context.Context, events []*model.MetricEvent) error
	QueryHistory(ctx context.Context, service, metricName string, from, to time.Time, limit int) ([]*model.MetricEvent, error)
	GetLatest(ctx context.Context) ([]*model.MetricEvent, error)
	Status() string
	Close()
}

// PostgresStore implements Store backed by PostgreSQL
type PostgresStore struct {
	pool *pgxpool.Pool
}

// MemoryStore provides in-memory thread-safe fallback ring buffer
type MemoryStore struct {
	mu     sync.RWMutex
	events []*model.MetricEvent
	maxCap int
	latest map[string]*model.MetricEvent // key: service:name
}

// NewStore initializes a PostgresStore if dbURL is provided and connectable; otherwise falls back to MemoryStore
func NewStore(ctx context.Context, dbURL string) Store {
	if dbURL != "" {
		poolConfig, err := pgxpool.ParseConfig(dbURL)
		if err == nil {
			poolConfig.MaxConns = 25
			poolConfig.MinConns = 5
			poolConfig.MaxConnLifetime = 30 * time.Minute

			pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
			if err == nil {
				// Ping test
				pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
				defer cancel()
				if err := pool.Ping(pingCtx); err == nil {
					log.Printf("[Storage] Connected to PostgreSQL at %s", poolConfig.ConnConfig.Host)
					initSchema(ctx, pool)
					return &PostgresStore{pool: pool}
				}
				pool.Close()
				log.Printf("[Storage] PostgreSQL ping failed, defaulting to MemoryStore: %v", err)
			}
		}
	}

	log.Printf("[Storage] Initializing In-Memory telemetry store (Capacity: 20,000 events)")
	return NewMemoryStore(20000)
}

func initSchema(ctx context.Context, pool *pgxpool.Pool) {
	ddl := `
	CREATE TABLE IF NOT EXISTS metric_events (
		id TEXT PRIMARY KEY,
		seq_id BIGINT NOT NULL,
		service TEXT NOT NULL,
		metric_name TEXT NOT NULL,
		metric_value DOUBLE PRECISION NOT NULL,
		unit TEXT NOT NULL DEFAULT '',
		node_id TEXT NOT NULL DEFAULT '',
		recorded_at TIMESTAMPTZ NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_metric_service_time ON metric_events (service, recorded_at DESC);
	CREATE INDEX IF NOT EXISTS idx_metric_name_time ON metric_events (metric_name, recorded_at DESC);
	CREATE INDEX IF NOT EXISTS idx_metric_seq_id ON metric_events (seq_id ASC);
	`
	_, err := pool.Exec(ctx, ddl)
	if err != nil {
		log.Printf("[Storage] Schema initialization warning: %v", err)
	}
}

// ----------------- PostgreSQL Implementation -----------------

func (p *PostgresStore) Save(ctx context.Context, event *model.MetricEvent) error {
	query := `
		INSERT INTO metric_events (id, seq_id, service, metric_name, metric_value, unit, node_id, recorded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO NOTHING
	`
	_, err := p.pool.Exec(ctx, query,
		event.ID, event.SeqID, event.Service, event.Name, event.Value, event.Unit, event.NodeID, event.Timestamp,
	)
	return err
}

func (p *PostgresStore) SaveBatch(ctx context.Context, events []*model.MetricEvent) error {
	if len(events) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	query := `
		INSERT INTO metric_events (id, seq_id, service, metric_name, metric_value, unit, node_id, recorded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO NOTHING
	`
	for _, e := range events {
		batch.Queue(query, e.ID, e.SeqID, e.Service, e.Name, e.Value, e.Unit, e.NodeID, e.Timestamp)
	}

	br := p.pool.SendBatch(ctx, batch)
	defer br.Close()
	return br.Close()
}

func (p *PostgresStore) QueryHistory(ctx context.Context, service, metricName string, from, to time.Time, limit int) ([]*model.MetricEvent, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}

	query := `
		SELECT id, seq_id, service, metric_name, metric_value, unit, node_id, recorded_at
		FROM metric_events
		WHERE ($1 = '' OR service = $1)
		  AND ($2 = '' OR metric_name = $2)
		  AND recorded_at >= $3 AND recorded_at <= $4
		ORDER BY recorded_at ASC
		LIMIT $5
	`

	rows, err := p.pool.Query(ctx, query, service, metricName, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]*model.MetricEvent, 0, limit)
	for rows.Next() {
		var e model.MetricEvent
		if err := rows.Scan(&e.ID, &e.SeqID, &e.Service, &e.Name, &e.Value, &e.Unit, &e.NodeID, &e.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, &e)
	}
	return results, nil
}

func (p *PostgresStore) GetLatest(ctx context.Context) ([]*model.MetricEvent, error) {
	query := `
		SELECT DISTINCT ON (service, metric_name)
			id, seq_id, service, metric_name, metric_value, unit, node_id, recorded_at
		FROM metric_events
		ORDER BY service, metric_name, recorded_at DESC
	`
	rows, err := p.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]*model.MetricEvent, 0)
	for rows.Next() {
		var e model.MetricEvent
		if err := rows.Scan(&e.ID, &e.SeqID, &e.Service, &e.Name, &e.Value, &e.Unit, &e.NodeID, &e.Timestamp); err != nil {
			return nil, err
		}
		results = append(results, &e)
	}
	return results, nil
}

func (p *PostgresStore) Status() string {
	stat := p.pool.Stat()
	return fmt.Sprintf("PostgreSQL Connected (TotalConns: %d, Idle: %d)", stat.TotalConns(), stat.IdleConns())
}

func (p *PostgresStore) Close() {
	p.pool.Close()
}

// ----------------- In-Memory Fallback Implementation -----------------

func NewMemoryStore(maxCap int) *MemoryStore {
	return &MemoryStore{
		events: make([]*model.MetricEvent, 0, maxCap),
		maxCap: maxCap,
		latest: make(map[string]*model.MetricEvent),
	}
}

func (m *MemoryStore) Save(ctx context.Context, event *model.MetricEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.events) >= m.maxCap {
		// Evict oldest 1000 items
		m.events = m.events[1000:]
	}
	m.events = append(m.events, event)
	key := fmt.Sprintf("%s:%s", event.Service, event.Name)
	m.latest[key] = event
	return nil
}

func (m *MemoryStore) SaveBatch(ctx context.Context, events []*model.MetricEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, e := range events {
		if len(m.events) >= m.maxCap {
			m.events = m.events[1000:]
		}
		m.events = append(m.events, e)
		key := fmt.Sprintf("%s:%s", e.Service, e.Name)
		m.latest[key] = e
	}
	return nil
}

func (m *MemoryStore) QueryHistory(ctx context.Context, service, metricName string, from, to time.Time, limit int) ([]*model.MetricEvent, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if limit <= 0 || limit > 1000 {
		limit = 100
	}

	res := make([]*model.MetricEvent, 0)
	for _, e := range m.events {
		if service != "" && e.Service != service {
			continue
		}
		if metricName != "" && e.Name != metricName {
			continue
		}
		if e.Timestamp.Before(from) || e.Timestamp.After(to) {
			continue
		}
		res = append(res, e)
		if len(res) >= limit {
			break
		}
	}
	return res, nil
}

func (m *MemoryStore) GetLatest(ctx context.Context) ([]*model.MetricEvent, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	res := make([]*model.MetricEvent, 0, len(m.latest))
	for _, e := range m.latest {
		res = append(res, e)
	}
	return res, nil
}

func (m *MemoryStore) Status() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return fmt.Sprintf("In-Memory Store Active (Buffered: %d/%d)", len(m.events), m.maxCap)
}

func (m *MemoryStore) Close() {}
