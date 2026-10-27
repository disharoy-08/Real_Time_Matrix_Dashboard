-- PostgreSQL Migration for SpectraPulse Real-Time Telemetry Platform

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

-- Composite B-Tree indexes as specified in the architecture guide
-- Enables ultra-fast index seek + range scans for bounded historical queries
CREATE INDEX IF NOT EXISTS idx_metric_service_time 
    ON metric_events (service, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_name_time 
    ON metric_events (metric_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_seq_id 
    ON metric_events (seq_id ASC);
