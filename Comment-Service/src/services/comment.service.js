const db = require("../config/db");
const { producer } = require("../config/kafka");

exports.createcomment = async (userId, content) => {
  const [result] = await db.execute(
    "INSERT INTO comments (user_id, content) VALUES (?, ?)",
    [userId, content],
  );

  const comment = { id: result.insertId, userId, content };

  await producer.send({
    topic: "comment-events",
    messages: [
      {
        value: JSON.stringify({
          event: "COMMENT_CREATED",
          data: comment,
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

exports.updatecomment = async (commentId, user) => {
  const [rows] = await db.execute("SELECT * FROM comments WHERE id = ?", [
    commentId,
  ]);

  if (!rows.length) throw new Error("comment not found");

  const comment = rows[0];
  if (comment.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("UPDATE comments SET content = ? WHERE id = ?", [
    user.content,
    commentId,
  ]);

  await producer.send({
    topic: "comment-events",
    messages: [
      {
        value: JSON.stringify({
          event: "COMMENT_UPDATED",
          data: { commentId },
        }),
      },
    ],
  });
};

exports.deletecomment = async (commentId, user) => {
  const [rows] = await db.execute("SELECT * FROM comments WHERE id = ?", [
    commentId,
  ]);

  if (!rows.length) throw new Error("comment not found");

  const comment = rows[0];
  if (comment.user_id !== user.id && user.role !== "admin") {
    throw new Error("Forbidden");
  }

  await db.execute("DELETE FROM comments WHERE id = ?", [commentId]);

  await producer.send({
    topic: "comment-events",
    messages: [
      {
        value: JSON.stringify({
          event: "COMMENT_DELETED",
          data: { commentId },
        }),
      },
    ],
  });
};
