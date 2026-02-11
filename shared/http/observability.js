const createObservability = (serviceName) => {
  const startedAt = Date.now();
  let requestsTotal = 0;
  let errorsTotal = 0;
  const requestsByMethod = {};
  const requestsByStatus = {};

  const requestLogger = (req, res, next) => {
    const started = process.hrtime.bigint();
    const requestId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    requestsTotal += 1;
    requestsByMethod[req.method] = (requestsByMethod[req.method] || 0) + 1;

    res.on("finish", () => {
      const elapsedMs =
        Number(process.hrtime.bigint() - started) / 1_000_000;
      const statusCode = res.statusCode;
      requestsByStatus[statusCode] = (requestsByStatus[statusCode] || 0) + 1;
      if (statusCode >= 500) errorsTotal += 1;

      console.log(
        `[${serviceName}] ${req.method} ${req.originalUrl} ${statusCode} ${elapsedMs.toFixed(
          1,
        )}ms requestId=${requestId}`,
      );
    });

    next();
  };

  const healthHandler = (_req, res) => {
    res.json({
      status: "ok",
      service: serviceName,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  };

  const metricsHandler = (_req, res) => {
    res.json({
      service: serviceName,
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      requestsTotal,
      errorsTotal,
      requestsByMethod,
      requestsByStatus,
      memory: process.memoryUsage(),
    });
  };

  return { requestLogger, healthHandler, metricsHandler };
};

module.exports = { createObservability };
