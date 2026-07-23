/**
 * Simple in-memory rate limiter for API routes.
 * Tracks attempts per IP/key with a sliding window.
 * 
 * NOTE: This is per-process only. For multi-instance deployments,
 * use Redis-based rate limiting instead.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a given key.
 * @param key - unique identifier (e.g., IP address or email)
 * @param maxAttempts - max attempts allowed in the window
 * @param windowMs - time window in milliseconds
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function rateLimit(
  key: string,
  maxAttempts: number = 20,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // Fresh window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
}
