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
