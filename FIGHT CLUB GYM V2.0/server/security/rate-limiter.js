// Lightweight In-Memory Rate Limiter Middleware
// Fight Club Gym Management System

const rateBuckets = new Map();

// Periodic cleanup of stale bucket records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateBuckets.entries()) {
    if (now - record.startTime > record.windowMs * 2) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Creates an Express rate-limiting middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60,000ms = 1 min)
 * @param {number} options.max - Max allowed requests per window (default: 60)
 * @param {string} options.message - Error message when rate limit is exceeded
 * @param {Function} options.keyGenerator - Custom function to determine rate limit key
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 60;
  const message = options.message || 'Too many requests, please try again later.';
  const keyGenerator = options.keyGenerator || ((req) => req.ip || req.connection.remoteAddress || 'global');

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = rateBuckets.get(key);
    if (!record || now - record.startTime > windowMs) {
      record = {
        count: 1,
        startTime: now,
        windowMs
      };
      rateBuckets.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.startTime + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds
      });
    }

    next();
  };
}

// Pre-configured limiters for critical application routes
const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please wait a minute before trying again.'
});

const deviceWebhookLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180, // High throughput for device events
  keyGenerator: (req) => `dev_${req.params.deviceId || req.ip}`,
  message: 'Device webhook rate limit exceeded.'
});

const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Upload rate limit exceeded. Please wait a moment.'
});

module.exports = {
  createRateLimiter,
  authLimiter,
  deviceWebhookLimiter,
  uploadLimiter
};
