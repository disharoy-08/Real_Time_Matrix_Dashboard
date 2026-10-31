import { HealthStatus, MetricEvent, LoginResponse, Role } from '../types/metrics';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  return res.json();
}

export async function fetchLatestMetrics(): Promise<{ node_id: string; data: Record<string, MetricEvent[]> }> {
  const res = await fetch(`${API_BASE_URL}/api/metrics/latest`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch latest metrics: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchHistory(params: {
  service?: string;
  name?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{
  service?: string;
  name?: string;
  from: string;
  to: string;
  count: number;
  data: MetricEvent[];
}> {
  const query = new URLSearchParams();
  if (params.service) query.set('service', params.service);
  if (params.name) query.set('name', params.name);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.limit) query.set('limit', params.limit.toString());

  const res = await fetch(`${API_BASE_URL}/api/metrics/history?${query.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch history metrics: ${res.statusText}`);
  }
  return res.json();
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(errorBody.error || 'Authentication error');
  }
  return res.json();
}

export async function triggerChaosSpike(params: {
  service: string;
  multiplier: number;
  durationMs: number;
  token?: string;
}): Promise<{ message: string; multiplier: number; duration: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.token) {
    headers['Authorization'] = `Bearer ${params.token}`;
  }

  const res = await fetch(`${API_BASE_URL}/api/chaos/spike`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      service: params.service,
      multiplier: params.multiplier,
      duration_ms: params.durationMs,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Chaos injection failed' }));
    throw new Error(errorBody.error || `HTTP ${res.status}`);
  }
  return res.json();
}
