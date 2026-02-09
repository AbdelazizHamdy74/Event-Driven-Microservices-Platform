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

const fetchPostInfo = async (postId, authToken) => {
  const baseUrl = process.env.POST_SERVICE_URL;
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
      userId: response.data.userId,
    };
  } catch (err) {
    if (err.response?.status === 404) return { exists: false };
    return null;
  }
};

const getPostOrFail = async (postId, authToken) => {
  if (!postId) throw new Error("Post is required");
  const post = await fetchPostInfo(postId, authToken);
  if (!post) throw new Error("Post service unavailable");
  if (post.exists === false) throw new Error("Post not found");
  return post;
};

const formatUserName = (value) =>
  typeof value === "string" ? value.trim().slice(0, 150) : "";

exports.createcomment = async (userId, postId, content, authToken = "") => {
  const post = await getPostOrFail(postId, authToken);

  const [result] = await db.execute(
    "INSERT INTO comments (post_id, post_owner_id, user_id, content) VALUES (?, ?, ?, ?)",
    [post.id, post.userId, userId, content],
  );

  const comment = { id: result.insertId, postId: post.id, userId, content };

  let fromUserName = "";
  const actorInfo = await fetchUserInfo(userId, authToken);
  if (!actorInfo) throw new Error("User service unavailable");
  if (!actorInfo.exists) throw new Error("User not found");
  fromUserName = actorInfo.name || "";

  await producer.send({
    topic: "comment-events",
    messages: [
      {
        value: JSON.stringify({
          event: "COMMENT_CREATED",
          data: {
            commentId: comment.id,
            postId: post.id,
            postOwnerId: post.userId,
            fromUserId: userId,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });

  return comment;
};

exports.getMycomments = async (userId) => {
  const [comments] = await db.execute(
    "SELECT * FROM comments WHERE user_id = ?",
    [userId],
  );
  return comments;
};

exports.getCommentsByPost = async (postId) => {
  const [comments] = await db.execute(
    "SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC",
    [postId],
  );
  return comments;
};

exports.getCommentByPost = async (postId, commentId) => {
  const [rows] = await db.execute(
    "SELECT * FROM comments WHERE id = ? AND post_id = ?",
    [commentId, postId],
  );
  if (!rows.length) return null;
  return rows[0];
};

exports.updatecomment = async (
  commentId,
  postId,
  user,
  authToken = "",
) => {
  const [rows] = await db.execute(
    "SELECT * FROM comments WHERE id = ? AND post_id = ?",
    [commentId, postId],
  );

  if (!rows.length) throw new Error("comment not found");

  const comment = rows[0];
  if (comment.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("UPDATE comments SET content = ? WHERE id = ?", [
    user.content,
    commentId,
  ]);

  let fromUserName = "";
  const actorInfo = await fetchUserInfo(user.id, authToken);
  if (!actorInfo) throw new Error("User service unavailable");
  if (!actorInfo.exists) throw new Error("User not found");
  fromUserName = actorInfo.name || "";

  await producer.send({
    topic: "comment-events",
    messages: [
      {
        value: JSON.stringify({
          event: "COMMENT_UPDATED",
          data: {
            commentId,
            postId: comment.post_id,
            postOwnerId: comment.post_owner_id,
            fromUserId: user.id,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });
};

exports.deletecomment = async (
  commentId,
  postId,
  user,
  authToken = "",
) => {
  const [rows] = await db.execute(
    "SELECT * FROM comments WHERE id = ? AND post_id = ?",
    [commentId, postId],
  );

  if (!rows.length) throw new Error("comment not found");

  const comment = rows[0];
  if (comment.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("DELETE FROM comments WHERE id = ?", [commentId]);

  let fromUserName = "";
  const actorInfo = await fetchUserInfo(user.id, authToken);
  if (!actorInfo) throw new Error("User service unavailable");
  if (!actorInfo.exists) throw new Error("User not found");
  fromUserName = actorInfo.name || "";

  await producer.send({
    topic: "comment-events",
    messages: [
      {
        value: JSON.stringify({
          event: "COMMENT_DELETED",
          data: {
            commentId,
            postId: comment.post_id,
            postOwnerId: comment.post_owner_id,
            fromUserId: user.id,
            fromUserName: fromUserName || null,
          },
        }),
      },
    ],
  });
};
