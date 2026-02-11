require("dotenv").config();
const express = require("express");
const friendshipRoutes = require("./routes/friendship.routes");
const { connectProducer } = require("./config/kafka");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("friendship-service");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(securityHeaders);
app.use(
  createRateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: Number(process.env.RATE_LIMIT_MAX) || 120,
  }),
);
app.use(requestLogger);

app.get("/health", healthHandler);
app.get("/metrics", metricsHandler);

app.use("/friendships", friendshipRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`Friendship Service running on port ${process.env.PORT}`);
  });
};

startServer();
