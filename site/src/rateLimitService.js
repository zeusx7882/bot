'use strict';

class RateLimitService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.buckets = new Map();
  }

  consume(key, { limit, windowMs }) {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count >= limit) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}

module.exports = { RateLimitService };
