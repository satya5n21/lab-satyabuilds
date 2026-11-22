import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Camera,
  Trophy,
  Users,
  Server,
  Database,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  Zap,
  TrendingUp,
  Sliders,
  Info,
  ArrowDown,
  ArrowUp,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Sparkles,
  Trash2,
  X,
  GitCompare,
  Radio,
  Gauge,
} from 'lucide-react';

// ============================================================================
// 1. CONSTANTS, CONFIGURATION TYPES & SCENARIO PRESETS
// ============================================================================

/**
 * Workload traffic composition (always sums to 1.0)
 * 70% Cacheable Reads | 20% Synchronous Writes | 10% Background Tasks
 */
const WORKLOAD_SPLIT = {
  reads: 0.7,
  writes: 0.2,
  background: 0.1,
};

const REQUESTS_PER_USER_PER_SEC = 0.25; // 10,000 users => ~2,500 RPS
const WORKER_JOBS_PER_SEC = 20;         // 16 workers => 320 jobs/sec capacity
const DB_HARDWARE_CEILING_QPS = 3200;   // Single primary Postgres instance ceiling
const MAX_QUEUE_BUFFER = 15000;         // Queue backpressure drop ceiling
const MAX_HISTORY_POINTS = 60;          // Rolling 60-second chart window

const DEFAULT_CONFIG = {
  virtualUsers: 1000,
  trafficPattern: 'steady', // 'steady' | 'spike' | 'ramp'
  redisEnabled: false,
  cacheHitRatio: 85,        // percentage 10-99
  queueEnabled: false,
  workerCount: 4,           // 1-32
  dbConnectionPool: 30,     // 5-200
  dbQueryLatencyMs: 50,     // 10-500
};

const SCENARIO_PRESETS = [
  {
    id: 'bare-minimum',
    badge: 'Scenario A',
    name: 'The Bare Minimum',
    tagline: 'Direct-to-DB monolith without caching or async queues.',
    observation:
      'PostgreSQL absorbs every read, write, and synchronous background task. Watch utilization hover near 72%—safe at 1,000 users, but with almost zero headroom for growth.',
    config: {
      virtualUsers: 1000,
      trafficPattern: 'steady',
      redisEnabled: false,
      cacheHitRatio: 85,
      queueEnabled: false,
      workerCount: 4,
      dbConnectionPool: 20,
      dbQueryLatencyMs: 50,
    },
  },
  {
    id: 'add-redis',
    badge: 'Scenario B',
    name: 'Add Redis',
    tagline: '5x more users handled by offloading 85% of reads to Redis.',
    observation:
      'Redis short-circuits hundreds of read requests straight to Response in ~5ms. However, without a Message Queue, synchronous background jobs still strain PostgreSQL.',
    config: {
      virtualUsers: 5000,
      trafficPattern: 'steady',
      redisEnabled: true,
      cacheHitRatio: 85,
      queueEnabled: false,
      workerCount: 4,
      dbConnectionPool: 30,
      dbQueryLatencyMs: 50,
    },
  },
  {
    id: 'distributed',
    badge: 'Scenario C',
    name: 'Distributed Architecture',
    tagline: 'Full 10,000-user scale with Redis, Queue, Workers & tuned DB.',
    observation:
      '90% cache hits bypass Postgres, while async workers smoothly drain background tasks. Notice low P95 latency, 0% errors, and balanced database utilization at 10,000 users.',
    config: {
      virtualUsers: 10000,
      trafficPattern: 'steady',
      redisEnabled: true,
      cacheHitRatio: 90,
      queueEnabled: true,
      workerCount: 16,
      dbConnectionPool: 80,
      dbQueryLatencyMs: 40,
    },
  },
  {
    id: 'db-disaster',
    badge: 'Scenario D',
    name: 'Database Disaster',
    tagline: '10,000 users slamming an uncached, slow, tiny DB pool.',
    observation:
      'A 10-connection pool with 300ms queries caps Postgres at ~33 QPS while 2,500+ RPS flood in. Watch P95 latency spike toward 5,000ms and error bursts cascade at the gateway.',
    config: {
      virtualUsers: 10000,
      trafficPattern: 'steady',
      redisEnabled: false,
      cacheHitRatio: 85,
      queueEnabled: false,
      workerCount: 2,
      dbConnectionPool: 10,
      dbQueryLatencyMs: 300,
    },
  },
];

const INITIAL_METRICS = {
  elapsedSec: 0,
  status: 'IDLE', // 'IDLE' | 'HEALTHY' | 'DEGRADED' | 'OVERLOADED'
  spikeActive: false,
  activeUsers: 1000,
  incomingRps: 0,
  processedRps: 0,
  failedRps: 0,
  avgLatencyMs: 0,
  p95LatencyMs: 0,
  errorRate: 0,
  cacheHitRate: 0,
  cacheHitsPerSec: 0,
  cacheMissesPerSec: 0,
  queueDepth: 0,
  queueEnqueuePerSec: 0,
  queueProcessedPerSec: 0,
  queueDroppedPerSec: 0,
  workerUtilization: 0,
  workerCapacityPerSec: 80,
  dbQps: 0,
  dbDemandQps: 0,
  dbCapacityQps: 600,
  dbUtilization: 0,
  dbActiveConnections: 0,
  dbAvgLatencyMs: 50,
  dbFailedQps: 0,
  // Path traffic breakdown for packet animation
  paths: {
    clientsToGateway: 0,
    gatewayToRedis: 0,
    redisToResponse: 0,
    redisToDb: 0,
    gatewayToDb: 0,
    gatewayToQueue: 0,
    queueToWorkers: 0,
    workersToDb: 0,
    dbToResponse: 0,
    gatewayToResponseAck: 0,
  },
};

// ============================================================================
// 2. PURE SIMULATION ENGINE (DECOUPLED FROM REACT COMPONENTS)
// ============================================================================

/**
 * Clamps a numeric value strictly between min and max, preventing NaN/Infinity.
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Smooth exponential moving average interpolation for natural telemetry transitions.
 */
function smooth(prev, target, factor) {
  if (!Number.isFinite(prev)) return target;
  return prev + (target - prev) * clamp(factor, 0.01, 1);
}

/**
 * Models realistic PostgreSQL connection pool contention.
 * - Scales linearly up to 80 connections.
 * - Diminishing returns from 80 to 120 connections.
 * - Lock & context-switch contention causes slight degradation above 120.
 */
function calculateEffectiveDbProfile(poolSize, baseLatencyMs) {
  const safePool = clamp(poolSize, 5, 200);
  const safeLatency = clamp(baseLatencyMs, 10, 500);

  let effectiveConnections;
  if (safePool <= 80) {
    effectiveConnections = safePool;
  } else if (safePool <= 120) {
    effectiveConnections = 80 + (safePool - 80) * 0.45;
  } else {
    effectiveConnections = 98 - (safePool - 120) * 0.14;
  }

  // Context switching and lock contention slightly raises effective query time above 90 conns
  const contentionMultiplier =
    safePool > 90 ? 1 + ((safePool - 90) / 110) * 0.35 : 1.0;
  const effectiveQueryLatencyMs = safeLatency * contentionMultiplier;

  const rawCapacityQps = effectiveConnections * (1000 / effectiveQueryLatencyMs);
  const maxDbQps = Math.min(DB_HARDWARE_CEILING_QPS, Math.max(5, rawCapacityQps));

  return {
    effectiveConnections,
    effectiveQueryLatencyMs,
    maxDbQps,
    hasContentionPenalty: safePool > 110,
  };
}

/**
 * Computes active virtual users for either Free-Play patterns or Challenge Wave.
 */
function computeActiveUsers(config, elapsedSec, challengeState) {
  // Deterministic gentle organic wave (+/- 2.5%)
  const organicWave =
    1 +
    Math.sin(elapsedSec * 0.7) * 0.018 +
    Math.cos(elapsedSec * 1.9) * 0.01;

  if (challengeState && challengeState.active) {
    const t = elapsedSec;
    let baseUsers = 1500;
    let spikeActive = false;

    if (t < 15) {
      // Phase 1: Warmup & prep (1,200 -> 1,800)
      baseUsers = 1200 + (t / 15) * 600;
    } else if (t < 35) {
      // Phase 2: Aggressive Ramp (1,800 -> 6,500)
      baseUsers = 1800 + ((t - 15) / 20) * 4700;
    } else if (t < 52) {
      // Phase 3: Peak Traffic Spike (10,000 users!)
      const rampIn = Math.min(1, (t - 35) / 2.5);
      baseUsers = 6500 + rampIn * 3500;
      spikeActive = true;
    } else {
      // Phase 4: Recovery cooldown (10,000 -> 3,500)
      const coolProgress = Math.min(1, (t - 52) / 8);
      baseUsers = 10000 - coolProgress * 6500;
    }

    return {
      activeUsers: Math.round(clamp(baseUsers * organicWave, 100, 11000)),
      spikeActive,
    };
  }

  // Standard Free-Play patterns
  const target = clamp(config.virtualUsers, 100, 10000);
  if (config.trafficPattern === 'ramp') {
    // Ramps from 15% up to 100% over 25 seconds
    const progress = clamp(elapsedSec / 25, 0, 1);
    const eased = 0.15 + 0.85 * (progress * progress * (3 - 2 * progress));
    return {
      activeUsers: Math.round(clamp(target * eased * organicWave, 50, 10500)),
      spikeActive: false,
    };
  }

  if (config.trafficPattern === 'spike') {
    // Every 22s cycle: 8 seconds of dramatic ~2.4x surge (up to 12,000 virtual users)
    const cyclePos = elapsedSec % 22;
    const isSpiking = cyclePos >= 8 && cyclePos <= 16;
    let multiplier = 0.85;
    if (isSpiking) {
      // Smooth bell-shaped surge envelope
      const spikeT = (cyclePos - 8) / 8;
      const bell = Math.sin(spikeT * Math.PI);
      multiplier = 0.85 + bell * 1.65;
    }
    return {
      activeUsers: Math.round(clamp(target * multiplier * organicWave, 100, 12000)),
      spikeActive: isSpiking && multiplier > 1.35,
    };
  }

  // Steady traffic
  return {
    activeUsers: Math.round(clamp(target * organicWave, 100, 10500)),
    spikeActive: false,
  };
}

/**
 * Pure simulation step function.
 * Advances backend metrics by `dtSec` seconds given current `prevMetrics` and `config`.
 */
function computeSimulationTick(prevMetrics, config, dtSec, challengeState) {
  const safeDt = clamp(dtSec, 0.05, 1.0);
  const elapsedSec = prevMetrics.elapsedSec + safeDt;

  // 1. Virtual Users & Incoming RPS
  const { activeUsers, spikeActive } = computeActiveUsers(
    config,
    elapsedSec,
    challengeState
  );
  const rawIncomingRps = activeUsers * REQUESTS_PER_USER_PER_SEC;
  const incomingRps = smooth(
    prevMetrics.incomingRps || rawIncomingRps,
    rawIncomingRps,
    0.45
  );

  // Split incoming requests by workload type
  const readRps = incomingRps * WORKLOAD_SPLIT.reads;
  const writeRps = incomingRps * WORKLOAD_SPLIT.writes;
  const bgRps = incomingRps * WORKLOAD_SPLIT.background;

  // 2. Redis Cache Branch
  const hitRatioFraction = clamp(config.cacheHitRatio / 100, 0.1, 0.99);
  const cacheHitsPerSec = config.redisEnabled ? readRps * hitRatioFraction : 0;
  const cacheMissesPerSec = config.redisEnabled
    ? readRps * (1 - hitRatioFraction)
    : readRps;
  const actualCacheHitRate = config.redisEnabled
    ? (cacheHitsPerSec / Math.max(0.001, readRps)) * 100
    : 0;

  // 3. Database Capacity Profile
  const dbProfile = calculateEffectiveDbProfile(
    config.dbConnectionPool,
    config.dbQueryLatencyMs
  );

  // 4. Message Queue & Worker Pool Branch
  const workerCapacityPerSec = config.workerCount * WORKER_JOBS_PER_SEC;
  let queueDepth = prevMetrics.queueDepth;
  let queueEnqueuePerSec = 0;
  let queueProcessedPerSec = 0;
  let queueDroppedPerSec = 0;
  let workerDbDemandQps = 0;
  let syncBgDbDemandQps = 0;
  let workerUtilization = 0;

  // Estimate DB pressure from previous tick to throttle workers slightly when DB is critically overloaded
  const prevDbLoadFactor =
    prevMetrics.dbUtilization > 100
      ? clamp(1 - (prevMetrics.dbUtilization - 100) / 140, 0.3, 1)
      : 1;

  if (config.queueEnabled) {
    queueEnqueuePerSec = bgRps;
    const availableJobs = queueDepth + queueEnqueuePerSec * safeDt;
    const effectiveWorkerThroughput = workerCapacityPerSec * prevDbLoadFactor;
    const jobsDoneThisTick = Math.min(
      availableJobs,
      effectiveWorkerThroughput * safeDt
    );
    queueProcessedPerSec = jobsDoneThisTick / safeDt;

    let nextQueue = Math.max(0, availableJobs - jobsDoneThisTick);
    if (nextQueue > MAX_QUEUE_BUFFER) {
      queueDroppedPerSec = (nextQueue - MAX_QUEUE_BUFFER) / safeDt;
      nextQueue = MAX_QUEUE_BUFFER;
    }
    queueDepth = nextQueue;

    workerUtilization = clamp(
      (queueProcessedPerSec / Math.max(1, workerCapacityPerSec)) * 100,
      0,
      100
    );
    // Each background job executed by a worker produces ~1.0 DB write query
    workerDbDemandQps = queueProcessedPerSec * 1.0;
  } else {
    // Queue OFF: drain any leftover queue quickly and process bg tasks synchronously
    queueDepth = Math.max(0, queueDepth - Math.max(50, queueDepth * 0.4) * safeDt);
    // Synchronous background tasks are heavier (1.6x query work) and block API threads
    syncBgDbDemandQps = bgRps * 1.6;
    workerUtilization = 0;
  }

  // 5. PostgreSQL Demand, Saturation & Latency
  // Sync API queries hitting DB = Cache Misses (or all reads if Redis OFF) + Sync Writes + Sync BG tasks
  const syncApiDbDemandQps = cacheMissesPerSec + writeRps + syncBgDbDemandQps;
  const totalDbDemandQps = syncApiDbDemandQps + workerDbDemandQps;

  const rawDbUtilRatio = totalDbDemandQps / Math.max(1, dbProfile.maxDbQps);
  const dbUtilization = clamp(
    smooth(prevMetrics.dbUtilization, rawDbUtilRatio * 100, 0.35),
    0,
    100
  );

  // Actual DB QPS processed is capped at maxDbQps
  const dbProcessedQps = Math.min(totalDbDemandQps, dbProfile.maxDbQps);
  const dbOverflowQps = Math.max(0, totalDbDemandQps - dbProfile.maxDbQps);

  // Active DB connections scale with utilization up to configured pool size
  const dbActiveConnections = Math.round(
    clamp(
      Math.min(1, rawDbUtilRatio) * config.dbConnectionPool,
      totalDbDemandQps > 0 ? 1 : 0,
      config.dbConnectionPool
    )
  );

  // Nonlinear queueing latency curve for PostgreSQL
  let targetDbLatencyMs;
  if (rawDbUtilRatio <= 0.7) {
    targetDbLatencyMs =
      dbProfile.effectiveQueryLatencyMs * (1 + 0.25 * rawDbUtilRatio);
  } else if (rawDbUtilRatio <= 1.0) {
    const excess = (rawDbUtilRatio - 0.7) / 0.3;
    targetDbLatencyMs =
      dbProfile.effectiveQueryLatencyMs * (1.175 + excess * excess * 3.4);
  } else {
    const overload = Math.min(10, rawDbUtilRatio - 1.0);
    targetDbLatencyMs =
      dbProfile.effectiveQueryLatencyMs * (4.575 + overload * 6.2) +
      Math.min(1800, overload * 420);
  }
  const dbAvgLatencyMs = clamp(
    smooth(
      prevMetrics.dbAvgLatencyMs || targetDbLatencyMs,
      targetDbLatencyMs,
      0.32
    ),
    8,
    5000
  );

  // 6. Failure / Error Rate Model
  // Sync API traffic fails when DB demand exceeds capacity (proportional to DB overflow)
  // Plus timeout errors when DB latency becomes extreme (> 1,400ms)
  const syncDbFailureShare =
    totalDbDemandQps > 0 ? syncApiDbDemandQps / totalDbDemandQps : 0;

  let syncApiFailedRps = dbOverflowQps * syncDbFailureShare;

  // Convert DB-query units back to request units (since syncBg had 1.6x multiplier)
  const syncDbRequestUnits = cacheMissesPerSec + writeRps + (config.queueEnabled ? 0 : bgRps);
  const queryToReqFactor =
    syncApiDbDemandQps > 0 ? syncDbRequestUnits / syncApiDbDemandQps : 1;
  syncApiFailedRps = syncApiFailedRps * queryToReqFactor;

  // Additional timeout failures under severe DB latency (> 1200ms)
  if (dbAvgLatencyMs > 1200) {
    const timeoutFraction = clamp((dbAvgLatencyMs - 1200) / 4800, 0, 0.35);
    const remainingSync = Math.max(0, syncDbRequestUnits - syncApiFailedRps);
    syncApiFailedRps += remainingSync * timeoutFraction;
  }

  // Slight gateway stress errors if total incoming RPS > 3,200 (extreme spike)
  const gatewayOverloadFailed =
    incomingRps > 3200 ? (incomingRps - 3200) * 0.15 : 0;

  const totalFailedRps = clamp(
    syncApiFailedRps + queueDroppedPerSec + gatewayOverloadFailed,
    0,
    incomingRps
  );
  const processedRps = Math.max(0, incomingRps - totalFailedRps);
  const errorRate =
    incomingRps > 0 ? clamp((totalFailedRps / incomingRps) * 100, 0, 100) : 0;

  // 7. End-to-End Average & P95 Latency Model
  const gatewayOverheadMs = 4 + clamp((incomingRps / 3000) * 10, 0, 16);
  const redisPathLatencyMs = gatewayOverheadMs + 2.5 + (incomingRps / 4000) * 3;
  const dbPathLatencyMs = gatewayOverheadMs + dbAvgLatencyMs;
  const syncBgPathLatencyMs =
    gatewayOverheadMs + dbAvgLatencyMs * 1.75 + 28;
  const asyncAckLatencyMs =
    gatewayOverheadMs + 3.5 + clamp((queueDepth / 5000) * 20, 0, 45);

  const fracRedisHit = incomingRps > 0 ? cacheHitsPerSec / incomingRps : 0;
  const fracDbDirect =
    incomingRps > 0 ? (cacheMissesPerSec + writeRps) / incomingRps : 0;
  const fracBg = incomingRps > 0 ? bgRps / incomingRps : 0;

  const rawAvgLatencyMs =
    fracRedisHit * redisPathLatencyMs +
    fracDbDirect * dbPathLatencyMs +
    fracBg * (config.queueEnabled ? asyncAckLatencyMs : syncBgPathLatencyMs);

  // P95 sits in the slow tail of requests actually reaching the slowest active tier
  let rawP95LatencyMs;
  if (!config.queueEnabled && fracBg >= 0.05) {
    // 10% synchronous background tasks dominate the 95th percentile!
    rawP95LatencyMs = syncBgPathLatencyMs * (1.28 + Math.min(0.45, rawDbUtilRatio * 0.28));
  } else if (fracDbDirect >= 0.05) {
    // DB reads/writes dominate P95
    rawP95LatencyMs = dbPathLatencyMs * (1.25 + Math.min(0.5, rawDbUtilRatio * 0.3));
  } else {
    rawP95LatencyMs = redisPathLatencyMs * 1.4;
  }

  const avgLatencyMs = clamp(
    smooth(prevMetrics.avgLatencyMs || rawAvgLatencyMs, rawAvgLatencyMs, 0.32),
    4,
    5000
  );
  const p95LatencyMs = clamp(
    smooth(
      prevMetrics.p95LatencyMs || rawP95LatencyMs,
      Math.max(rawP95LatencyMs, rawAvgLatencyMs * 1.15),
      0.32
    ),
    6,
    5000
  );

  // 8. System Status Classification (Consistent Thresholds)
  let status = 'HEALTHY';
  if (
    errorRate >= 5 ||
    p95LatencyMs >= 1000 ||
    dbUtilization >= 95 ||
    queueDepth >= 2000
  ) {
    status = 'OVERLOADED';
  } else if (
    errorRate >= 1 ||
    p95LatencyMs >= 300 ||
    dbUtilization >= 75 ||
    queueDepth >= 400
  ) {
    status = 'DEGRADED';
  }

  return {
    elapsedSec,
    status,
    spikeActive,
    activeUsers,
    incomingRps,
    processedRps,
    failedRps: totalFailedRps,
    avgLatencyMs,
    p95LatencyMs,
    errorRate,
    cacheHitRate: actualCacheHitRate,
    cacheHitsPerSec,
    cacheMissesPerSec,
    queueDepth,
    queueEnqueuePerSec,
    queueProcessedPerSec,
    queueDroppedPerSec,
    workerUtilization,
    workerCapacityPerSec,
    dbQps: dbProcessedQps,
    dbDemandQps: totalDbDemandQps,
    dbCapacityQps: dbProfile.maxDbQps,
    dbUtilization,
    dbActiveConnections,
    dbAvgLatencyMs,
    dbFailedQps: dbOverflowQps,
    paths: {
      clientsToGateway: incomingRps,
      gatewayToRedis: config.redisEnabled ? readRps : 0,
      redisToResponse: cacheHitsPerSec,
      redisToDb: config.redisEnabled ? cacheMissesPerSec : 0,
      gatewayToDb:
        (config.redisEnabled ? 0 : readRps) +
        writeRps +
        (config.queueEnabled ? 0 : bgRps),
      gatewayToQueue: config.queueEnabled ? bgRps : 0,
      queueToWorkers: config.queueEnabled ? queueProcessedPerSec : 0,
      workersToDb: config.queueEnabled ? workerDbDemandQps : 0,
      dbToResponse: Math.max(0, dbProcessedQps - workerDbDemandQps),
      gatewayToResponseAck: config.queueEnabled ? bgRps : 0,
    },
  };
}

/**
 * Generates prioritized, non-contradictory plain-English engineering insights
 * derived strictly from the live simulation state and configuration.
 */
function generateEngineeringInsights(metrics, config, isRunning) {
  if (!isRunning && metrics.elapsedSec === 0) {
    return [
      {
        severity: 'info',
        title: 'System Ready',
        message:
          'Press START SIMULATION to send virtual traffic through your backend, or pick a Preconfigured Scenario below to inspect real bottlenecks.',
      },
    ];
  }

  const insights = [];
  const dbProfile = calculateEffectiveDbProfile(
    config.dbConnectionPool,
    config.dbQueryLatencyMs
  );

  // Critical Database Bottleneck
  if (metrics.dbUtilization >= 92 || metrics.dbFailedQps > 15) {
    if (!config.redisEnabled) {
      insights.push({
        severity: 'critical',
        title: 'PostgreSQL Overwhelmed by Uncached Reads',
        message:
          'Your database is the primary bottleneck. Redis is disabled, forcing 100% of cacheable reads directly onto PostgreSQL. Enable Redis Cache to shed up to 70% of incoming load.',
      });
    } else if (config.dbQueryLatencyMs >= 150) {
      insights.push({
        severity: 'critical',
        title: 'Slow Queries Starving Throughput',
        message: `Average query time (${config.dbQueryLatencyMs}ms base) is holding connections open too long, capping Postgres at ${Math.round(metrics.dbCapacityQps)} QPS. Optimize query latency or expand cache hit ratio.`,
      });
    } else {
      insights.push({
        severity: 'critical',
        title: 'Database Connection Pool Saturated',
        message: `PostgreSQL is pinned at ${Math.round(metrics.dbUtilization)}% utilization (${metrics.dbActiveConnections}/${config.dbConnectionPool} connections), causing ${metrics.errorRate.toFixed(1)}% request errors. Increase pool size, tune queries, or improve cache hit rate.`,
      });
    }
  } else if (metrics.dbUtilization >= 75) {
    insights.push({
      severity: 'warning',
      title: 'Database Approaching Saturation',
      message: `PostgreSQL is running at ${Math.round(metrics.dbUtilization)}% capacity (${Math.round(metrics.dbQps)} / ${Math.round(metrics.dbCapacityQps)} QPS). Latency is beginning to climb as queries queue for connections.`,
    });
  }

  // Queue Backlog Growing Faster Than Workers
  if (
    config.queueEnabled &&
    (metrics.queueDepth >= 300 ||
      metrics.queueEnqueuePerSec > metrics.workerCapacityPerSec * 1.05)
  ) {
    insights.push({
      severity: metrics.queueDepth >= 1800 ? 'critical' : 'warning',
      title: 'Message Queue Backlog Accumulating',
      message: `Background jobs are arriving at ${Math.round(metrics.queueEnqueuePerSec)}/s while ${config.workerCount} worker${config.workerCount > 1 ? 's' : ''} can drain ${Math.round(metrics.workerCapacityPerSec)}/s. Scale up the Worker Pool to clear ${Math.round(metrics.queueDepth).toLocaleString()} queued jobs.`,
    });
  }

  // Synchronous Background Jobs Hurting P95
  if (!config.queueEnabled && metrics.incomingRps > 150 && metrics.p95LatencyMs > 180) {
    insights.push({
      severity: metrics.p95LatencyMs >= 600 ? 'warning' : 'info',
      title: 'Synchronous Background Work Inflating P95',
      message:
        'Message Queue is OFF, so heavy background tasks block API responses synchronously and compete with reads/writes for database connections. Enable the Message Queue to offload them.',
    });
  }

  // Over-Provisioned DB Connection Pool Contention
  if (dbProfile.hasContentionPenalty && metrics.dbUtilization > 55) {
    insights.push({
      severity: 'warning',
      title: 'Connection Pool Contention Penalty',
      message: `Configuring ${config.dbConnectionPool} connections causes lock & context-switch overhead in PostgreSQL, yielding diminishing returns beyond ~90 connections. Prefer caching or faster queries over oversized pools.`,
    });
  }

  // Traffic Spike Notice
  if (metrics.spikeActive) {
    insights.push({
      severity: metrics.status === 'HEALTHY' ? 'info' : 'warning',
      title: 'Sudden Traffic Surge In Progress',
      message: `Incoming load surged to ${metrics.activeUsers.toLocaleString()} active users (${Math.round(metrics.incomingRps).toLocaleString()} RPS). Watch how your cache and queue absorb the burst.`,
    });
  }

  // Positive Redis Observation (non-contradictory)
  if (config.redisEnabled && metrics.cacheHitsPerSec > 80 && insights.length < 3) {
    insights.push({
      severity: 'healthy',
      title: 'Redis Absorbing Read Traffic',
      message: `Redis is short-circuiting ${Math.round(metrics.cacheHitsPerSec).toLocaleString()} req/s (${metrics.cacheHitRate.toFixed(0)}% hit ratio) directly to Response, dramatically lowering PostgreSQL load.`,
    });
  }

  // Healthy System Confirmation
  if (metrics.status === 'HEALTHY' && insights.every((i) => i.severity === 'healthy' || i.severity === 'info')) {
    insights.unshift({
      severity: 'healthy',
      title: 'Architecture Operating Smoothly',
      message: `Your backend is cleanly serving ${Math.round(metrics.processedRps).toLocaleString()} RPS with ${Math.round(metrics.p95LatencyMs)}ms P95 latency and ${metrics.errorRate.toFixed(2)}% errors. Try increasing virtual users or triggering a Traffic Spike to find the next limit.`,
    });
  }

  return insights.slice(0, 3);
}

/**
 * Evaluates final Challenge Mode score (0–100) and survival verdict.
 */
function evaluateChallengeResult(tracker, finalStatus) {
  const avgP95 =
    tracker.p95Count > 0 ? tracker.p95Sum / tracker.p95Count : 0;
  const avgErrorRate =
    tracker.errorSamples > 0 ? tracker.errorRateSum / tracker.errorSamples : 0;

  // Score components: Reliability (45 pts), Latency (35 pts), Peak Throughput (20 pts)
  const errorScore = clamp(45 - avgErrorRate * 4.2, 0, 45);
  const latencyScore = clamp(35 - Math.max(0, avgP95 - 120) / 38, 0, 35);
  const throughputScore = clamp((tracker.maxProcessedRps / 2300) * 20, 0, 20);

  const totalScore = Math.round(
    clamp(errorScore + latencyScore + throughputScore, 0, 100)
  );

  let grade = 'F';
  if (totalScore >= 90) grade = 'S';
  else if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 45) grade = 'C';

  let verdict = 'FAILED';
  if (totalScore >= 75 && avgErrorRate < 3) verdict = 'SURVIVED';
  else if (totalScore >= 45 && avgErrorRate < 15) verdict = 'PARTIAL';

  return {
    score: totalScore,
    grade,
    verdict,
    maxProcessedRps: Math.round(tracker.maxProcessedRps),
    avgP95LatencyMs: Math.round(avgP95),
    avgErrorRate: Number(avgErrorRate.toFixed(2)),
    totalSimulatedErrors: Math.round(tracker.totalSimulatedErrors),
    finalStatus,
  };
}

// ============================================================================
// 3. HELPER FORMATTERS & STYLING UTILITIES
// ============================================================================

function formatNumber(n, decimals = 0) {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getMetricHealth(type, value) {
  switch (type) {
    case 'latency':
      if (value >= 1000) return 'critical';
      if (value >= 300) return 'warning';
      return 'healthy';
    case 'error':
      if (value >= 5) return 'critical';
      if (value >= 1) return 'warning';
      return 'healthy';
    case 'dbUtil':
      if (value >= 95) return 'critical';
      if (value >= 75) return 'warning';
      return 'healthy';
    case 'queue':
      if (value >= 2000) return 'critical';
      if (value >= 400) return 'warning';
      return 'healthy';
    case 'cache':
      if (value >= 70) return 'healthy';
      if (value >= 30) return 'warning';
      return 'neutral';
    default:
      return 'healthy';
  }
}

const HEALTH_STYLES = {
  healthy: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    bar: 'bg-emerald-500',
  },
  warning: {
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    bar: 'bg-amber-500',
  },
  critical: {
    dot: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-red-500/50',
    bg: 'bg-red-500/10',
    bar: 'bg-red-500',
  },
  neutral: {
    dot: 'bg-slate-500',
    text: 'text-slate-400',
    border: 'border-slate-700/80',
    bg: 'bg-slate-800/40',
    bar: 'bg-sky-500',
  },
};

// ============================================================================
// 4. LIGHTWEIGHT CUSTOM SVG LIVE CHARTS
// ============================================================================

function LiveTelemetryChart({
  title,
  subtitle,
  data,
  series,
  unit,
  minMaxY = 100,
  emptyLabel = undefined,
}) {
  const width = 560;
  const height = 200;
  const pad = { top: 18, right: 16, bottom: 26, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Compute dynamic Y scale ceiling cleanly rounded
  const maxVal = useMemo(() => {
    let peak = minMaxY;
    for (let i = 0; i < data.length; i++) {
      for (let s = 0; s < series.length; s++) {
        const v = data[i][series[s].key] || 0;
        if (v > peak) peak = v;
      }
    }
    // Round up neatly
    if (peak <= 100) return Math.ceil(peak / 20) * 20;
    if (peak <= 500) return Math.ceil(peak / 100) * 100;
    if (peak <= 2000) return Math.ceil(peak / 250) * 250;
    return Math.ceil(peak / 500) * 500;
  }, [data, series, minMaxY]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    val: Math.round(maxVal * f),
    y: pad.top + plotH - f * plotH,
  }));

  const buildPath = (key) => {
    if (data.length < 2) return '';
    const count = Math.max(MAX_HISTORY_POINTS - 1, data.length - 1);
    const offset = MAX_HISTORY_POINTS - data.length;
    return data
      .map((pt, idx) => {
        const x = pad.left + ((idx + offset) / count) * plotW;
        const val = clamp(pt[key] || 0, 0, maxVal);
        const y = pad.top + plotH - (val / maxVal) * plotH;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const buildAreaPath = (key) => {
    if (data.length < 2) return '';
    const line = buildPath(key);
    const count = Math.max(MAX_HISTORY_POINTS - 1, data.length - 1);
    const offset = MAX_HISTORY_POINTS - data.length;
    const firstX = pad.left + (offset / count) * plotW;
    const lastX = pad.left + ((data.length - 1 + offset) / count) * plotW;
    const baseY = pad.top + plotH;
    return `${line} L${lastX.toFixed(1)},${baseY} L${firstX.toFixed(1)},${baseY} Z`;
  };

  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="bg-[#0F172A]/90 border border-slate-800/90 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-slate-400">{s.label}:</span>
              <span className="font-mono font-semibold text-slate-100 tabular-nums">
                {latest ? `${formatNumber(latest[s.key] || 0)}${unit}` : `--`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block select-none"
          role="img"
          aria-label={title}
        >
          <defs>
            {series.map((s) => (
              <linearGradient
                key={`grad-${s.key}`}
                id={`grad-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal Grid Lines & Y Labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                y1={t.y}
                x2={width - pad.right}
                y2={t.y}
                stroke="#1E293B"
                strokeWidth="1"
                strokeDasharray={i === 0 ? 'none' : '3 3'}
              />
              <text
                x={pad.left - 8}
                y={t.y + 3.5}
                textAnchor="end"
                fill="#64748B"
                fontSize="10"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val}
              </text>
            </g>
          ))}

          {/* X Axis Labels (Rolling 60s window) */}
          {[
            { label: '-60s', x: pad.left },
            { label: '-40s', x: pad.left + plotW * 0.333 },
            { label: '-20s', x: pad.left + plotW * 0.666 },
            { label: 'Now', x: pad.left + plotW },
          ].map((tick, i) => (
            <text
              key={i}
              x={tick.x}
              y={height - 6}
              textAnchor={
                i === 0 ? 'start' : i === 3 ? 'end' : 'middle'
              }
              fill="#64748B"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {tick.label}
            </text>
          ))}

          {/* Area Fills + Lines */}
          {data.length >= 2 &&
            series.map((s) => (
              <g key={s.key}>
                {s.fill && (
                  <path
                    d={buildAreaPath(s.key)}
                    fill={`url(#grad-${s.key})`}
                  />
                )}
                <path
                  d={buildPath(s.key)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.dashed ? '1.75' : '2.2'}
                  strokeDasharray={s.dashed ? '5 4' : 'none'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}

          {/* Empty state text */}
          {data.length < 2 && (
            <text
              x={pad.left + plotW / 2}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              fill="#475569"
              fontSize="12"
            >
              {emptyLabel || 'Start the simulation to stream live telemetry...'}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// 5. INFRASTRUCTURE TOPOLOGY VISUALIZER (CANVAS PACKETS + INTERACTIVE NODES)
// ============================================================================

/**
 * Normalized coordinates (0..1) for the 7 infrastructure nodes.
 * Ensures clean non-overlapping topology routing at any desktop or scrollable mobile viewport.
 */
const NODE_LAYOUT = {
  clients:  { x: 0.50, y: 0.09 },
  gateway:  { x: 0.50, y: 0.28 },
  redis:    { x: 0.18, y: 0.52 },
  queue:    { x: 0.82, y: 0.45 },
  workers:  { x: 0.82, y: 0.68 },
  postgres: { x: 0.49, y: 0.72 },
  response: { x: 0.49, y: 0.91 },
};

/**
 * Evaluates a point on a cubic Bezier curve at t in [0, 1].
 */
function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/**
 * Builds the routed Bezier edge list in pixel coordinates for the current canvas size.
 */
function buildTopologyEdges(w, h) {
  const pt = (key, dx = 0, dy = 0) => ({
    x: NODE_LAYOUT[key].x * w + dx,
    y: NODE_LAYOUT[key].y * h + dy,
  });

  return {
    clientsToGateway: {
      p0: pt('clients', 0, 26),
      p1: pt('clients', 0, 52),
      p2: pt('gateway', 0, -52),
      p3: pt('gateway', 0, -30),
    },
    gatewayToRedis: {
      p0: pt('gateway', -68, 12),
      p1: pt('gateway', -170, 28),
      p2: pt('redis', 10, -76),
      p3: pt('redis', 0, -34),
    },
    redisToResponse: {
      p0: pt('redis', -28, 34),
      p1: pt('redis', -55, 160),
      p2: pt('response', -200, 5),
      p3: pt('response', -88, 0),
    },
    redisToDb: {
      p0: pt('redis', 54, 24),
      p1: pt('redis', 115, 76),
      p2: pt('postgres', -135, -18),
      p3: pt('postgres', -88, -6),
    },
    gatewayToDb: {
      p0: pt('gateway', -4, 34),
      p1: pt('gateway', -4, 105),
      p2: pt('postgres', -4, -105),
      p3: pt('postgres', -4, -40),
    },
    gatewayToQueue: {
      p0: pt('gateway', 68, 12),
      p1: pt('gateway', 175, 22),
      p2: pt('queue', -10, -70),
      p3: pt('queue', 0, -34),
    },
    queueToWorkers: {
      p0: pt('queue', 0, 34),
      p1: pt('queue', 0, 58),
      p2: pt('workers', 0, -58),
      p3: pt('workers', 0, -34),
    },
    workersToDb: {
      p0: pt('workers', -78, 10),
      p1: pt('workers', -138, 16),
      p2: pt('postgres', 135, 6),
      p3: pt('postgres', 88, 6),
    },
    dbToResponse: {
      p0: pt('postgres', 0, 38),
      p1: pt('postgres', 0, 56),
      p2: pt('response', 0, -54),
      p3: pt('response', 0, -28),
    },
  };
}

function InfrastructureVisualizer({
  metrics,
  config,
  isRunning,
  simRef,
  configRef,
  isRunningRef,
  selectedNode,
  onSelectNode,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const packetsRef = useRef([]);
  const dropsRef = useRef([]);
  const spawnAccRef = useRef<Record<string, number>>({});
  const sizeRef = useRef({ w: 820, h: 610 });

  // Synchronize canvas backing store with container dimensions via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(680, Math.round(rect.width));
      const h = Math.max(580, Math.round(rect.height));
      sizeRef.current = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 60fps Canvas Animation Loop (reads live refs to avoid React re-render overhead)
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const COLORS = {
      cyan: '#38BDF8',
      green: '#10B981',
      amber: '#F59E0B',
      red: '#EF4444',
      slate: '#334155',
    };

    const drawCurve = (ctx, edge, strokeStyle, lineWidth, dashed = false) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(edge.p0.x, edge.p0.y);
      ctx.bezierCurveTo(
        edge.p1.x,
        edge.p1.y,
        edge.p2.x,
        edge.p2.y,
        edge.p3.x,
        edge.p3.y
      );
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();
    };

    const drawEdgeLabel = (ctx, edge, t, text, color, offsetX = 0, offsetY = 0) => {
      const p = cubicBezier(edge.p0, edge.p1, edge.p2, edge.p3, t);
      ctx.save();
      ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const tw = ctx.measureText(text).width + 10;
      ctx.fillStyle = 'rgba(8, 13, 24, 0.88)';
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.65)';
      ctx.lineWidth = 1;
      const bx = p.x + offsetX - tw / 2;
      const by = p.y + offsetY - 9;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 17, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, p.x + offsetX, p.y + offsetY - 0.5);
      ctx.restore();
    };

    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;

      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(frame);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { w, h } = sizeRef.current;
      const m = simRef.current;
      const cfg = configRef.current;
      const running = isRunningRef.current;

      ctx.clearRect(0, 0, w, h);

      // Subtle technical dot-grid background
      ctx.fillStyle = 'rgba(51, 65, 85, 0.22)';
      const step = 28;
      for (let gx = 14; gx < w; gx += step) {
        for (let gy = 14; gy < h; gy += step) {
          ctx.fillRect(gx, gy, 1.2, 1.2);
        }
      }

      const edges = buildTopologyEdges(w, h);

      // Determine path congestion / health styling
      const dbOverloaded = m.dbUtilization >= 92 || m.errorRate >= 5;
      const dbDegraded = m.dbUtilization >= 75 || m.p95LatencyMs >= 300;
      const queueBackedUp = m.queueDepth >= 400;

      // Draw static/glowing connection pipes
      drawCurve(
        ctx,
        edges.clientsToGateway,
        running ? 'rgba(56, 189, 248, 0.35)' : 'rgba(51, 65, 85, 0.45)',
        2.2
      );

      // Redis branch pipes
      drawCurve(
        ctx,
        edges.gatewayToRedis,
        cfg.redisEnabled
          ? 'rgba(56, 189, 248, 0.32)'
          : 'rgba(51, 65, 85, 0.22)',
        cfg.redisEnabled ? 2 : 1.5,
        !cfg.redisEnabled
      );
      drawCurve(
        ctx,
        edges.redisToResponse,
        cfg.redisEnabled
          ? 'rgba(16, 185, 129, 0.35)'
          : 'rgba(51, 65, 85, 0.16)',
        cfg.redisEnabled ? 2.2 : 1.2,
        !cfg.redisEnabled
      );
      drawCurve(
        ctx,
        edges.redisToDb,
        cfg.redisEnabled
          ? 'rgba(245, 158, 11, 0.28)'
          : 'rgba(51, 65, 85, 0.16)',
        cfg.redisEnabled ? 1.8 : 1.2,
        !cfg.redisEnabled
      );

      // Direct Gateway -> DB center spine
      drawCurve(
        ctx,
        edges.gatewayToDb,
        dbOverloaded
          ? 'rgba(239, 68, 68, 0.42)'
          : dbDegraded
          ? 'rgba(245, 158, 11, 0.36)'
          : 'rgba(56, 189, 248, 0.28)',
        cfg.redisEnabled && cfg.queueEnabled ? 1.8 : 2.5
      );

      // Queue & Worker pipes
      drawCurve(
        ctx,
        edges.gatewayToQueue,
        cfg.queueEnabled
          ? queueBackedUp
            ? 'rgba(245, 158, 11, 0.40)'
            : 'rgba(56, 189, 248, 0.32)'
          : 'rgba(51, 65, 85, 0.22)',
        cfg.queueEnabled ? 2 : 1.5,
        !cfg.queueEnabled
      );
      drawCurve(
        ctx,
        edges.queueToWorkers,
        cfg.queueEnabled
          ? queueBackedUp
            ? 'rgba(245, 158, 11, 0.42)'
            : 'rgba(56, 189, 248, 0.32)'
          : 'rgba(51, 65, 85, 0.22)',
        cfg.queueEnabled ? 2 : 1.5,
        !cfg.queueEnabled
      );
      drawCurve(
        ctx,
        edges.workersToDb,
        cfg.queueEnabled
          ? dbOverloaded
            ? 'rgba(239, 68, 68, 0.35)'
            : 'rgba(56, 189, 248, 0.28)'
          : 'rgba(51, 65, 85, 0.20)',
        cfg.queueEnabled ? 2 : 1.2,
        !cfg.queueEnabled
      );

      // DB -> Response pipe
      drawCurve(
        ctx,
        edges.dbToResponse,
        dbOverloaded
          ? 'rgba(239, 68, 68, 0.45)'
          : 'rgba(16, 185, 129, 0.35)',
        2.2
      );

      // Subtle path annotations
      if (cfg.redisEnabled) {
        drawEdgeLabel(ctx, edges.redisToResponse, 0.48, 'CACHE HIT', '#34D399', -6, 0);
        drawEdgeLabel(ctx, edges.redisToDb, 0.5, 'MISS', '#FBBF24', 0, -2);
      } else {
        drawEdgeLabel(ctx, edges.gatewayToDb, 0.46, 'ALL READS + WRITES', '#94A3B8', 0, 0);
      }
      if (cfg.queueEnabled) {
        drawEdgeLabel(ctx, edges.gatewayToQueue, 0.52, 'ASYNC JOBS', '#38BDF8', 6, -4);
      } else if (cfg.redisEnabled) {
        drawEdgeLabel(ctx, edges.gatewayToDb, 0.46, 'WRITES + SYNC BG', '#FBBF24', 0, 0);
      }

      // Congestion radial pulse aura behind Postgres or Queue when strained
      if (running && (dbOverloaded || dbDegraded)) {
        const pg = {
          x: NODE_LAYOUT.postgres.x * w,
          y: NODE_LAYOUT.postgres.y * h,
        };
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
        const radius = 85 + pulse * 26;
        const grad = ctx.createRadialGradient(pg.x, pg.y, 18, pg.x, pg.y, radius);
        grad.addColorStop(
          0,
          dbOverloaded ? 'rgba(239, 68, 68, 0.28)' : 'rgba(245, 158, 11, 0.18)'
        );
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pg.x, pg.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (running && cfg.queueEnabled && queueBackedUp) {
        const qn = {
          x: NODE_LAYOUT.queue.x * w,
          y: NODE_LAYOUT.queue.y * h,
        };
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        const radius = 75 + pulse * 18;
        const grad = ctx.createRadialGradient(qn.x, qn.y, 16, qn.x, qn.y, radius);
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(qn.x, qn.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spawn new packets proportional to live path RPS (bounded for smooth 60fps)
      if (running && m.incomingRps > 0) {
        const rateToSpawn = (rps, maxSpawnsPerSec) => {
          if (rps <= 1) return 0;
          // Logarithmic scaling so 250 RPS and 2,500 RPS both look informative & fluid
          const norm = Math.log10(rps + 10) / 3.5;
          return clamp(norm * maxSpawnsPerSec, 0.8, maxSpawnsPerSec);
        };

        // Slow down DB-bound packets when database is congested
        const dbSpeedFactor = dbOverloaded ? 0.38 : dbDegraded ? 0.65 : 1.0;

        const spawnSpecs = [
          {
            edgeKey: 'clientsToGateway',
            rate: rateToSpawn(m.paths.clientsToGateway, 11),
            color: m.spikeActive ? COLORS.amber : COLORS.cyan,
            speed: 1.35,
            size: 3.1,
          },
          {
            edgeKey: 'gatewayToRedis',
            rate: cfg.redisEnabled ? rateToSpawn(m.paths.gatewayToRedis, 8) : 0,
            color: COLORS.cyan,
            speed: 1.45,
            size: 2.8,
          },
          {
            edgeKey: 'redisToResponse',
            rate: cfg.redisEnabled ? rateToSpawn(m.paths.redisToResponse, 9) : 0,
            color: COLORS.green,
            speed: 1.55, // Fast cache bypass!
            size: 3.0,
          },
          {
            edgeKey: 'redisToDb',
            rate: cfg.redisEnabled ? rateToSpawn(m.paths.redisToDb, 5.5) : 0,
            color: dbOverloaded ? COLORS.red : COLORS.amber,
            speed: 1.05 * dbSpeedFactor,
            size: 2.6,
          },
          {
            edgeKey: 'gatewayToDb',
            rate: rateToSpawn(m.paths.gatewayToDb, 9),
            color: dbOverloaded
              ? COLORS.red
              : dbDegraded
              ? COLORS.amber
              : COLORS.cyan,
            speed: 1.0 * dbSpeedFactor,
            size: 2.9,
          },
          {
            edgeKey: 'gatewayToQueue',
            rate: cfg.queueEnabled ? rateToSpawn(m.paths.gatewayToQueue, 5.5) : 0,
            color: queueBackedUp ? COLORS.amber : COLORS.cyan,
            speed: 1.15,
            size: 2.7,
          },
          {
            edgeKey: 'queueToWorkers',
            rate: cfg.queueEnabled ? rateToSpawn(m.paths.queueToWorkers, 5.5) : 0,
            color: queueBackedUp ? COLORS.amber : COLORS.cyan,
            speed: queueBackedUp ? 0.72 : 1.2,
            size: 2.7,
          },
          {
            edgeKey: 'workersToDb',
            rate: cfg.queueEnabled ? rateToSpawn(m.paths.workersToDb, 5) : 0,
            color: dbOverloaded ? COLORS.red : COLORS.amber,
            speed: 1.05 * dbSpeedFactor,
            size: 2.6,
          },
          {
            edgeKey: 'dbToResponse',
            rate: rateToSpawn(m.paths.dbToResponse, 8),
            color: m.errorRate >= 8 ? COLORS.red : COLORS.green,
            speed: 1.2 * (dbOverloaded ? 0.65 : 1),
            size: 3.0,
          },
        ];

        for (let i = 0; i < spawnSpecs.length; i++) {
          const spec = spawnSpecs[i];
          if (spec.rate <= 0) continue;
          const prevAcc = spawnAccRef.current[spec.edgeKey] || 0;
          const nextAcc = prevAcc + spec.rate * dt;
          if (nextAcc >= 1) {
            const count = Math.min(2, Math.floor(nextAcc));
            spawnAccRef.current[spec.edgeKey] = nextAcc - count;
            for (let c = 0; c < count; c++) {
              if (packetsRef.current.length < 150) {
                packetsRef.current.push({
                  edgeKey: spec.edgeKey,
                  t: c * 0.08,
                  speed: spec.speed * (0.9 + Math.random() * 0.2),
                  color: spec.color,
                  size: spec.size,
                });
              }
            }
          } else {
            spawnAccRef.current[spec.edgeKey] = nextAcc;
          }
        }

        // Spawn red error drop sparks near Postgres / Gateway when requests fail
        if (m.errorRate >= 0.8) {
          const dropAcc = (spawnAccRef.current._drops || 0) + clamp(m.errorRate * 0.35, 1, 12) * dt;
          if (dropAcc >= 1) {
            spawnAccRef.current._drops = dropAcc - 1;
            const originNode = Math.random() < 0.7 ? 'postgres' : 'gateway';
            const ox = NODE_LAYOUT[originNode].x * w + (Math.random() - 0.5) * 90;
            const oy = NODE_LAYOUT[originNode].y * h + (Math.random() - 0.5) * 26;
            if (dropsRef.current.length < 40) {
              dropsRef.current.push({
                x: ox,
                y: oy,
                vx: (Math.random() - 0.5) * 48,
                vy: 20 + Math.random() * 45,
                life: 1.0,
              });
            }
          } else {
            spawnAccRef.current._drops = dropAcc;
          }
        }
      }

      // Update & draw packets
      const alivePackets = [];
      for (let i = 0; i < packetsRef.current.length; i++) {
        const pk = packetsRef.current[i];
        if (running) {
          pk.t += pk.speed * dt;
        }
        if (pk.t >= 1) continue;
        const edge = edges[pk.edgeKey];
        if (!edge) continue;

        const pos = cubicBezier(edge.p0, edge.p1, edge.p2, edge.p3, pk.t);

        // Soft glowing halo
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pk.size * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = `${pk.color}33`;
        ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pk.size, 0, Math.PI * 2);
        ctx.fillStyle = pk.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pk.size * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.restore();

        alivePackets.push(pk);
      }
      packetsRef.current = alivePackets;

      // Update & draw red error drop particles
      const aliveDrops = [];
      for (let i = 0; i < dropsRef.current.length; i++) {
        const d = dropsRef.current[i];
        if (running) {
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.life -= dt * 1.45;
        }
        if (d.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = clamp(d.life, 0, 1);
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(d.x - 3, d.y - 3);
        ctx.lineTo(d.x + 3, d.y + 3);
        ctx.moveTo(d.x + 3, d.y - 3);
        ctx.lineTo(d.x - 3, d.y + 3);
        ctx.stroke();
        ctx.restore();
        aliveDrops.push(d);
      }
      dropsRef.current = aliveDrops;

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [simRef, configRef, isRunningRef]);

  // Clear packets cleanly when reset to idle
  useEffect(() => {
    if (!isRunning && metrics.elapsedSec === 0) {
      packetsRef.current = [];
      dropsRef.current = [];
    }
  }, [isRunning, metrics.elapsedSec]);

  // Derived per-node health statuses
  const gatewayStatus =
    metrics.errorRate >= 5
      ? 'critical'
      : metrics.errorRate >= 1 || metrics.p95LatencyMs >= 300
      ? 'warning'
      : isRunning
      ? 'healthy'
      : 'neutral';

  const dbStatus = !isRunning && metrics.elapsedSec === 0
    ? 'neutral'
    : getMetricHealth('dbUtil', metrics.dbUtilization);

  const queueStatus = !config.queueEnabled
    ? 'neutral'
    : getMetricHealth('queue', metrics.queueDepth);

  const workerStatus = !config.queueEnabled
    ? 'neutral'
    : metrics.workerUtilization >= 92
    ? 'warning'
    : 'healthy';

  const responseStatus = !isRunning && metrics.elapsedSec === 0
    ? 'neutral'
    : metrics.errorRate >= 5 || metrics.p95LatencyMs >= 1000
    ? 'critical'
    : metrics.errorRate >= 1 || metrics.p95LatencyMs >= 300
    ? 'warning'
    : 'healthy';

  const nodeCardClass = (nodeId, state, dimmed = false) => {
    const isSelected = selectedNode === nodeId;
    const borderByState =
      state === 'critical'
        ? 'border-red-500/75 shadow-[0_0_24px_rgba(239,68,68,0.22)]'
        : state === 'warning'
        ? 'border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.16)]'
        : state === 'healthy'
        ? 'border-slate-700/90 hover:border-sky-500/60 shadow-[0_0_16px_rgba(56,189,248,0.08)]'
        : 'border-slate-800/90 hover:border-slate-700';

    return `absolute -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#0D1526]/95 backdrop-blur-sm border transition-all duration-200 cursor-pointer select-none text-left ${borderByState} ${
      isSelected ? 'ring-2 ring-sky-400/80 border-sky-400' : ''
    } ${dimmed ? 'opacity-45 border-dashed' : 'opacity-100'}`;
  };

  // Details panel copy for clicked node
  const selectedDetails = useMemo(() => {
    switch (selectedNode) {
      case 'clients':
        return {
          title: 'Virtual Users / Traffic Generator',
          desc: `Simulating ${formatNumber(metrics.activeUsers)} concurrent users sending ${formatNumber(metrics.incomingRps, 0)} req/s (${config.trafficPattern} pattern). Workload split: 70% reads, 20% writes, 10% background jobs.`,
        };
      case 'gateway':
        return {
          title: 'API Gateway',
          desc: `Routes incoming requests to Redis, Message Queue, or PostgreSQL. Currently processing ${formatNumber(metrics.processedRps, 0)} req/s with ${formatNumber(metrics.failedRps, 0)} req/s failing.`,
        };
      case 'redis':
        return {
          title: 'Redis Cache Layer',
          desc: config.redisEnabled
            ? `Active at ${config.cacheHitRatio}% configured hit ratio. Serving ${formatNumber(metrics.cacheHitsPerSec, 0)} hits/s in ~5ms while forwarding ${formatNumber(metrics.cacheMissesPerSec, 0)} misses/s to PostgreSQL.`
            : 'Bypassed (OFF). All cacheable read requests travel straight through the API Gateway into PostgreSQL.',
        };
      case 'queue':
        return {
          title: 'Message Queue (RabbitMQ / PubSub)',
          desc: config.queueEnabled
            ? `Buffering asynchronous background tasks (${formatNumber(metrics.queueEnqueuePerSec, 0)} in/s, ${formatNumber(metrics.queueProcessedPerSec, 0)} out/s). Current depth: ${formatNumber(metrics.queueDepth, 0)} pending jobs.`
            : 'Bypassed (OFF). Background jobs execute synchronously inside API requests, adding heavy DB load and P95 latency.',
        };
      case 'workers':
        return {
          title: 'Background Worker Pool',
          desc: config.queueEnabled
            ? `${config.workerCount} active worker${config.workerCount > 1 ? 's' : ''} (${formatNumber(metrics.workerCapacityPerSec)} jobs/s max capacity) at ${Math.round(metrics.workerUtilization)}% utilization, writing completed work to PostgreSQL.`
            : `Idle because Message Queue is disabled (${config.workerCount} workers configured on standby).`,
        };
      case 'postgres':
        return {
          title: 'PostgreSQL Primary Database',
          desc: `Handling ${formatNumber(metrics.dbQps, 0)} / ${formatNumber(metrics.dbCapacityQps, 0)} max QPS (${Math.round(metrics.dbUtilization)}% utilization). Using ${metrics.dbActiveConnections}/${config.dbConnectionPool} pool connections with ${Math.round(metrics.dbAvgLatencyMs)}ms avg query time.`,
        };
      case 'response':
        return {
          title: 'Client Response Aggregator',
          desc: `Delivering ${formatNumber(metrics.processedRps, 0)} successful responses/s at ${Math.round(metrics.p95LatencyMs)}ms P95 latency (${metrics.errorRate.toFixed(2)}% error rate).`,
        };
      default:
        return null;
    }
  }, [selectedNode, metrics, config]);

  return (
    <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden flex flex-col">
      {/* Visualizer Header Bar */}
      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 bg-[#0F172A]/70">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Live Infrastructure Topology
          </h2>
          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
            · Click any node to inspect
          </span>
        </div>

        {/* Packet Color Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38BDF8]" />
            Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]" />
            Success / Hit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#F59E0B]" />
            Queued / Delayed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#EF4444]" />
            Failed
          </span>
        </div>
      </div>

      {/* Horizontally scrollable wrapper for mobile usability without tangled lines */}
      <div className="overflow-x-auto">
        <div
          ref={containerRef}
          className="relative w-full min-w-[700px] h-[610px] bg-[#080D18]"
        >
          {/* Animated Canvas Layer */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* NODE 1: CLIENTS */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'clients' ? null : 'clients')}
            style={{
              left: `${NODE_LAYOUT.clients.x * 100}%`,
              top: `${NODE_LAYOUT.clients.y * 100}%`,
            }}
            className={`${nodeCardClass('clients', metrics.spikeActive ? 'warning' : isRunning ? 'healthy' : 'neutral')} w-[224px] px-3 py-2`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  Virtual Users
                </span>
              </div>
              {metrics.spikeActive ? (
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                  SPIKE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-mono text-sky-400">
                  <Radio className={`w-3 h-3 ${isRunning ? 'animate-pulse' : ''}`} />
                  {config.trafficPattern.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-100 font-semibold">
                {formatNumber(metrics.activeUsers)} <span className="text-slate-400 font-normal text-[10px]">users</span>
              </span>
              <span className="text-sky-400 font-semibold">
                {formatNumber(metrics.incomingRps)} <span className="text-[10px] text-slate-400">req/s</span>
              </span>
            </div>
          </button>

          {/* NODE 2: API GATEWAY */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'gateway' ? null : 'gateway')}
            style={{
              left: `${NODE_LAYOUT.gateway.x * 100}%`,
              top: `${NODE_LAYOUT.gateway.y * 100}%`,
            }}
            className={`${nodeCardClass('gateway', gatewayStatus)} w-[236px] px-3 py-2.5`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  API Gateway
                </span>
              </div>
              <span className={`w-2 h-2 rounded-full ${HEALTH_STYLES[gatewayStatus].dot}`} />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono tabular-nums">
              <div className="bg-slate-900/90 rounded px-1.5 py-1 border border-slate-800/80">
                <div className="text-slate-500 text-[9px]">IN</div>
                <div className="text-sky-300 font-semibold">{formatNumber(metrics.incomingRps)}</div>
              </div>
              <div className="bg-slate-900/90 rounded px-1.5 py-1 border border-slate-800/80">
                <div className="text-slate-500 text-[9px]">OK</div>
                <div className="text-emerald-400 font-semibold">{formatNumber(metrics.processedRps)}</div>
              </div>
              <div className="bg-slate-900/90 rounded px-1.5 py-1 border border-slate-800/80">
                <div className="text-slate-500 text-[9px]">FAIL</div>
                <div className={metrics.failedRps >= 1 ? 'text-red-400 font-semibold' : 'text-slate-400'}>
                  {formatNumber(metrics.failedRps)}
                </div>
              </div>
            </div>
          </button>

          {/* NODE 3: REDIS CACHE */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'redis' ? null : 'redis')}
            style={{
              left: `${NODE_LAYOUT.redis.x * 100}%`,
              top: `${NODE_LAYOUT.redis.y * 100}%`,
            }}
            className={`${nodeCardClass(
              'redis',
              config.redisEnabled ? (isRunning ? 'healthy' : 'neutral') : 'neutral',
              !config.redisEnabled
            )} w-[184px] px-3 py-2.5`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Zap className={`w-3.5 h-3.5 ${config.redisEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  Redis Cache
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                  config.redisEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {config.redisEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            {config.redisEnabled ? (
              <div className="space-y-1 text-[10px] font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-400">Hits / Miss</span>
                  <span>
                    <span className="text-emerald-400 font-semibold">{formatNumber(metrics.cacheHitsPerSec)}</span>
                    <span className="text-slate-600"> / </span>
                    <span className="text-amber-400">{formatNumber(metrics.cacheMissesPerSec)}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hit Ratio</span>
                  <span className="text-emerald-300 font-semibold">{config.cacheHitRatio}%</span>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 font-mono">
                Bypassed · Reads → DB
              </div>
            )}
          </button>

          {/* NODE 4: MESSAGE QUEUE */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'queue' ? null : 'queue')}
            style={{
              left: `${NODE_LAYOUT.queue.x * 100}%`,
              top: `${NODE_LAYOUT.queue.y * 100}%`,
            }}
            className={`${nodeCardClass('queue', queueStatus, !config.queueEnabled)} w-[186px] px-3 py-2.5`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Layers className={`w-3.5 h-3.5 ${config.queueEnabled ? 'text-sky-400' : 'text-slate-500'}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  Message Queue
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                  config.queueEnabled
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {config.queueEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            {config.queueEnabled ? (
              <div className="space-y-1 text-[10px] font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pending</span>
                  <span className={`font-semibold ${HEALTH_STYLES[queueStatus].text}`}>
                    {formatNumber(metrics.queueDepth)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Throughput</span>
                  <span className="text-sky-300">{formatNumber(metrics.queueProcessedPerSec)}/s</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${HEALTH_STYLES[queueStatus].bar}`}
                    style={{ width: `${clamp((metrics.queueDepth / 2500) * 100, 2, 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 font-mono">
                Disabled · Sync BG mode
              </div>
            )}
          </button>

          {/* NODE 5: WORKER POOL */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'workers' ? null : 'workers')}
            style={{
              left: `${NODE_LAYOUT.workers.x * 100}%`,
              top: `${NODE_LAYOUT.workers.y * 100}%`,
            }}
            className={`${nodeCardClass('workers', workerStatus, !config.queueEnabled)} w-[186px] px-3 py-2.5`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Cpu className={`w-3.5 h-3.5 ${config.queueEnabled ? 'text-sky-400' : 'text-slate-500'}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  Worker Pool
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-300 font-semibold">
                {config.workerCount}×
              </span>
            </div>
            <div className="space-y-1 text-[10px] font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-400">Util / Cap</span>
                <span className="text-slate-200">
                  {Math.round(metrics.workerUtilization)}% · {formatNumber(metrics.workerCapacityPerSec)}/s
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    metrics.workerUtilization >= 92 ? 'bg-amber-400' : 'bg-sky-400'
                  }`}
                  style={{ width: `${clamp(metrics.workerUtilization, 0, 100)}%` }}
                />
              </div>
            </div>
          </button>

          {/* NODE 6: POSTGRESQL DATABASE */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'postgres' ? null : 'postgres')}
            style={{
              left: `${NODE_LAYOUT.postgres.x * 100}%`,
              top: `${NODE_LAYOUT.postgres.y * 100}%`,
            }}
            className={`${nodeCardClass('postgres', dbStatus)} w-[224px] px-3 py-2.5`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Database className={`w-3.5 h-3.5 ${HEALTH_STYLES[dbStatus].text}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
                  PostgreSQL
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${HEALTH_STYLES[dbStatus].bg} ${HEALTH_STYLES[dbStatus].text} border ${HEALTH_STYLES[dbStatus].border}`}
              >
                {Math.round(metrics.dbUtilization)}% LOAD
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono tabular-nums mb-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">QPS</span>
                <span className="text-slate-100 font-semibold">{formatNumber(metrics.dbQps)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Query</span>
                <span className={dbStatus === 'critical' ? 'text-red-400 font-semibold' : 'text-slate-200'}>
                  {Math.round(metrics.dbAvgLatencyMs)}ms
                </span>
              </div>
              <div className="col-span-2 flex justify-between">
                <span className="text-slate-400">Conn Pool</span>
                <span className="text-slate-200">
                  {metrics.dbActiveConnections} / {config.dbConnectionPool} conns
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${HEALTH_STYLES[dbStatus].bar}`}
                style={{ width: `${clamp(metrics.dbUtilization, 0, 100)}%` }}
              />
            </div>
          </button>

          {/* NODE 7: RESPONSE */}
          <button
            type="button"
            onClick={() => onSelectNode(selectedNode === 'response' ? null : 'response')}
            style={{
              left: `${NODE_LAYOUT.response.x * 100}%`,
              top: `${NODE_LAYOUT.response.y * 100}%`,
            }}
            className={`${nodeCardClass('response', responseStatus)} w-[224px] px-3 py-2`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={`w-3.5 h-3.5 ${HEALTH_STYLES[responseStatus].text}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  Response
                </span>
              </div>
              <span className={`text-[10px] font-mono font-semibold ${HEALTH_STYLES[responseStatus].text}`}>
                P95 {Math.round(metrics.p95LatencyMs)}ms
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
              <span className="text-emerald-400">
                ✓ {formatNumber(metrics.processedRps)}/s
              </span>
              <span className={metrics.failedRps >= 1 ? 'text-red-400 font-semibold' : 'text-slate-500'}>
                ✕ {formatNumber(metrics.failedRps)}/s
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Selected Node Live Inspector Footer */}
      {selectedDetails && (
        <div className="px-4 py-2.5 bg-[#0F172A] border-t border-slate-800 flex items-start justify-between gap-3">
          <div className="text-xs">
            <span className="font-semibold text-sky-400 mr-2">
              {selectedDetails.title}:
            </span>
            <span className="text-slate-300">{selectedDetails.desc}</span>
          </div>
          <button
            type="button"
            onClick={() => onSelectNode(null)}
            className="text-slate-500 hover:text-slate-200 p-0.5 shrink-0"
            aria-label="Close inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6. INTERACTIVE INFRASTRUCTURE CONTROLS PANEL
// ============================================================================

function ControlTooltip({ text }) {
  return (
    <span className="relative group inline-flex items-center ml-1 cursor-help">
      <Info className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 transition-colors" />
      <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] leading-snug text-slate-200 shadow-xl z-30">
        {text}
      </span>
    </span>
  );
}

function ControlsPanel({
  config,
  metrics,
  onChange,
  challengeActive,
  activeScenarioId,
}) {
  const dbProfile = useMemo(
    () =>
      calculateEffectiveDbProfile(
        config.dbConnectionPool,
        config.dbQueryLatencyMs
      ),
    [config.dbConnectionPool, config.dbQueryLatencyMs]
  );

  return (
    <div className="bg-[#0F172A]/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Infrastructure Controls
          </h2>
        </div>
        {activeScenarioId && !challengeActive && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
            Preset Active
          </span>
        )}
        {challengeActive && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Live Tuning
          </span>
        )}
      </div>

      {/* Control 1: Virtual Users */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300 flex items-center">
            Virtual Users
            <ControlTooltip text="Simulated concurrent users sending API requests. 10,000 users generate ~2,500 requests/sec." />
          </label>
          <span className="font-mono text-sm font-bold text-sky-400 tabular-nums">
            {formatNumber(challengeActive ? metrics.activeUsers : config.virtualUsers)}
          </span>
        </div>
        <input
          type="range"
          min={100}
          max={10000}
          step={100}
          disabled={challengeActive}
          value={challengeActive ? clamp(metrics.activeUsers, 100, 10000) : config.virtualUsers}
          onChange={(e) => onChange({ virtualUsers: Number(e.target.value) })}
          className="w-full accent-sky-400 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>100</span>
          <span>{challengeActive ? 'Controlled by Challenge Wave' : '5,000'}</span>
          <span>10,000</span>
        </div>
      </div>

      {/* Control 2: Traffic Pattern */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-300 flex items-center">
          Traffic Pattern
          <ControlTooltip text="Controls how incoming traffic arrives over time: constant load, periodic 2.4x bursts, or a 25-second ramp." />
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'steady', label: 'Steady' },
            { id: 'spike', label: 'Spike' },
            { id: 'ramp', label: 'Ramp-up' },
          ].map((opt) => {
            const active = !challengeActive && config.trafficPattern === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={challengeActive}
                onClick={() => onChange({ trafficPattern: opt.id })}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all border ${
                  active
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-[0_0_12px_rgba(56,189,248,0.12)]'
                    : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                } disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-slate-800/80" />

      {/* Control 3: Redis Cache Toggle + Hit Ratio */}
      <div className="space-y-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${config.redisEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span className="text-xs font-semibold text-slate-200">Redis Cache</span>
            <ControlTooltip text="Serves cacheable reads in ~5ms without touching PostgreSQL. Dramatically reduces DB load." />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.redisEnabled}
            onClick={() => onChange({ redisEnabled: !config.redisEnabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.redisEnabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.redisEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {config.redisEnabled ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Cache Hit Ratio</span>
              <span className="font-mono font-semibold text-emerald-400">
                {config.cacheHitRatio}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={99}
              step={1}
              value={config.cacheHitRatio}
              onChange={(e) => onChange({ cacheHitRatio: Number(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-0.5">
              <span>Hits: <strong className="text-emerald-400">{formatNumber(metrics.cacheHitsPerSec)}/s</strong></span>
              <span>Misses: <strong className="text-amber-400">{formatNumber(metrics.cacheMissesPerSec)}/s</strong></span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 leading-snug">
            Disabled — 100% of cacheable reads hit PostgreSQL directly.
          </p>
        )}
      </div>

      {/* Control 4: Message Queue Toggle */}
      <div className="space-y-1.5 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Layers className={`w-3.5 h-3.5 mr-1.5 ${config.queueEnabled ? 'text-sky-400' : 'text-slate-500'}`} />
            <span className="text-xs font-semibold text-slate-200">Message Queue</span>
            <ControlTooltip text="Decouples background tasks from API requests. When OFF, background work runs synchronously and inflates P95 latency." />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.queueEnabled}
            onClick={() => onChange({ queueEnabled: !config.queueEnabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.queueEnabled ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.queueEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          {config.queueEnabled
            ? 'Async enabled — API acknowledges fast; workers process queued jobs.'
            : 'Disabled — background jobs block API responses synchronously.'}
        </p>
      </div>

      {/* Control 5: Worker Pool */}
      <div className={`space-y-1.5 transition-opacity ${config.queueEnabled ? 'opacity-100' : 'opacity-55'}`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300 flex items-center">
            Worker Pool
            <ControlTooltip text="Consumes jobs from the Message Queue (20 jobs/s per worker). More workers clear queues faster but add DB write load." />
          </label>
          <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
            {config.workerCount} workers{' '}
            <span className="text-slate-500">({config.workerCount * WORKER_JOBS_PER_SEC}/s)</span>
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={32}
          step={1}
          value={config.workerCount}
          onChange={(e) => onChange({ workerCount: Number(e.target.value) })}
          className="w-full accent-sky-400 cursor-pointer"
        />
      </div>

      {/* Control 6: DB Connection Pool */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300 flex items-center">
            DB Connection Pool
            <ControlTooltip text="Max concurrent Postgres queries. Scales well up to ~80 connections; above ~110, lock contention causes diminishing returns." />
          </label>
          <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
            {config.dbConnectionPool} conns
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={200}
          step={5}
          value={config.dbConnectionPool}
          onChange={(e) => onChange({ dbConnectionPool: Number(e.target.value) })}
          className="w-full accent-sky-400 cursor-pointer"
        />
        {dbProfile.hasContentionPenalty && (
          <p className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            High pool size (&gt;110) introducing lock contention
          </p>
        )}
      </div>

      {/* Control 7: DB Query Latency */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300 flex items-center">
            DB Query Latency
            <ControlTooltip text="Baseline SQL execution time. Slower queries hold pool connections longer and shrink max sustainable QPS." />
          </label>
          <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
            {config.dbQueryLatencyMs} ms
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={500}
          step={10}
          value={config.dbQueryLatencyMs}
          onChange={(e) => onChange({ dbQueryLatencyMs: Number(e.target.value) })}
          className="w-full accent-sky-400 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>10ms (Indexed)</span>
          <span>Est. Cap: {formatNumber(dbProfile.maxDbQps)} QPS</span>
          <span>500ms (Full Scan)</span>
        </div>
      </div>

      {/* Workload Mix Legend */}
      <div className="mt-auto pt-3 border-t border-slate-800/80">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
          Simulated Workload Mix
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-800 mb-1.5">
          <div className="bg-emerald-500/80 h-full" style={{ width: '70%' }} />
          <div className="bg-sky-500/80 h-full" style={{ width: '20%' }} />
          <div className="bg-amber-500/80 h-full" style={{ width: '10%' }} />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span>70% Reads</span>
          <span>20% Writes</span>
          <span>10% BG Tasks</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 7. BEFORE / AFTER SNAPSHOT COMPARISON PANEL
// ============================================================================

function SnapshotComparisonPanel({
  baseline,
  afterSnapshot,
  liveMetrics,
  onCaptureBaseline,
  onCaptureAfter,
  onClear,
}) {
  const compareTarget = afterSnapshot ? afterSnapshot.metrics : liveMetrics;
  const compareLabel = afterSnapshot
    ? `Snapshot B (${afterSnapshot.label})`
    : 'Live Telemetry';

  const rows = [
    {
      label: 'Processed Throughput',
      unit: ' req/s',
      before: baseline ? baseline.metrics.processedRps : 0,
      after: compareTarget.processedRps,
      higherIsBetter: true,
      decimals: 0,
    },
    {
      label: 'P95 Latency',
      unit: ' ms',
      before: baseline ? baseline.metrics.p95LatencyMs : 0,
      after: compareTarget.p95LatencyMs,
      higherIsBetter: false,
      decimals: 0,
    },
    {
      label: 'Error Rate',
      unit: '%',
      before: baseline ? baseline.metrics.errorRate : 0,
      after: compareTarget.errorRate,
      higherIsBetter: false,
      decimals: 2,
    },
    {
      label: 'DB Utilization',
      unit: '%',
      before: baseline ? baseline.metrics.dbUtilization : 0,
      after: compareTarget.dbUtilization,
      higherIsBetter: false,
      decimals: 0,
    },
    {
      label: 'Queue Depth',
      unit: ' jobs',
      before: baseline ? baseline.metrics.queueDepth : 0,
      after: compareTarget.queueDepth,
      higherIsBetter: false,
      decimals: 0,
    },
  ];

  return (
    <div className="bg-[#0F172A]/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Before / After Performance Snapshot
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {!baseline ? (
            <button
              type="button"
              onClick={onCaptureBaseline}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/15 text-sky-300 border border-sky-500/35 hover:bg-sky-500/25 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Capture Baseline
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCaptureAfter}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:border-sky-500/50 transition-colors"
              >
                <Camera className="w-3.5 h-3.5 text-sky-400" />
                {afterSnapshot ? 'Update Snapshot B' : 'Freeze After'}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-slate-400 border border-slate-800 hover:text-red-400 hover:border-red-500/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {!baseline ? (
        <div className="rounded-xl bg-[#080D18] border border-dashed border-slate-800 p-5 text-center">
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Run a baseline configuration (for example, <strong className="text-slate-200">Scenario A</strong>), click{' '}
            <strong className="text-sky-300">Capture Baseline</strong>, then enable Redis or the Message Queue to measure exact throughput, latency, and error deltas in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Baseline summary strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono bg-[#080D18] border border-slate-800/80 rounded-lg px-3 py-2 text-slate-400">
            <span>
              <strong className="text-slate-200">Baseline ({baseline.label}):</strong>{' '}
              {formatNumber(baseline.config.virtualUsers)} users · Redis{' '}
              {baseline.config.redisEnabled ? `${baseline.config.cacheHitRatio}%` : 'OFF'} · Queue{' '}
              {baseline.config.queueEnabled ? `${baseline.config.workerCount}w` : 'OFF'} ·{' '}
              {baseline.config.dbConnectionPool}c/{baseline.config.dbQueryLatencyMs}ms
            </span>
            <span className="text-sky-400">Comparing vs: {compareLabel}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium">Metric</th>
                  <th className="pb-2 font-medium text-right">Baseline</th>
                  <th className="pb-2 font-medium text-right">{compareLabel}</th>
                  <th className="pb-2 font-medium text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                {rows.map((r) => {
                  const diff = r.after - r.before;
                  const absDiff = Math.abs(diff);
                  const insignificant = absDiff < (r.decimals === 2 ? 0.05 : 1);
                  const improved = r.higherIsBetter ? diff > 0 : diff < 0;
                  const pct =
                    r.before > 0.5
                      ? `${diff > 0 ? '+' : ''}${Math.round((diff / r.before) * 100)}%`
                      : null;

                  return (
                    <tr key={r.label}>
                      <td className="py-2 font-sans text-slate-300 font-medium">
                        {r.label}
                      </td>
                      <td className="py-2 text-right text-slate-400">
                        {formatNumber(r.before, r.decimals)}
                        {r.unit}
                      </td>
                      <td className="py-2 text-right text-slate-100 font-semibold">
                        {formatNumber(r.after, r.decimals)}
                        {r.unit}
                      </td>
                      <td className="py-2 text-right">
                        {insignificant ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              improved
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {diff > 0 ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : (
                              <ArrowDown className="w-3 h-3" />
                            )}
                            {diff > 0 ? '+' : ''}
                            {formatNumber(diff, r.decimals)}
                            {r.unit}
                            {pct ? ` (${pct})` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 8. CHALLENGE MODE RESULTS MODAL
// ============================================================================

function ChallengeResultsModal({ result, onRetry, onExit }) {
  if (!result) return null;

  const badgeStyles =
    result.verdict === 'SURVIVED'
      ? {
          icon: ShieldCheck,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/15 border-emerald-500/40',
          title: 'TRAFFIC SURVIVED',
          subtitle: 'Your backend absorbed the 10,000-user wave cleanly.',
        }
      : result.verdict === 'PARTIAL'
      ? {
          icon: ShieldAlert,
          color: 'text-amber-400',
          bg: 'bg-amber-500/15 border-amber-500/40',
          title: 'BARELY SURVIVED',
          subtitle: 'Your infrastructure bent under pressure with noticeable degradation.',
        }
      : {
          icon: XOctagon,
          color: 'text-red-400',
          bg: 'bg-red-500/15 border-red-500/40',
          title: 'BACKEND COLLAPSED',
          subtitle: 'The traffic spike overwhelmed your architecture. Tune Redis, Queue & DB pool and try again.',
        };

  const VerdictIcon = badgeStyles.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-[#0F172A] border border-slate-700/80 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl border ${badgeStyles.bg}`}>
              <VerdictIcon className={`w-7 h-7 ${badgeStyles.color}`} />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
                Challenge Complete · 60s Report
              </div>
              <h2 className={`text-xl font-bold tracking-tight ${badgeStyles.color}`}>
                {badgeStyles.title}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{badgeStyles.subtitle}</p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono uppercase text-slate-400">Score</div>
            <div className="text-3xl font-mono font-bold text-slate-100 leading-none">
              {result.score}
              <span className="text-sm text-slate-500">/100</span>
            </div>
            <span
              className={`inline-block mt-1 px-2 py-0.5 text-xs font-mono font-bold rounded border ${badgeStyles.bg} ${badgeStyles.color}`}
            >
              GRADE {result.grade}
            </span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 gap-3 font-mono tabular-nums">
          <div className="bg-[#080D18] border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] uppercase text-slate-500 font-sans">
              Max Successful RPS
            </div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {formatNumber(result.maxProcessedRps)} req/s
            </div>
          </div>
          <div className="bg-[#080D18] border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] uppercase text-slate-500 font-sans">
              Average P95 Latency
            </div>
            <div className="text-lg font-bold text-sky-400 mt-0.5">
              {formatNumber(result.avgP95LatencyMs)} ms
            </div>
          </div>
          <div className="bg-[#080D18] border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] uppercase text-slate-500 font-sans">
              Total Simulated Errors
            </div>
            <div className={`text-lg font-bold mt-0.5 ${result.totalSimulatedErrors > 100 ? 'text-red-400' : 'text-slate-100'}`}>
              {formatNumber(result.totalSimulatedErrors)}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({result.avgErrorRate}%)
              </span>
            </div>
          </div>
          <div className="bg-[#080D18] border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] uppercase text-slate-500 font-sans">
              Final System Status
            </div>
            <div className="text-lg font-bold text-slate-100 mt-0.5">
              {result.finalStatus}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#080D18]/80 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onExit}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Return to Free Play
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry Challenge
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 9. MAIN APPLICATION COMPONENT (APP)
// ============================================================================

export default function App() {
  // Configuration & Simulation State
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Before / After Snapshots
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [afterSnapshot, setAfterSnapshot] = useState(null);

  // Challenge Mode State ("SURVIVE THE TRAFFIC")
  const [challengeActive, setChallengeActive] = useState(false);
  const [challengeResult, setChallengeResult] = useState(null);
  const challengeTrackerRef = useRef({
    maxProcessedRps: 0,
    p95Sum: 0,
    p95Count: 0,
    errorRateSum: 0,
    errorSamples: 0,
    totalSimulatedErrors: 0,
  });

  // Live Refs shared with 60fps Canvas Visualizer & Simulation Tick Interval
  const simRef = useRef(INITIAL_METRICS);
  const configRef = useRef(DEFAULT_CONFIG);
  const isRunningRef = useRef(false);
  const challengeActiveRef = useRef(false);
  const lastChartSecondRef = useRef(-1);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    challengeActiveRef.current = challengeActive;
  }, [challengeActive]);

  // Listen to native fullscreen state changes safely
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Gracefully ignore in sandboxed iframes
    }
  }, []);

  // Core Simulation Loop (5 Hz telemetry tick -> smooth UI + bounded 1Hz chart sampling)
  useEffect(() => {
    if (!isRunning) return;

    const TICK_MS = 200;
    const DT_SEC = TICK_MS / 1000;

    const intervalId = setInterval(() => {
      const next = computeSimulationTick(
        simRef.current,
        configRef.current,
        DT_SEC,
        { active: challengeActiveRef.current }
      );
      simRef.current = next;
      setMetrics(next);

      // Update Challenge Tracker & Check 60s Completion
      if (challengeActiveRef.current) {
        const tr = challengeTrackerRef.current;
        if (next.processedRps > tr.maxProcessedRps) {
          tr.maxProcessedRps = next.processedRps;
        }
        tr.p95Sum += next.p95LatencyMs;
        tr.p95Count += 1;
        tr.errorRateSum += next.errorRate;
        tr.errorSamples += 1;
        tr.totalSimulatedErrors += next.failedRps * DT_SEC;

        if (next.elapsedSec >= 60) {
          const finalReport = evaluateChallengeResult(tr, next.status);
          setIsRunning(false);
          setChallengeActive(false);
          setChallengeResult(finalReport);
        }
      }

      // Append 1 chart sample per simulated second (bounded rolling 60s window)
      const secBucket = Math.floor(next.elapsedSec);
      if (secBucket > lastChartSecondRef.current) {
        lastChartSecondRef.current = secBucket;
        setHistory((prev) => {
          const point = {
            t: secBucket,
            avgLatency: Math.round(next.avgLatencyMs),
            p95Latency: Math.round(next.p95LatencyMs),
            incomingRps: Math.round(next.incomingRps),
            processedRps: Math.round(next.processedRps),
          };
          const updated = [...prev, point];
          return updated.length > MAX_HISTORY_POINTS
            ? updated.slice(updated.length - MAX_HISTORY_POINTS)
            : updated;
        });
      }
    }, TICK_MS);

    return () => clearInterval(intervalId);
  }, [isRunning]);

  // Handlers
  const handleConfigChange = useCallback((patch) => {
    setActiveScenarioId(null);
    setConfig((prev) => {
      const updated = { ...prev, ...patch };
      // If idle, reflect selected virtual user count immediately
      if (!isRunningRef.current && simRef.current.elapsedSec === 0 && patch.virtualUsers) {
        const idleUpdate = { ...simRef.current, activeUsers: patch.virtualUsers };
        simRef.current = idleUpdate;
        setMetrics(idleUpdate);
      }
      return updated;
    });
  }, []);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setChallengeActive(false);
    setChallengeResult(null);
    lastChartSecondRef.current = -1;
    const fresh = {
      ...INITIAL_METRICS,
      activeUsers: configRef.current.virtualUsers,
      dbAvgLatencyMs: configRef.current.dbQueryLatencyMs,
      workerCapacityPerSec: configRef.current.workerCount * WORKER_JOBS_PER_SEC,
    };
    simRef.current = fresh;
    setMetrics(fresh);
    setHistory([]);
  }, []);

  const handleApplyScenario = useCallback((scenario) => {
    setChallengeActive(false);
    setChallengeResult(null);
    setActiveScenarioId(scenario.id);
    setConfig(scenario.config);
    configRef.current = scenario.config;

    // Reset queue depth when switching scenarios cleanly while keeping running state fluid
    if (!isRunningRef.current && simRef.current.elapsedSec === 0) {
      const idleUpdate = {
        ...INITIAL_METRICS,
        activeUsers: scenario.config.virtualUsers,
        dbAvgLatencyMs: scenario.config.dbQueryLatencyMs,
        workerCapacityPerSec: scenario.config.workerCount * WORKER_JOBS_PER_SEC,
      };
      simRef.current = idleUpdate;
      setMetrics(idleUpdate);
    } else {
      simRef.current = { ...simRef.current, queueDepth: 0 };
    }
  }, []);

  const handleStartChallenge = useCallback(() => {
    lastChartSecondRef.current = -1;
    challengeTrackerRef.current = {
      maxProcessedRps: 0,
      p95Sum: 0,
      p95Count: 0,
      errorRateSum: 0,
      errorSamples: 0,
      totalSimulatedErrors: 0,
    };
    const fresh = {
      ...INITIAL_METRICS,
      activeUsers: 1200,
      dbAvgLatencyMs: configRef.current.dbQueryLatencyMs,
      workerCapacityPerSec: configRef.current.workerCount * WORKER_JOBS_PER_SEC,
    };
    simRef.current = fresh;
    setMetrics(fresh);
    setHistory([]);
    setChallengeResult(null);
    setChallengeActive(true);
    setIsRunning(true);
  }, []);

  const handleExitChallenge = useCallback(() => {
    setChallengeActive(false);
    setChallengeResult(null);
    setIsRunning(false);
  }, []);

  const handleCaptureBaseline = useCallback(() => {
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setBaselineSnapshot({
      label: nowLabel,
      metrics: { ...simRef.current },
      config: { ...configRef.current },
    });
    setAfterSnapshot(null);
  }, []);

  const handleCaptureAfter = useCallback(() => {
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setAfterSnapshot({
      label: nowLabel,
      metrics: { ...simRef.current },
      config: { ...configRef.current },
    });
  }, []);

  // Computed Dynamic Engineering Insights
  const insights = useMemo(
    () => generateEngineeringInsights(metrics, config, isRunning),
    [metrics, config, isRunning]
  );

  // Overall status styling
  const statusPill = useMemo(() => {
    if (!isRunning && metrics.elapsedSec === 0) {
      return {
        label: 'IDLE',
        dot: 'bg-slate-400',
        cls: 'bg-slate-800/90 text-slate-300 border-slate-700',
      };
    }
    if (!isRunning && metrics.elapsedSec > 0) {
      return {
        label: `PAUSED · ${metrics.status}`,
        dot: 'bg-sky-400',
        cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
      };
    }
    if (metrics.status === 'OVERLOADED') {
      return {
        label: 'OVERLOADED',
        dot: 'bg-red-500 animate-ping',
        cls: 'bg-red-500/15 text-red-400 border-red-500/50',
      };
    }
    if (metrics.status === 'DEGRADED') {
      return {
        label: 'DEGRADED',
        dot: 'bg-amber-400 animate-pulse',
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/45',
      };
    }
    return {
      label: 'HEALTHY',
      dot: 'bg-emerald-400 animate-pulse',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    };
  }, [isRunning, metrics.elapsedSec, metrics.status]);

  // Challenge Wave Phase Label
  const challengePhase = useMemo(() => {
    const t = metrics.elapsedSec;
    if (t < 15) return { name: 'Phase 1 · Warmup & Prep', color: 'text-sky-400' };
    if (t < 35) return { name: 'Phase 2 · Aggressive Ramp', color: 'text-amber-400' };
    if (t < 52) return { name: 'Phase 3 · 10K TRAFFIC SPIKE', color: 'text-red-400' };
    return { name: 'Phase 4 · Cooldown', color: 'text-emerald-400' };
  }, [metrics.elapsedSec]);

  // Metric card health states
  const rpsHealth =
    !isRunning && metrics.elapsedSec === 0
      ? 'neutral'
      : metrics.errorRate >= 5
      ? 'critical'
      : metrics.errorRate >= 1
      ? 'warning'
      : 'healthy';
  const latencyHealth =
    !isRunning && metrics.elapsedSec === 0
      ? 'neutral'
      : getMetricHealth('latency', metrics.p95LatencyMs);
  const errorHealth =
    !isRunning && metrics.elapsedSec === 0
      ? 'neutral'
      : getMetricHealth('error', metrics.errorRate);
  const cacheHealth = !config.redisEnabled
    ? 'neutral'
    : getMetricHealth('cache', metrics.cacheHitRate);
  const dbUtilHealth =
    !isRunning && metrics.elapsedSec === 0
      ? 'neutral'
      : getMetricHealth('dbUtil', metrics.dbUtilization);
  const queueHealth = !config.queueEnabled
    ? 'neutral'
    : getMetricHealth('queue', metrics.queueDepth);

  return (
    <div className="min-h-screen bg-[#080D18] text-slate-100 font-sans antialiased selection:bg-sky-500/30">
      {/* ================================================================= */}
      {/* A. TOP NAVIGATION BAR                                             */}
      {/* ================================================================= */}
      <header className="sticky top-0 z-30 bg-[#080D18]/92 backdrop-blur-md border-b border-slate-800/90">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-slate-100 tracking-tight text-sm sm:text-base truncate">
                Packet Panic
              </span>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-slate-800/90 text-slate-400 border border-slate-700/80">
                Infrastructure Simulator
              </span>
            </div>
          </div>

          {/* Center: Simulated Disclaimer */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            Simulated environment · No real traffic generated
          </div>

          {/* Right: Status + Utility Controls */}
          <div className="flex items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-mono font-semibold ${statusPill.cls}`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusPill.dot}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${statusPill.dot.split(' ')[0]}`} />
              </span>
              <span className="hidden sm:inline">{statusPill.label}</span>
            </div>

            <button
              type="button"
              onClick={challengeActive ? handleExitChallenge : handleStartChallenge}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                challengeActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                  : 'bg-slate-900 text-amber-300 border-amber-500/35 hover:bg-amber-500/15'
              }`}
              title="60-second Survive the Traffic challenge"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {challengeActive ? 'Exit Challenge' : 'Challenge Mode'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors"
              title="Reset simulation"
              aria-label="Reset simulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:inline-flex p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors"
              title="Toggle fullscreen"
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* CHALLENGE MODE LIVE HUD BANNER (ONLY WHEN ACTIVE)                 */}
      {/* ================================================================= */}
      {challengeActive && (
        <div className="bg-amber-950/35 border-b border-amber-500/40">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Flame className="w-4 h-4 animate-pulse" />
                SURVIVE THE TRAFFIC
              </div>
              <span className={`text-xs font-mono font-semibold ${challengePhase.color}`}>
                {challengePhase.name}
              </span>
            </div>

            <div className="flex items-center gap-5 font-mono text-xs tabular-nums">
              <div className="hidden md:block text-slate-300">
                Peak OK:{' '}
                <strong className="text-emerald-400">
                  {formatNumber(challengeTrackerRef.current.maxProcessedRps)}/s
                </strong>
              </div>
              <div className="hidden md:block text-slate-300">
                Errors:{' '}
                <strong className={metrics.errorRate > 2 ? 'text-red-400' : 'text-slate-100'}>
                  {formatNumber(challengeTrackerRef.current.totalSimulatedErrors)}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 text-amber-300 font-bold text-sm">
                <Clock className="w-4 h-4" />
                {Math.max(0, Math.ceil(60 - metrics.elapsedSec))}s
              </div>
            </div>

            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500 transition-all duration-200"
                style={{ width: `${clamp((metrics.elapsedSec / 60) * 100, 0, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MAIN DASHBOARD CONTAINER                                          */}
      {/* ================================================================= */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* B. COMPACT HERO & PRIMARY ACTION BAR */}
        <section className="bg-[#0F172A]/85 border border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-50">
              Can your backend survive 10,000 users?
            </h1>
            <p className="text-sm text-slate-400">
              Configure your infrastructure. Generate traffic. Find the bottleneck.
            </p>
            <p className="lg:hidden text-[11px] font-mono text-slate-500 pt-0.5">
              Simulated environment · No real traffic generated
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsRunning((r) => !r)}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30'
                  : 'bg-sky-400 text-slate-950 hover:bg-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.28)]'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  PAUSE SIMULATION
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  {metrics.elapsedSec > 0 ? 'RESUME SIMULATION' : 'START SIMULATION'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCaptureBaseline}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-700/90 hover:border-sky-500/50 hover:text-sky-300 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Capture Snapshot
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </section>

        {/* C. REAL-TIME METRIC DASHBOARD */}
        <section className="space-y-3">
          {/* 4 Primary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* 1. REQUESTS / SEC */}
            <div className={`bg-[#0F172A]/90 border rounded-xl p-4 relative overflow-hidden ${HEALTH_STYLES[rpsHealth].border}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Requests / Sec
                </span>
                <span className={`w-2 h-2 rounded-full ${HEALTH_STYLES[rpsHealth].dot}`} />
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-slate-50 tabular-nums">
                {formatNumber(metrics.processedRps)}
                <span className="text-xs font-normal text-slate-400 ml-1">ok/s</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
                <span>Incoming: <strong className="text-sky-400">{formatNumber(metrics.incomingRps)}/s</strong></span>
                {metrics.failedRps >= 1 && (
                  <span className="text-red-400">-{formatNumber(metrics.failedRps)}/s</span>
                )}
              </div>
            </div>

            {/* 2. P95 LATENCY */}
            <div className={`bg-[#0F172A]/90 border rounded-xl p-4 ${HEALTH_STYLES[latencyHealth].border}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  P95 Latency
                </span>
                <span className={`w-2 h-2 rounded-full ${HEALTH_STYLES[latencyHealth].dot}`} />
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums ${latencyHealth === 'neutral' ? 'text-slate-100' : HEALTH_STYLES[latencyHealth].text}`}>
                {formatNumber(metrics.p95LatencyMs)}
                <span className="text-xs font-normal text-slate-400 ml-1">ms</span>
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400 tabular-nums">
                Avg Response: <strong className="text-slate-200">{formatNumber(metrics.avgLatencyMs)} ms</strong>
              </div>
            </div>

            {/* 3. ERROR RATE */}
            <div className={`bg-[#0F172A]/90 border rounded-xl p-4 ${HEALTH_STYLES[errorHealth].border}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Error Rate
                </span>
                <span className={`w-2 h-2 rounded-full ${HEALTH_STYLES[errorHealth].dot}`} />
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums ${errorHealth === 'neutral' ? 'text-slate-100' : HEALTH_STYLES[errorHealth].text}`}>
                {metrics.errorRate.toFixed(2)}
                <span className="text-xs font-normal text-slate-400 ml-0.5">%</span>
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400 tabular-nums">
                Failed: <strong className={metrics.failedRps >= 1 ? 'text-red-400' : 'text-slate-300'}>{formatNumber(metrics.failedRps)} req/s</strong>
              </div>
            </div>

            {/* 4. CACHE HIT RATE */}
            <div className={`bg-[#0F172A]/90 border rounded-xl p-4 ${HEALTH_STYLES[cacheHealth].border}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Cache Hit Rate
                </span>
                <span className={`w-2 h-2 rounded-full ${HEALTH_STYLES[cacheHealth].dot}`} />
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums ${config.redisEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                {config.redisEnabled ? `${metrics.cacheHitRate.toFixed(0)}%` : '0%'}
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400 tabular-nums">
                {config.redisEnabled
                  ? `Redis serving ${formatNumber(metrics.cacheHitsPerSec)} reads/s`
                  : 'Bypassed · Redis Cache OFF'}
              </div>
            </div>
          </div>

          {/* 3 Secondary Compact Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* DB Utilization */}
            <div className="bg-[#0F172A]/75 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-slate-500" />
                    Database Utilization
                  </span>
                  <span className={`font-mono font-bold tabular-nums ${HEALTH_STYLES[dbUtilHealth].text}`}>
                    {Math.round(metrics.dbUtilization)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${HEALTH_STYLES[dbUtilHealth].bar}`}
                    style={{ width: `${clamp(metrics.dbUtilization, 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Queue Depth */}
            <div className="bg-[#0F172A]/75 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Queue Depth
              </span>
              <div className="text-right font-mono tabular-nums">
                <span className={`text-sm font-bold ${config.queueEnabled ? HEALTH_STYLES[queueHealth].text : 'text-slate-500'}`}>
                  {config.queueEnabled ? formatNumber(metrics.queueDepth) : 'OFF'}
                </span>
                {config.queueEnabled && (
                  <span className="text-[11px] text-slate-500 ml-1.5">pending</span>
                )}
              </div>
            </div>

            {/* Active Virtual Users */}
            <div className="bg-[#0F172A]/75 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                Active Virtual Users
              </span>
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <span className="text-sm font-bold text-sky-400">
                  {formatNumber(metrics.activeUsers)}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-slate-800 text-slate-400 border border-slate-700/80">
                  {challengeActive ? 'wave' : config.trafficPattern}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* D. MAIN STAGE: INFRASTRUCTURE VISUALIZER + CONTROLS SIDEBAR       */}
        {/* ================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-5">
            <InfrastructureVisualizer
              metrics={metrics}
              config={config}
              isRunning={isRunning}
              simRef={simRef}
              configRef={configRef}
              isRunningRef={isRunningRef}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />

            {/* WHAT'S HAPPENING? — Dynamic Engineering Insights */}
            <div className="bg-[#0F172A]/90 border border-slate-800/90 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    What&apos;s Happening?
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Live Diagnostic Engine
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
                {insights.map((ins, idx) => {
                  const style =
                    ins.severity === 'critical'
                      ? 'bg-red-500/10 border-red-500/35 text-red-200'
                      : ins.severity === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                      : ins.severity === 'healthy'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-sky-500/10 border-sky-500/30 text-sky-200';
                  const Icon =
                    ins.severity === 'critical'
                      ? XOctagon
                      : ins.severity === 'warning'
                      ? AlertTriangle
                      : ins.severity === 'healthy'
                      ? CheckCircle2
                      : Gauge;
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3 flex items-start gap-2.5 ${style} ${
                        insights.length === 1 ? 'md:col-span-2 lg:col-span-1 xl:col-span-2' : ''
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold">{ins.title}</div>
                        <p className="text-xs opacity-90 leading-relaxed">
                          {ins.message}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Interactive Infrastructure Controls */}
          <div className="lg:col-span-4 xl:col-span-3">
            <ControlsPanel
              config={config}
              metrics={metrics}
              onChange={handleConfigChange}
              challengeActive={challengeActive}
              activeScenarioId={activeScenarioId}
            />
          </div>
        </section>

        {/* ================================================================= */}
        {/* E. LIVE PERFORMANCE CHARTS (ROLLING 60s WINDOW)                   */}
        {/* ================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <LiveTelemetryChart
            title="Latency Over Time"
            subtitle="Rolling 60-second response time window (Average vs P95)"
            data={history}
            unit="ms"
            minMaxY={200}
            series={[
              { key: 'avgLatency', label: 'Avg', color: '#38BDF8', fill: true },
              {
                key: 'p95Latency',
                label: 'P95',
                color: metrics.p95LatencyMs >= 1000 ? '#EF4444' : '#F59E0B',
                fill: false,
              },
            ]}
          />
          <LiveTelemetryChart
            title="Request Throughput"
            subtitle="Incoming demand vs successfully processed requests per second"
            data={history}
            unit=" rps"
            minMaxY={300}
            series={[
              {
                key: 'incomingRps',
                label: 'Incoming',
                color: '#64748B',
                dashed: true,
                fill: false,
              },
              {
                key: 'processedRps',
                label: 'Processed',
                color: '#10B981',
                fill: true,
              },
            ]}
          />
        </section>

        {/* ================================================================= */}
        {/* F. PRECONFIGURED SCENARIOS                                        */}
        {/* ================================================================= */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Preconfigured Scenarios
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              Select a preset to immediately configure your entire backend stack
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {SCENARIO_PRESETS.map((sc) => {
              const isActive = activeScenarioId === sc.id && !challengeActive;
              const isDisaster = sc.id === 'db-disaster';
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleApplyScenario(sc)}
                  className={`text-left rounded-xl p-4 border transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                    isActive
                      ? 'bg-sky-500/10 border-sky-400/70 shadow-[0_0_20px_rgba(56,189,248,0.12)]'
                      : 'bg-[#0F172A]/85 border-slate-800/90 hover:border-slate-600 hover:bg-[#111C33]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                          isDisaster
                            ? 'bg-red-500/15 text-red-400 border-red-500/35'
                            : 'bg-slate-800 text-sky-300 border-slate-700'
                        }`}
                      >
                        {sc.badge}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {formatNumber(sc.config.virtualUsers)} users
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-100">
                      {sc.name}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {sc.observation}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-300">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                      Redis {sc.config.redisEnabled ? `${sc.config.cacheHitRatio}%` : 'OFF'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                      Queue {sc.config.queueEnabled ? 'ON' : 'OFF'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                      {sc.config.workerCount}w
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                      {sc.config.dbConnectionPool}c · {sc.config.dbQueryLatencyMs}ms
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ================================================================= */}
        {/* G. BEFORE / AFTER SNAPSHOT COMPARISON                             */}
        {/* ================================================================= */}
        <section>
          <SnapshotComparisonPanel
            baseline={baselineSnapshot}
            afterSnapshot={afterSnapshot}
            liveMetrics={metrics}
            onCaptureBaseline={handleCaptureBaseline}
            onCaptureAfter={handleCaptureAfter}
            onClear={() => {
              setBaselineSnapshot(null);
              setAfterSnapshot(null);
            }}
          />
        </section>

        {/* Footer */}
        <footer className="pt-2 pb-6 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
          <span>Packet Panic · Client-side Infrastructure Simulator</span>
          <span>All telemetry &amp; load curves are simulated locally in your browser.</span>
        </footer>
      </main>

      {/* Challenge Mode Final Results Modal */}
      <ChallengeResultsModal
        result={challengeResult}
        onRetry={handleStartChallenge}
        onExit={handleExitChallenge}
      />
    </div>
  );
}