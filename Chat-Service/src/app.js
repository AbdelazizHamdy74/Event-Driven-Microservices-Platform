require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const chatRoutes = require("./routes/chat.routes");
const { connectProducer } = require("./config/kafka");
const chatService = require("./services/chat.service");
const { validateUserSession } = require("../../shared/auth/validateUserSession");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("chat-service");

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

app.use("/chats", chatRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.use(async (socket, next) => {
  const headerAuthorization = socket.handshake.headers?.authorization;
  const headerToken = headerAuthorization?.split(" ")[1];
  const authToken =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token.replace(/^Bearer\s+/i, "")
      : socket.handshake.auth?.token;
  const token = authToken || headerToken;

  if (!token) return next(new Error("Unauthorized"));

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    const session = await validateUserSession({
      authorization: headerAuthorization || authToken,
      userServiceUrl: process.env.USER_SERVICE_URL || "http://localhost:3001",
      timeoutMs: Number(process.env.AUTH_CHECK_TIMEOUT_MS) || 3000,
    });

    if (!session.ok) {
      return next(new Error(session.message || "Unauthorized"));
    }

    socket.user = session.user;
    return next();
  } catch (_err) {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.user.id;
  socket.join(`user:${userId}`);

  socket.on("chat:send", async (payload, cb) => {
    try {
      const toUserId = Number(payload?.toUserId);
      const content =
        typeof payload?.content === "string" ? payload.content.trim() : "";
      const senderName =
        typeof payload?.senderName === "string"
          ? payload.senderName.trim()
          : "";
      const receiverName =
        typeof payload?.receiverName === "string"
          ? payload.receiverName.trim()
          : "";
      const conversationName =
        typeof payload?.conversationName === "string"
          ? payload.conversationName.trim()
          : "";

      if (!toUserId || !content) {
        throw new Error("Invalid payload");
      }

      const authToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        "";

      const message = await chatService.sendMessage(
        userId,
        toUserId,
        content,
        {
          senderName,
          receiverName,
          conversationName,
        },
        authToken,
      );

      io.to(`user:${toUserId}`).emit("chat:new", message);
      socket.emit("chat:sent", message);

      if (cb) cb({ ok: true, message });
    } catch (err) {
      if (cb) cb({ ok: false, error: err.message });
    }
  });
});

const startServer = async () => {
  await connectProducer();

  server.listen(process.env.PORT, () => {
    console.log(`Chat Service running on port ${process.env.PORT}`);
  });
};

startServer();
