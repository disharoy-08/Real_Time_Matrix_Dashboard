export type Role = 'viewer' | 'operator' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
}

export interface MetricEvent {
  id: string;
  seq_id: number;
  service: string;
  name: string;
  value: number;
  unit: string;
  node_id: string;
  timestamp: string; // ISO RFC3339 string
}

export interface ClientMessage {
  action: 'subscribe' | 'ping';
  services: string[];
}

export interface HealthStatus {
  status: string;
  node_id: string;
  uptime_seconds: number;
  connected_ws_clients: number;
  total_events_dispatched: number;
  total_events_ingested: number;
  zero_drop_guarantee_active: boolean;
  database_status: string;
  redis_status: string;
  monitored_services: string[];
  meta: Record<string, string>;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface PacketDropStats {
  receivedCount: number;
  expectedNextSeq: number;
  missingSeqCount: number;
  duplicateCount: number;
  recoveredGapsCount: number;
  lastSeqId: number;
  deliveryRatePercent: number;
}
