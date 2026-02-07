require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const chatRoutes = require("./routes/chat.routes");
const { connectProducer } = require("./config/kafka");
const chatService = require("./services/chat.service");

const app = express();
app.use(express.json());
app.use(cors());

app.use("/chats", chatRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.use((socket, next) => {
  const headerToken = socket.handshake.headers?.authorization?.split(" ")[1];
  const token = socket.handshake.auth?.token || headerToken;
  if (!token) return next(new Error("Unauthorized"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    return next();
  } catch (err) {
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
        typeof payload?.senderName === "string" ? payload.senderName.trim() : "";
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
