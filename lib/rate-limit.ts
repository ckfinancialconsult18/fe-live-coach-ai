/**
 * In-process sliding-window rate limiter.
 *
 * Keyed by an arbitrary string (typically `userId` or `ip:userId`).
 * Each bucket holds a ring-buffer of timestamps for the last N requests.
 * Uses a sliding window so bursts are damped without allowing double-bursts
 * at window boundaries (unlike fixed-window counters).
 *
 * This implementation is single-process only. For multi-instance deployments,
 * replace the Map with Redis ZADD/ZCOUNT (same algorithm, distributed state).
 */

interface Bucket {
  timestamps: number[];  // ring-buffer, oldest first
  head: number;          // write pointer
}

interface Limiter {
  maxRequests: number;
  windowMs: number;
  buckets: Map<string, Bucket>;
}

const limiters = new Map<string, Limiter>();

/**
 * Create or retrieve a named rate-limiter.
 *
 * @param name       Unique name — one limiter per endpoint family.
 * @param maxRequests  Maximum requests allowed within windowMs.
 * @param windowMs   Sliding window size in ms.
 */
export function createRateLimiter(name: string, maxRequests: number, windowMs: number): Limiter {
  if (!limiters.has(name)) {
    limiters.set(name, { maxRequests, windowMs, buckets: new Map() });
  }
  return limiters.get(name)!;
}

/**
 * Check and record a request.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs: number }`.
 */
export function checkRateLimit(
  limiter: Limiter,
  key: string,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const { maxRequests, windowMs } = limiter;

  let bucket = limiter.buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: new Array<number>(maxRequests).fill(0), head: 0 };
    limiter.buckets.set(key, bucket);
  }

  // Count requests within the window
  const windowStart = now - windowMs;
  let count = 0;
  let oldestInWindow = now;
  for (const ts of bucket.timestamps) {
    if (ts > windowStart) {
      count++;
      if (ts < oldestInWindow) oldestInWindow = ts;
    }
  }

  if (count >= maxRequests) {
    // Retry after the oldest in-window request ages out
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  // Record this request
  bucket.timestamps[bucket.head] = now;
  bucket.head = (bucket.head + 1) % maxRequests;

  return { allowed: true };
}

/**
 * Periodically evict inactive buckets to prevent memory growth.
 * Called automatically on the first use of any limiter.
 */
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const limiter of limiters.values()) {
      for (const [key, bucket] of limiter.buckets) {
        const hasActive = bucket.timestamps.some((ts) => ts > now - limiter.windowMs);
        if (!hasActive) limiter.buckets.delete(key);
      }
    }
  }, 60_000); // clean up every minute
}
scheduleCleanup();

// ── Pre-configured limiters for each endpoint ─────────────────────────────────

// Coach endpoint: max 20 confirmed requests per user per minute.
// Interim coach calls are cheaper (gpt-4o-mini) so get a higher limit.
export const coachLimiter = createRateLimiter('coach', 20, 60_000);
export const interimCoachLimiter = createRateLimiter('coach-interim', 60, 60_000);

// Transcribe (legacy REST path): max 120 per user per minute (one per 500ms call).
export const transcribeLimiter = createRateLimiter('transcribe', 120, 60_000);

// WebSocket connections: max 10 new connections per IP per minute.
export const wsConnectionLimiter = createRateLimiter('ws-connect', 10, 60_000);

// Roleplay endpoint: max 60 requests per user per minute (streaming turns are fast).
export const roleplayLimiter = createRateLimiter('roleplay', 60, 60_000);
