const kafka = require("../config/kafka");
const db = require("../config/db");

const consumer = kafka.consumer({ groupId: "notification-group" });

const startConsumer = async () => {
  await consumer.connect();

  await consumer.subscribe({ topic: "user-events" });
  await consumer.subscribe({ topic: "post-events" });
  await consumer.subscribe({ topic: "chat-events" });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());

      let notification = null;

      switch (event.event) {
        case "USER_CREATED":
          notification = {
            userId: event.data.id,
            type: "USER_CREATED",
            message: `Welcome ${event.data.name}`,
          };
          break;

        case "POST_CREATED":
          notification = {
            userId: event.data.userId,
            type: "POST_CREATED",
            message: "You created a new post",
          };
          break;

        case "POST_UPDATED":
          notification = {
            userId: event.data.userId,
            type: "POST_UPDATED",
            message: "Your post was updated",
          };
          break;

        case "POST_DELETED":
          notification = {
            userId: event.data.userId,
            type: "POST_DELETED",
            message: "Your post was deleted",
          };
          break;

        case "CHAT_MESSAGE_CREATED":
          notification = {
            userId: event.data.toUserId,
            type: "CHAT_MESSAGE_CREATED",
            message: event.data.fromUserName
              ? `New message from ${event.data.fromUserName}`
              : `New message from user ${event.data.fromUserId}`,
          };
          break;
      }

      if (notification) {
        await db.execute(
          "INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)",
          [notification.userId, notification.type, notification.message],
        );

        console.log("Notification saved:", notification.message);
      }
    },
  });
};

module.exports = startConsumer;
