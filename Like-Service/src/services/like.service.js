const db = require("../config/db");
const { producer } = require("../config/kafka");
const axios = require("axios");

const createError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

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

const fetchPost = async (postId, authToken) => {
  const baseUrl = process.env.POST_SERVICE_URL || "http://localhost:3002";
  if (!baseUrl) return null;

  try {
    const headers = {};
    if (authToken) headers.Authorization = authToken;

    const response = await axios.get(`${baseUrl}/posts/${postId}`, {
      timeout: 3000,
      headers,
    });

    if (!response.data?.id) return null;

    return {
      id: response.data.id,
      userId: Number(response.data.userId),
      exists: true,
    };
  } catch (err) {
    if (err.response?.status === 404) {
      return { exists: false };
    }
    return null;
  }
};

const validatePostOwner = async (postOwnerId, authToken) => {
  if (!postOwnerId) throw new Error("Post owner is required");
  const ownerInfo = await fetchUserInfo(postOwnerId, authToken);
  if (!ownerInfo) throw new Error("User service unavailable");
  if (!ownerInfo.exists) throw new Error("Post owner not found");
  return ownerInfo;
};

// exports.likePost = async (
//   userId,
//   postId,
//   postOwnerId,
//   options = {},
//   authToken = "",
// ) => {
//   if (!postId) throw new Error("Post is required");

//   const ownerInfo = await validatePostOwner(postOwnerId, authToken);

//   let userName =
//     typeof options.userName === "string" ? options.userName.trim() : "";
//   if (!userName) {
//     const actorInfo = await fetchUserInfo(userId, authToken);
//     if (!actorInfo) throw new Error("User service unavailable");
//     if (!actorInfo.exists) throw new Error("User not found");
//     userName = actorInfo.name || "";
//   }

//   let result;
//   try {
//     [result] = await db.execute(
//       "INSERT INTO likes (post_id, user_id, post_owner_id) VALUES (?, ?, ?)",
//       [postId, userId, ownerInfo.id],
//     );
//   } catch (err) {
//     if (err.code === "ER_DUP_ENTRY") {
//       throw new Error("Already liked");
//     }
//     throw err;
//   }

//   const like = {
//     id: result.insertId,
//     postId,
//     postOwnerId: ownerInfo.id,
//     userId,
//   };

//   await producer.send({
//     topic: "like-events",
//     messages: [
//       {
//         value: JSON.stringify({
//           event: "POST_LIKED",
//           data: {
//             postId,
//             postOwnerId: ownerInfo.id,
//             fromUserId: userId,
//             fromUserName: userName || null,
//           },
//         }),
//       },
//     ],
//   });

//   return like;
// };

exports.likePost = async (userId, postId, authToken = "") => {
  if (!postId) throw createError("Post is required", 400);

  const post = await fetchPost(postId, authToken);

  if (!post) throw createError("Post service unavailable", 503);
  if (!post.exists) throw createError("Post not found", 404);

  const postOwnerId = post.userId;

  const actorInfo = await fetchUserInfo(userId, authToken);

  if (!actorInfo) throw createError("User service unavailable", 503);
  if (!actorInfo.exists) throw createError("User not found", 404);

  const userName = actorInfo.name || null;

  let result;

  try {
    [result] = await db.execute(
      "INSERT INTO likes (post_id, user_id, post_owner_id) VALUES (?, ?, ?)",
      [postId, userId, postOwnerId],
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw createError("Already liked", 409);
    }
    throw err;
  }

  const like = {
    id: result.insertId,
    postId,
    postOwnerId,
    userId,
  };

  try {
    await producer.send({
      topic: "like-events",
      messages: [
        {
          value: JSON.stringify({
            event: "POST_LIKED",
            data: {
              postId,
              postOwnerId,
              fromUserId: userId,
              fromUserName: userName,
            },
          }),
        },
      ],
    });
  } catch (err) {
    console.error(
      "[like-service] Kafka publish failed (POST_LIKED); like row was created.",
      err?.stack || err?.message || err,
    );
  }

  return like;
};

exports.unlikePost = async (userId, postId, authToken = "") => {
  if (!postId) throw createError("Post is required", 400);

  const [likes] = await db.execute(
    "SELECT post_owner_id FROM likes WHERE post_id = ? AND user_id = ? LIMIT 1",
    [postId, userId],
  );

  if (!likes.length) throw createError("Like not found", 404);

  const postOwnerId = Number(likes[0].post_owner_id);
  const actorInfo = await fetchUserInfo(userId, authToken);
  const fromUserName =
    actorInfo && actorInfo.exists ? actorInfo.name || null : null;

  const [result] = await db.execute(
    "DELETE FROM likes WHERE post_id = ? AND user_id = ?",
    [postId, userId],
  );

  if (!result.affectedRows) throw createError("Like not found", 404);

  try {
    await producer.send({
      topic: "like-events",
      messages: [
        {
          value: JSON.stringify({
            event: "POST_UNLIKED",
            data: {
              postId,
              postOwnerId,
              fromUserId: userId,
              fromUserName,
            },
          }),
        },
      ],
    });
  } catch (err) {
    console.error(
      "[like-service] Kafka publish failed (POST_UNLIKED).",
      err?.stack || err?.message || err,
    );
  }

  return { message: "Unliked" };
};

exports.getLikeCount = async (postId) => {
  if (!postId) throw createError("Post is required", 400);

  const [rows] = await db.execute(
    "SELECT COUNT(*) AS count FROM likes WHERE post_id = ?",
    [postId],
  );

  return Number(rows[0]?.count || 0);
};

exports.getMyLikeStatus = async (userId, postId) => {
  if (!postId) throw createError("Post is required", 400);

  const [rows] = await db.execute(
    "SELECT id FROM likes WHERE post_id = ? AND user_id = ? LIMIT 1",
    [postId, userId],
  );

  return { postId, liked: Boolean(rows.length) };
};
