const notFoundHandler = (req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  let status = Number(err.statusCode || err.status || 500);
  if (
    err.name === "JsonWebTokenError" ||
    err.name === "TokenExpiredError"
  ) {
    status = 401;
  }

  if (!Number.isFinite(status) || status < 400 || status > 599) {
    status = 500;
  }

  const message = status >= 500 ? "Internal server error" : err.message;

  console.error(
    `[ERROR] ${req.method} ${req.originalUrl} status=${status} requestId=${
      req.requestId || "n/a"
    }`,
    err.stack || err.message || err,
  );

  res.status(status).json({
    message,
    requestId: req.requestId || null,
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
