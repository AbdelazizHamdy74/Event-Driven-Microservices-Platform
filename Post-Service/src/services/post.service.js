const db = require("../config/db");
const { producer } = require("../config/kafka");

exports.createPost = async (userId, content) => {
  const [result] = await db.execute(
    "INSERT INTO posts (user_id, content) VALUES (?, ?)",
    [userId, content],
  );

  const post = { id: result.insertId, userId, content };

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

  return post;
};

exports.getMyPosts = async (userId) => {
  const [posts] = await db.execute("SELECT * FROM posts WHERE user_id = ?", [
    userId,
  ]);
  return posts;
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

  await producer.send({
    topic: "post-events",
    messages: [
      {
        value: JSON.stringify({
          event: "POST_UPDATED",
          data: { postId },
        }),
      },
    ],
  });
};

exports.deletePost = async (postId, user) => {
  const [rows] = await db.execute("SELECT * FROM posts WHERE id = ?", [postId]);

  if (!rows.length) throw new Error("Post not found");

  const post = rows[0];
  if (post.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("DELETE FROM posts WHERE id = ?", [postId]);

  await producer.send({
    topic: "post-events",
    messages: [
      {
        value: JSON.stringify({
          event: "POST_DELETED",
          data: { postId },
        }),
      },
    ],
  });
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
