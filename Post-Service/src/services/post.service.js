const db = require("../config/db");
const { producer } = require("../config/kafka");

exports.createPost = async (userId, content) => {
  const [result] = await db.execute(
    "INSERT INTO posts (user_id, content) VALUES (?, ?)",
    [userId, content],
  );

  const post = { id: result.insertId, userId, content };

  try {
    await producer.send({
      topic: "post-events",
      messages: [
        {
          value: JSON.stringify({
            event: "POST_CREATED",
            data: post,
          }),
        },
      ],
    });
  } catch (err) {
    console.error(
      "[post-service] Kafka publish failed (POST_CREATED); post row was created.",
      err?.stack || err?.message || err,
    );
  }

  return post;
};

exports.getMyPosts = async (userId) => {
  const [posts] = await db.execute(
    "SELECT id, user_id, content, created_at, updated_at FROM posts WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
  return posts;
};

exports.getPostsByUserId = async (userId) => {
  const [posts] = await db.execute(
    "SELECT id, user_id, content, created_at, updated_at FROM posts WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
  return posts;
};

exports.getFeedPosts = async (userIds) => {
  const ids = Array.isArray(userIds) ? userIds : [];
  const normalized = ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  const unique = Array.from(new Set(normalized)).slice(0, 200);
  if (!unique.length) return [];

  const placeholders = unique.map(() => "?").join(",");
  const [posts] = await db.execute(
    `SELECT id, user_id, content, created_at, updated_at FROM posts WHERE user_id IN (${placeholders}) ORDER BY created_at DESC`,
    unique,
  );
  return posts;
};

exports.getPostById = async (postId) => {
  const [rows] = await db.execute(
    "SELECT id, user_id, content, created_at FROM posts WHERE id = ?",
    [postId],
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    userId: rows[0].user_id,
    content: rows[0].content,
    createdAt: rows[0].created_at,
  };
};

exports.updatePost = async (postId, user) => {
  const [rows] = await db.execute("SELECT * FROM posts WHERE id = ?", [postId]);

  if (!rows.length) throw new Error("Post not found");

  const post = rows[0];
  if (post.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("UPDATE posts SET content = ? WHERE id = ?", [
    user.content,
    postId,
  ]);

  try {
    await producer.send({
      topic: "post-events",
      messages: [
        {
          value: JSON.stringify({
            event: "POST_UPDATED",
            data: { postId, userId: post.user_id },
          }),
        },
      ],
    });
  } catch (err) {
    console.error(
      "[post-service] Kafka publish failed (POST_UPDATED).",
      err?.stack || err?.message || err,
    );
  }
};

exports.deletePost = async (postId, user) => {
  const [rows] = await db.execute("SELECT * FROM posts WHERE id = ?", [postId]);

  if (!rows.length) throw new Error("Post not found");

  const post = rows[0];
  if (post.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("DELETE FROM posts WHERE id = ?", [postId]);

  try {
    await producer.send({
      topic: "post-events",
      messages: [
        {
          value: JSON.stringify({
            event: "POST_DELETED",
            data: { postId, userId: post.user_id },
          }),
        },
      ],
    });
  } catch (err) {
    console.error(
      "[post-service] Kafka publish failed (POST_DELETED).",
      err?.stack || err?.message || err,
    );
  }
};

// const db = require("../config/db");
// const { producer } = require("../config/kafka");

// exports.createPost = async (postData) => {
//   const { userId, content } = postData;

//   const [result] = await db.execute(
//     "INSERT INTO posts (user_id, content) VALUES (?, ?)",
//     [userId, content],
//   );

//   const post = {
//     id: result.insertId,
//     userId,
//     content,
//   };

//   // Send Kafka Event
//   await producer.send({
//     topic: "post-events",
//     messages: [
//       {
//         value: JSON.stringify({
//           event: "POST_CREATED",
//           data: post,
//         }),
//       },
//     ],
//   });

//   return post;
// };
