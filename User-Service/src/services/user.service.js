const db = require("../config/db");
const { producer } = require("../config/kafka");

exports.createUser = async (userData) => {
  const { name, email } = userData;

  const [result] = await db.execute(
    "INSERT INTO users (name, email) VALUES (?, ?)",
    [name, email],
  );

  const user = {
    id: result.insertId,
    name,
    email,
  };

  // Send Kafka Event
  await producer.send({
    topic: "user-events",
    messages: [
      {
        value: JSON.stringify({
          event: "USER_CREATED",
          data: user,
        }),
      },
    ],
  });

  return user;
};

exports.getUserById = async (id) => {
  const [rows] = await db.execute(
    "SELECT id, name, email FROM users WHERE id = ?",
    [id],
  );
  if (!rows.length) return null;
  return rows[0];
};
