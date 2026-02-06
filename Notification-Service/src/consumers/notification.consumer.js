const kafka = require("../config/kafka");
const db = require("../config/db");

const consumer = kafka.consumer({ groupId: "notification-group" });

const startConsumer = async () => {
  await consumer.connect();

  await consumer.subscribe({ topic: "user-events" });
  await consumer.subscribe({ topic: "post-events" });

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

// const kafka = require("../config/kafka");

// const consumer = kafka.consumer({ groupId: "notification-group" });

// const startConsumer = async () => {
//   await consumer.connect();

//   await consumer.subscribe({ topic: "user-events" });
//   await consumer.subscribe({ topic: "post-events" });

//   await consumer.run({
//     eachMessage: async ({ topic, message }) => {
//       const event = JSON.parse(message.value.toString());

//       if (event.event === "USER_CREATED") {
//         console.log(
//           `New User Registered: ${event.data.name} (${event.data.email})`,
//         );
//       }

//       if (event.event === "POST_CREATED") {
//         console.log(
//           `New Post Created by User ${event.data.userId}: ${event.data.content}`,
//         );
//       }
//     },
//   });
// };

// module.exports = startConsumer;
