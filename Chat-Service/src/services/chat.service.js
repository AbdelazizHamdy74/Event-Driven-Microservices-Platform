const db = require("../config/db");
const { producer } = require("../config/kafka");
const axios = require("axios");

const userInfoCache = new Map();
const userCacheTtlMs = Number(process.env.USER_CACHE_TTL_MS) || 300000;

const getCachedUserInfo = (userId) => {
  const entry = userInfoCache.get(userId);
  if (!entry) return "";
  if (Date.now() > entry.expiresAt) {
    userInfoCache.delete(userId);
    return "";
  }
  return entry;
};

const setCachedUserInfo = (userId, info) => {
  userInfoCache.set(userId, {
    id: info.id || userId,
    exists: Boolean(info.exists),
    name: info.name || "",
    expiresAt: Date.now() + userCacheTtlMs,
  });
};

const normalizePair = (a, b) => (a < b ? [a, b] : [b, a]);

const cleanName = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 150);
};

const getOrCreateConversation = async (
  userId,
  otherUserId,
  conversationName,
) => {
  const [user1Id, user2Id] = normalizePair(userId, otherUserId);
  const cleanConversationName = cleanName(conversationName);

  const [rows] = await db.execute(
    "SELECT * FROM conversations WHERE user1_id = ? AND user2_id = ?",
    [user1Id, user2Id],
  );

  if (rows.length) {
    const existing = rows[0];
    if (!existing.name && cleanConversationName) {
      await db.execute("UPDATE conversations SET name = ? WHERE id = ?", [
        cleanConversationName,
        existing.id,
      ]);
      existing.name = cleanConversationName;
    }
    return existing;
  }

  const [result] = await db.execute(
    "INSERT INTO conversations (user1_id, user2_id, name) VALUES (?, ?, ?)",
    [user1Id, user2Id, cleanConversationName || null],
  );

  const [created] = await db.execute(
    "SELECT * FROM conversations WHERE id = ?",
    [result.insertId],
  );

  return created[0];
};

const fetchUserInfo = async (userId, authToken) => {
  const cached = getCachedUserInfo(userId);
  if (cached) return cached;

  const baseUrl = process.env.USER_SERVICE_URL;
  if (!baseUrl) return null;

  try {
    const headers = {};
    if (authToken) headers.Authorization = authToken;

    const response = await axios.get(`${baseUrl}/users/${userId}`, {
      timeout: 3000,
      headers,
    });
    const name =
      typeof response.data?.name === "string" ? response.data.name : "";
    const info = {
      id: response.data?.id || userId,
      exists: true,
      name,
    };
    setCachedUserInfo(userId, info);
    return info;
  } catch (err) {
    if (err.response?.status === 404) {
      const info = { id: userId, exists: false, name: "" };
      setCachedUserInfo(userId, info);
      return info;
    }
    return null;
  }
};

const fetchUserName = async (userId, authToken) => {
  const info = await fetchUserInfo(userId, authToken);
  if (!info || !info.exists) return "";
  return info.name || "";
};

exports.sendMessage = async (
  userId,
  otherUserId,
  content,
  options = {},
  authToken = "",
) => {
  const cleanContent = typeof content === "string" ? content.trim() : "";
  let senderName = cleanName(options.senderName);
  let receiverName = cleanName(options.receiverName);

  if (!cleanContent) throw new Error("Content is required");
  if (!otherUserId) throw new Error("Receiver is required");
  if (userId === otherUserId) throw new Error("Cannot message yourself");

  if (!senderName) {
    const senderInfo = await fetchUserInfo(userId, authToken);
    if (!senderInfo) throw new Error("User service unavailable");
    if (!senderInfo.exists) throw new Error("Sender not found");
    senderName = cleanName(senderInfo.name);
  }

  const receiverInfo = await fetchUserInfo(otherUserId, authToken);
  if (!receiverInfo) throw new Error("User service unavailable");
  if (!receiverInfo.exists) throw new Error("Receiver not found");
  if (!receiverName) {
    receiverName = cleanName(receiverInfo.name);
  }

  const fallbackConversationName =
    senderName && receiverName ? `${senderName} & ${receiverName}` : "";

  const conversation = await getOrCreateConversation(
    userId,
    otherUserId,
    options.conversationName || fallbackConversationName,
  );

  const [result] = await db.execute(
    "INSERT INTO messages (conversation_id, sender_id, sender_name, receiver_id, receiver_name, content) VALUES (?, ?, ?, ?, ?, ?)",
    [
      conversation.id,
      userId,
      senderName || null,
      otherUserId,
      receiverName || null,
      cleanContent,
    ],
  );

  const [rows] = await db.execute(
    "SELECT id, conversation_id, sender_id, sender_name, receiver_id, receiver_name, content, created_at FROM messages WHERE id = ?",
    [result.insertId],
  );

  const row = rows[0];
  const message = {
    id: row.id,
    conversationId: row.conversation_id,
    conversationName: conversation.name || null,
    fromUserId: row.sender_id,
    fromUserName: row.sender_name,
    toUserId: row.receiver_id,
    toUserName: row.receiver_name,
    content: row.content,
    createdAt: row.created_at,
  };

  await producer.send({
    topic: "chat-events",
    messages: [
      {
        value: JSON.stringify({
          event: "CHAT_MESSAGE_CREATED",
          data: message,
        }),
      },
    ],
  });

  return message;
};

exports.getMyConversations = async (userId, authToken = "") => {
  const [rows] = await db.execute(
    `SELECT c.id, c.user1_id, c.user2_id, c.name,
            m.id AS last_message_id,
            m.content AS last_message_content,
            m.sender_name AS last_message_sender_name,
            m.receiver_name AS last_message_receiver_name,
            m.created_at AS last_message_at
     FROM conversations c
     LEFT JOIN messages m ON m.id = (
       SELECT id FROM messages
       WHERE conversation_id = c.id
       ORDER BY id DESC
       LIMIT 1
     )
     WHERE c.user1_id = ? OR c.user2_id = ?
     ORDER BY m.created_at DESC`,
    [userId, userId],
  );

  const mapped = rows.map((row) => {
    const otherUserId = row.user1_id === userId ? row.user2_id : row.user1_id;
    return { row, otherUserId };
  });

  const names = await Promise.all(
    mapped.map(({ otherUserId }) => fetchUserName(otherUserId, authToken)),
  );

  return mapped.map(({ row, otherUserId }, index) => ({
    conversationId: row.id,
    conversationName: row.name,
    otherUserId,
    otherUserName: names[index] || null,
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          content: row.last_message_content,
          senderName: row.last_message_sender_name,
          receiverName: row.last_message_receiver_name,
          createdAt: row.last_message_at,
        }
      : null,
  }));
};

exports.getMessages = async (userId, otherUserId) => {
  if (!otherUserId) throw new Error("Receiver is required");

  const [user1Id, user2Id] = normalizePair(userId, otherUserId);

  const [convRows] = await db.execute(
    "SELECT id, user1_id, user2_id, name FROM conversations WHERE user1_id = ? AND user2_id = ?",
    [user1Id, user2Id],
  );

  if (!convRows.length) return [];

  const conversation = convRows[0];

  const [rows] = await db.execute(
    "SELECT id, conversation_id, sender_id, sender_name, receiver_id, receiver_name, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC",
    [conversation.id],
  );

  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    conversationName: conversation.name,
    fromUserId: row.sender_id,
    fromUserName: row.sender_name,
    toUserId: row.receiver_id,
    toUserName: row.receiver_name,
    content: row.content,
    createdAt: row.created_at,
  }));
};
