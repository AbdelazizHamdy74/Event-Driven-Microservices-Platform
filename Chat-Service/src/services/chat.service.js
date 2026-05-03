const db = require("../config/db");
const { producer } = require("../config/kafka");
const axios = require("axios");
const socketHub = require("../socketHub");

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

const normalizeAuthHeader = (authToken) => {
  if (!authToken || typeof authToken !== "string") return "";
  const t = authToken.trim();
  if (!t) return "";
  return /^Bearer\s/i.test(t) ? t : `Bearer ${t}`;
};

const friendshipBaseUrl = () =>
  process.env.FRIENDSHIP_SERVICE_URL || "http://localhost:3004";

const getFriendshipStatus = async (otherUserId, authToken) => {
  const authorization = normalizeAuthHeader(authToken);
  if (!authorization) throw new Error("Authorization required");

  let response;
  try {
    response = await axios.get(
      `${friendshipBaseUrl()}/friendships/status/${otherUserId}`,
      { timeout: 3000, headers: { Authorization: authorization } },
    );
  } catch (err) {
    if (err.response?.status === 401) throw new Error("Unauthorized");
    throw new Error("Friendship service unavailable");
  }

  return response.data?.status;
};

const hasChatAllowance = async (userId, otherUserId) => {
  const [user1Id, user2Id] = normalizePair(userId, otherUserId);
  const [rows] = await db.execute(
    "SELECT 1 FROM chat_allowances WHERE user1_id = ? AND user2_id = ? LIMIT 1",
    [user1Id, user2Id],
  );
  return rows.length > 0;
};

const fetchAllowancePartnerIds = async (userId) => {
  const [rows] = await db.execute(
    [
      "SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END AS oid",
      "FROM chat_allowances",
      "WHERE user1_id = ? OR user2_id = ?",
    ].join(" "),
    [userId, userId, userId],
  );
  return new Set(
    rows
      .map((r) => Number(r.oid))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
};

const assertCanChatWith = async (userId, otherUserId, authToken) => {
  const status = await getFriendshipStatus(otherUserId, authToken);
  if (status === "FRIENDS") return;

  if (status === "BLOCKED_BY_ME" || status === "BLOCKED_BY_OTHER") {
    throw new Error("Messaging is not available for this user");
  }
  if (await hasChatAllowance(userId, otherUserId)) return;
  throw new Error("You can only message users you are friends with");
};

const fetchFriendIds = async (authToken) => {
  const authorization = normalizeAuthHeader(authToken);
  if (!authorization) return new Set();

  try {
    const response = await axios.get(`${friendshipBaseUrl()}/friendships/friends`, {
      timeout: 5000,
      headers: { Authorization: authorization },
    });
    const list = Array.isArray(response.data) ? response.data : [];
    return new Set(
      list
        .map((f) => Number(f.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
  } catch (_err) {
    throw new Error("Friendship service unavailable");
  }
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

  await assertCanChatWith(userId, otherUserId, authToken);

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
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    conversationName: conversation.name || null,
    fromUserId: Number(row.sender_id),
    fromUserName: row.sender_name,
    toUserId: Number(row.receiver_id),
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

  socketHub.emitToUser(message.toUserId, "chat:new", message);
  socketHub.emitToUser(message.toUserId, "notification:new", {
    type: "CHAT_MESSAGE_CREATED",
    message: message.fromUserName
      ? `New message from ${message.fromUserName}`
      : `New message from user ${message.fromUserId}`,
    data: { fromUserId: message.fromUserId },
  });

  return message;
};

exports.getMyConversations = async (userId, authToken = "") => {
  const friendIds = await fetchFriendIds(authToken);
  const allowanceIds = await fetchAllowancePartnerIds(userId);
  const allowedOther = new Set([...friendIds, ...allowanceIds]);

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

  const mapped = rows
    .map((row) => {
      const otherUserId = row.user1_id === userId ? row.user2_id : row.user1_id;
      return { row, otherUserId };
    })
    .filter(({ otherUserId }) => allowedOther.has(otherUserId));

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

exports.getMessages = async (userId, otherUserId, authToken = "") => {
  if (!otherUserId) throw new Error("Receiver is required");

  await assertCanChatWith(userId, otherUserId, authToken);

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
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    conversationName: conversation.name,
    fromUserId: Number(row.sender_id),
    fromUserName: row.sender_name,
    toUserId: Number(row.receiver_id),
    toUserName: row.receiver_name,
    content: row.content,
    createdAt: row.created_at,
  }));
};

exports.sendMessageRequest = async (userId, toUserId, content, authToken = "") => {
  const raw = typeof content === "string" ? content.trim() : "";
  const clean = raw.slice(0, 500);
  if (!clean) throw new Error("Content is required");
  if (!toUserId) throw new Error("Receiver is required");
  if (userId === toUserId) throw new Error("Cannot message yourself");

  const target = await fetchUserInfo(toUserId, authToken);
  if (!target) throw new Error("User service unavailable");
  if (!target.exists) throw new Error("Receiver not found");

  const status = await getFriendshipStatus(toUserId, authToken);
  if (status === "FRIENDS") {
    throw new Error("You are already friends — open Messages to chat");
  }
  if (status === "BLOCKED_BY_ME" || status === "BLOCKED_BY_OTHER") {
    throw new Error("Messaging is not available for this user");
  }

  if (await hasChatAllowance(userId, toUserId)) {
    throw new Error("You can already message this user");
  }

  const [existing] = await db.execute(
    "SELECT id FROM message_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'PENDING'",
    [userId, toUserId],
  );
  if (existing.length) throw new Error("A message request is already pending");

  const [result] = await db.execute(
    "INSERT INTO message_requests (from_user_id, to_user_id, content, status) VALUES (?, ?, ?, 'PENDING')",
    [userId, toUserId, clean],
  );

  const [insertedRows] = await db.execute(
    "SELECT id, from_user_id, to_user_id, content, status, created_at FROM message_requests WHERE id = ?",
    [result.insertId],
  );
  const ins = insertedRows[0];

  let fromUserName = "";
  const senderInfo = await fetchUserInfo(userId, authToken);
  if (senderInfo?.exists) fromUserName = cleanName(senderInfo.name);

  const row = {
    id: ins.id,
    fromUserId: ins.from_user_id,
    toUserId: ins.to_user_id,
    content: ins.content,
    status: ins.status,
    fromUserName: fromUserName || null,
    createdAt: ins.created_at,
  };

  await producer.send({
    topic: "chat-events",
    messages: [
      {
        value: JSON.stringify({
          event: "MESSAGE_REQUEST_CREATED",
          data: row,
        }),
      },
    ],
  });

  socketHub.emitToUser(toUserId, "message:request", row);
  socketHub.emitToUser(toUserId, "notification:new", {
    type: "MESSAGE_REQUEST_CREATED",
    message: fromUserName
      ? `${fromUserName} asked to message you`
      : `User ${userId} asked to message you`,
    data: { fromUserId: userId },
  });

  return row;
};

exports.listIncomingMessageRequests = async (userId) => {
  const [rows] = await db.execute(
    "SELECT id, from_user_id, to_user_id, content, status, created_at FROM message_requests WHERE to_user_id = ? AND status = 'PENDING' ORDER BY id DESC",
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    content: r.content,
    status: r.status,
    createdAt: r.created_at,
  }));
};

exports.acceptMessageRequest = async (userId, fromUserId, authToken = "") => {
  if (!fromUserId) throw new Error("Sender is required");
  const [rows] = await db.execute(
    "SELECT id FROM message_requests WHERE to_user_id = ? AND from_user_id = ? AND status = 'PENDING'",
    [userId, fromUserId],
  );
  if (!rows.length) throw new Error("No pending message request");

  const status = await getFriendshipStatus(fromUserId, authToken);
  if (status === "BLOCKED_BY_ME" || status === "BLOCKED_BY_OTHER") {
    throw new Error("Messaging is not available for this user");
  }

  await db.execute("UPDATE message_requests SET status = 'ACCEPTED' WHERE id = ?", [
    rows[0].id,
  ]);

  const [user1Id, user2Id] = normalizePair(userId, fromUserId);
  await db.execute(
    "INSERT IGNORE INTO chat_allowances (user1_id, user2_id) VALUES (?, ?)",
    [user1Id, user2Id],
  );

  socketHub.emitToUser(fromUserId, "message:request:resolved", {
    accepted: true,
    withUserId: userId,
  });

  return { message: "Accepted — you can now exchange messages" };
};

exports.declineMessageRequest = async (userId, fromUserId) => {
  const [result] = await db.execute(
    "UPDATE message_requests SET status = 'DECLINED' WHERE to_user_id = ? AND from_user_id = ? AND status = 'PENDING'",
    [userId, fromUserId],
  );
  if (!result.affectedRows) throw new Error("No pending message request");

  socketHub.emitToUser(fromUserId, "message:request:resolved", {
    accepted: false,
    withUserId: userId,
  });

  return { message: "Declined" };
};
