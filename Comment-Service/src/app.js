require("dotenv").config();
const express = require("express");
const cors = require("cors");
const commentRoutes = require("./routes/comment.routes");
const { connectProducer } = require("./config/kafka");
const startPostConsumer = require("./consumers/post.consumer");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("comment-service");

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

app.use("/comments", commentRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await connectProducer();
  await startPostConsumer();

  app.listen(process.env.PORT, () => {
    console.log(`Comment Service running on port ${process.env.PORT}`);
  });
};

startServer();
