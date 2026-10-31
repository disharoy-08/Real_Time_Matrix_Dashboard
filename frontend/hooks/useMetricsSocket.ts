'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MetricEvent, ConnectionState, PacketDropStats } from '../types/metrics';
import { WS_BASE_URL, fetchHistory } from '../services/metricsApi';

interface UseMetricsSocketOptions {
  services?: string[];
  token?: string;
  maxPointsPerSeries?: number;
  autoRecoverGaps?: boolean;
}

export function useMetricsSocket(options: UseMetricsSocketOptions = {}) {
  const {
    services = [],
    token,
    maxPointsPerSeries = 120,
    autoRecoverGaps = true,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [metricsByService, setMetricsByService] = useState<Record<string, Record<string, MetricEvent[]>>>({});
  const [latestEvents, setLatestEvents] = useState<MetricEvent[]>([]);
  const [eventRate, setEventRate] = useState<number>(0);
  const [activeNode, setActiveNode] = useState<string>('unknown');
  const [lastDisconnectTime, setLastDisconnectTime] = useState<Date | null>(null);

  const [stats, setStats] = useState<PacketDropStats>({
    receivedCount: 0,
    expectedNextSeq: 0,
    missingSeqCount: 0,
    duplicateCount: 0,
    recoveredGapsCount: 0,
    lastSeqId: 0,
    deliveryRatePercent: 100,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastSeqIdRef = useRef<number>(0);
  const eventsInLastSecRef = useRef<number>(0);
  const rateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Rate calculator (events per second)
  useEffect(() => {
    rateIntervalRef.current = setInterval(() => {
      setEventRate(eventsInLastSecRef.current);
      eventsInLastSecRef.current = 0;
    }, 1000);

    return () => {
      if (rateIntervalRef.current) clearInterval(rateIntervalRef.current);
    };
  }, []);

  // Gap recovery routine
  const recoverGaps = useCallback(async (fromTime: Date, toTime: Date) => {
    try {
      const historyRes = await fetchHistory({
        from: fromTime.toISOString(),
        to: toTime.toISOString(),
        limit: 300,
      });

      if (historyRes.data && historyRes.data.length > 0) {
        let newRecovered = 0;
        setMetricsByService((prev) => {
          const next = { ...prev };
          for (const ev of historyRes.data) {
            if (!seenEventIdsRef.current.has(ev.id)) {
              seenEventIdsRef.current.add(ev.id);
              newRecovered++;

              if (!next[ev.service]) next[ev.service] = {};
              if (!next[ev.service][ev.name]) next[ev.service][ev.name] = [];

              const list = [...next[ev.service][ev.name], ev];
              list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              if (list.length > maxPointsPerSeries) {
                list.splice(0, list.length - maxPointsPerSeries);
              }
              next[ev.service][ev.name] = list;
            }
          }
          return next;
        });

        if (newRecovered > 0) {
          setStats((prev) => ({
            ...prev,
            recoveredGapsCount: prev.recoveredGapsCount + newRecovered,
            missingSeqCount: Math.max(0, prev.missingSeqCount - newRecovered),
          }));
        }
      }
    } catch {
      // Background gap recovery error handled silently
    }
  }, [maxPointsPerSeries]);

  // Connect / Reconnect function
  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionState((prev) => (prev === 'disconnected' ? 'connecting' : 'reconnecting'));

    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (services.length > 0) params.set('services', services.join(','));

    const wsUrl = `${WS_BASE_URL}/ws/metrics${params.toString() ? `?${params.toString()}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('connected');
      reconnectAttemptsRef.current = 0;

      // If we were disconnected, recover gaps across the missing time window
      if (lastDisconnectTime && autoRecoverGaps) {
        const now = new Date();
        recoverGaps(lastDisconnectTime, now);
        setLastDisconnectTime(null);
      }

      // If specific services are filtered, send initial subscription
      if (services.length > 0) {
        ws.send(JSON.stringify({ action: 'subscribe', services }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const metric: MetricEvent = JSON.parse(event.data);
        eventsInLastSecRef.current += 1;

        if (metric.node_id) {
          setActiveNode(metric.node_id);
        }

        // Deduplication & sequence continuity tracking
        const isDuplicate = seenEventIdsRef.current.has(metric.id);
        if (!isDuplicate) {
          seenEventIdsRef.current.add(metric.id);
          // Limit memory of seen set to last 10,000 IDs
          if (seenEventIdsRef.current.size > 10000) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length - 6000));
          }
        }

        setStats((prev) => {
          const recCount = prev.receivedCount + 1;
          const dupCount = isDuplicate ? prev.duplicateCount + 1 : prev.duplicateCount;

          let missingSeq = prev.missingSeqCount;
          if (!isDuplicate && prev.lastSeqId > 0 && metric.seq_id > prev.lastSeqId + 1) {
            missingSeq += (metric.seq_id - prev.lastSeqId - 1);
          }

          const lastSeq = Math.max(prev.lastSeqId, metric.seq_id);
          lastSeqIdRef.current = lastSeq;

          const totalExpected = recCount + missingSeq;
          const deliveryRate = totalExpected > 0 ? (recCount / totalExpected) * 100 : 100;

          return {
            receivedCount: recCount,
            expectedNextSeq: lastSeq + 1,
            missingSeqCount: missingSeq,
            duplicateCount: dupCount,
            recoveredGapsCount: prev.recoveredGapsCount,
            lastSeqId: lastSeq,
            deliveryRatePercent: parseFloat(deliveryRate.toFixed(2)),
          };
        });

        // Add to latest events stream (top 15)
        setLatestEvents((prev) => [metric, ...prev.slice(0, 14)]);

        // Append to time-series dictionary
        setMetricsByService((prev) => {
          const serviceObj = prev[metric.service] ? { ...prev[metric.service] } : {};
          const currentSeries = serviceObj[metric.name] ? [...serviceObj[metric.name]] : [];

          // Append point
          currentSeries.push(metric);

          // Bounded window in memory
          if (currentSeries.length > maxPointsPerSeries) {
            currentSeries.splice(0, currentSeries.length - maxPointsPerSeries);
          }

          serviceObj[metric.name] = currentSeries;
          return {
            ...prev,
            [metric.service]: serviceObj,
          };
        });
      } catch {
        // Skip unparseable control packets
      }
    };

    ws.onclose = () => {
      setConnectionState('disconnected');
      setLastDisconnectTime(new Date());
      wsRef.current = null;

      // Exponential backoff with jitter
      const attempts = reconnectAttemptsRef.current;
      const baseDelay = Math.min(1000 * Math.pow(1.5, attempts), 8000);
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;

      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, services, maxPointsPerSeries, autoRecoverGaps, lastDisconnectTime, recoverGaps]);

  // Synchronize dynamic service filter changes over the active websocket
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        services,
      }));
    }
  }, [services]);

  // Mount/Unmount lifecycle
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Manual reconnect trigger
  const manualReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  return {
    connectionState,
    metricsByService,
    latestEvents,
    eventRate,
    activeNode,
    stats,
    manualReconnect,
  };
}
