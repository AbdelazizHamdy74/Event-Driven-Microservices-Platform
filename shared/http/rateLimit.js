const createRateLimiter = ({ windowMs = 60_000, max = 120 } = {}) => {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits.entries()) {
      if (value.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, windowMs).unref();

  return (req, res, next) => {
    if (req.path === "/health" || req.path === "/metrics") {
      return next();
    }

    const now = Date.now();
    const key =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown";

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(max - entry.count, 0);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((entry.resetAt - now) / 1000),
      );
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        message: "Too many requests, please try again later.",
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };
};

module.exports = { createRateLimiter };
