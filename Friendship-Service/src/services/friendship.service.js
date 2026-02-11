const db = require("../config/db");
const { producer } = require("../config/kafka");
const axios = require("axios");

const userInfoCache = new Map();
const userCacheTtlMs = Number(process.env.USER_CACHE_TTL_MS) || 300000;

const getCachedUserInfo = (userId) => {
  const entry = userInfoCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userInfoCache.delete(userId);
    return null;
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

const normalizePair = (a, b) => (a < b ? [a, b] : [b, a]);

const getRelationship = async (userId, otherUserId) => {
  const [user1Id, user2Id] = normalizePair(userId, otherUserId);
  const [rows] = await db.execute(
    "SELECT * FROM friendships WHERE user1_id = ? AND user2_id = ?",
    [user1Id, user2Id],
  );
  return rows[0] || null;
};

const ensureTargetUser = async (otherUserId, authToken) => {
  if (!otherUserId) throw new Error("Target user is required");
  const info = await fetchUserInfo(otherUserId, authToken);
  if (!info) throw new Error("User service unavailable");
  if (!info.exists) throw new Error("User not found");
  return info;
};

const formatUserName = (value) =>
  typeof value === "string" ? value.trim().slice(0, 150) : "";

exports.sendRequest = async (
  userId,
  otherUserId,
  options = {},
  authToken = "",
) => {
  if (!otherUserId) throw new Error("Target user is required");
  if (userId === otherUserId) throw new Error("Cannot friend yourself");

  const targetInfo = await ensureTargetUser(otherUserId, authToken);

  const existing = await getRelationship(userId, otherUserId);
  if (existing) {
    if (existing.status === "FRIENDS") {
      throw new Error("Already friends");
    }
    if (existing.status === "PENDING") {
      if (existing.requested_by === userId) {
        throw new Error("Request already sent");
      }
      throw new Error("User already sent a request");
    }
    if (existing.status === "BLOCKED") {
      if (existing.blocked_by === userId) {
        throw new Error("You blocked this user");
      }
      throw new Error("You are blocked");
    }
  }

  const [user1Id, user2Id] = normalizePair(userId, otherUserId);
  await db.execute(
    "INSERT INTO friendships (user1_id, user2_id, status, requested_by, blocked_by) VALUES (?, ?, ?, ?, ?)",
    [user1Id, user2Id, "PENDING", userId, null],
  );

  let fromUserName = formatUserName(options.userName);
  if (!fromUserName) {
    const actorInfo = await fetchUserInfo(userId, authToken);
    if (!actorInfo) throw new Error("User service unavailable");
    if (!actorInfo.exists) throw new Error("User not found");
    fromUserName = actorInfo.name || "";
  }

  await producer.send({
    topic: "friendship-events",
    messages: [
      {
        value: JSON.stringify({
          event: "FRIEND_REQUEST_SENT",
          data: {
            fromUserId: userId,
            toUserId: targetInfo.id,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });

  return { message: "Request sent" };
};

exports.acceptRequest = async (
  userId,
  otherUserId,
  options = {},
  authToken = "",
) => {
  if (!otherUserId) throw new Error("Target user is required");
  if (userId === otherUserId) throw new Error("Invalid request");

  await ensureTargetUser(otherUserId, authToken);

  const existing = await getRelationship(userId, otherUserId);
  if (!existing || existing.status !== "PENDING") {
    throw new Error("No request to accept");
  }
  if (existing.requested_by !== otherUserId) {
    throw new Error("No request to accept");
  }

  await db.execute(
    "UPDATE friendships SET status = ?, requested_by = NULL, blocked_by = NULL WHERE id = ?",
    ["FRIENDS", existing.id],
  );

  let fromUserName = formatUserName(options.userName);
  if (!fromUserName) {
    const actorInfo = await fetchUserInfo(userId, authToken);
    if (!actorInfo) throw new Error("User service unavailable");
    if (!actorInfo.exists) throw new Error("User not found");
    fromUserName = actorInfo.name || "";
  }

  await producer.send({
    topic: "friendship-events",
    messages: [
      {
        value: JSON.stringify({
          event: "FRIEND_REQUEST_ACCEPTED",
          data: {
            fromUserId: userId,
            toUserId: otherUserId,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });

  return { message: "Request accepted" };
};

exports.rejectRequest = async (
  userId,
  otherUserId,
  options = {},
  authToken = "",
) => {
  if (!otherUserId) throw new Error("Target user is required");
  if (userId === otherUserId) throw new Error("Invalid request");

  await ensureTargetUser(otherUserId, authToken);

  const existing = await getRelationship(userId, otherUserId);
  if (!existing || existing.status !== "PENDING") {
    throw new Error("No request to reject");
  }
  if (existing.requested_by !== otherUserId) {
    throw new Error("No request to reject");
  }

  await db.execute("DELETE FROM friendships WHERE id = ?", [existing.id]);

  let fromUserName = formatUserName(options.userName);
  if (!fromUserName) {
    const actorInfo = await fetchUserInfo(userId, authToken);
    if (!actorInfo) throw new Error("User service unavailable");
    if (!actorInfo.exists) throw new Error("User not found");
    fromUserName = actorInfo.name || "";
  }

  await producer.send({
    topic: "friendship-events",
    messages: [
      {
        value: JSON.stringify({
          event: "FRIEND_REQUEST_REJECTED",
          data: {
            fromUserId: userId,
            toUserId: otherUserId,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });

  return { message: "Request rejected" };
};

exports.blockUser = async (userId, otherUserId, authToken = "") => {
  if (!otherUserId) throw new Error("Target user is required");
  if (userId === otherUserId) throw new Error("Cannot block yourself");

  const targetInfo = await ensureTargetUser(otherUserId, authToken);
  const actorInfo = await fetchUserInfo(userId, authToken);
  if (!actorInfo) throw new Error("User service unavailable");
  if (!actorInfo.exists) throw new Error("User not found");
  const fromUserName = actorInfo.name || "";

  const existing = await getRelationship(userId, otherUserId);
  if (existing) {
    if (existing.status === "BLOCKED" && existing.blocked_by === userId) {
      throw new Error("Already blocked");
    }
    await db.execute(
      "UPDATE friendships SET status = ?, requested_by = NULL, blocked_by = ? WHERE id = ?",
      ["BLOCKED", userId, existing.id],
    );
  } else {
    const [user1Id, user2Id] = normalizePair(userId, otherUserId);
    await db.execute(
      "INSERT INTO friendships (user1_id, user2_id, status, requested_by, blocked_by) VALUES (?, ?, ?, ?, ?)",
      [user1Id, user2Id, "BLOCKED", null, userId],
    );
  }

  await producer.send({
    topic: "friendship-events",
    messages: [
      {
        value: JSON.stringify({
          event: "FRIEND_BLOCKED",
          data: {
            fromUserId: userId,
            toUserId: targetInfo.id,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });

  return { message: "Blocked" };
};

exports.unblockUser = async (userId, otherUserId, authToken = "") => {
  if (!otherUserId) throw new Error("Target user is required");
  if (userId === otherUserId) throw new Error("Invalid request");

  const existing = await getRelationship(userId, otherUserId);
  if (!existing || existing.status !== "BLOCKED") {
    throw new Error("Block not found");
  }
  if (existing.blocked_by !== userId) {
    throw new Error("Block not found");
  }

  const actorInfo = await fetchUserInfo(userId, authToken);
  if (!actorInfo) throw new Error("User service unavailable");
  if (!actorInfo.exists) throw new Error("User not found");
  const fromUserName = actorInfo.name || "";

  await db.execute("DELETE FROM friendships WHERE id = ?", [existing.id]);

  await producer.send({
    topic: "friendship-events",
    messages: [
      {
        value: JSON.stringify({
          event: "FRIEND_UNBLOCKED",
          data: {
            fromUserId: userId,
            toUserId: otherUserId,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });

  return { message: "Unblocked" };
};

exports.getStatus = async (userId, otherUserId) => {
  if (!otherUserId) throw new Error("Target user is required");
  if (userId === otherUserId) return { status: "SELF" };

  const existing = await getRelationship(userId, otherUserId);
  if (!existing) return { status: "NONE" };

  if (existing.status === "BLOCKED") {
    return {
      status: existing.blocked_by === userId ? "BLOCKED_BY_ME" : "BLOCKED_BY_OTHER",
    };
  }

  if (existing.status === "PENDING") {
    return {
      status: existing.requested_by === userId ? "REQUEST_SENT" : "REQUEST_RECEIVED",
    };
  }

  if (existing.status === "FRIENDS") {
    return { status: "FRIENDS" };
  }

  return { status: "NONE" };
};
