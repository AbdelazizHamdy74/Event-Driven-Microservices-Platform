require("dotenv").config();
const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/user.routes");
const authRoute = require("./routes/auth.routes");
const { connectProducer } = require("./config/kafka");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("user-service");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cors());
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

app.use("/users", userRoutes);
app.use("/auth", authRoute);
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`User Service running on port ${process.env.PORT}`);
  });
};

startServer();
