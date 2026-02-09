const kafka = require("../config/kafka");
const db = require("../config/db");

const consumer = kafka.consumer({ groupId: "notification-group" });

const startConsumer = async () => {
  await consumer.connect();

  await consumer.subscribe({ topic: "user-events" });
  await consumer.subscribe({ topic: "post-events" });
  await consumer.subscribe({ topic: "chat-events" });
  await consumer.subscribe({ topic: "comment-events" });
  await consumer.subscribe({ topic: "like-events" });
  await consumer.subscribe({ topic: "friendship-events" });

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

        case "COMMENT_CREATED":
          if (event.data.postOwnerId === event.data.fromUserId) break;
          notification = {
            userId: event.data.postOwnerId,
            type: "COMMENT_CREATED",
            message: event.data.fromUserName
              ? `${event.data.fromUserName} commented on your post`
              : `User ${event.data.fromUserId} commented on your post`,
          };
          break;

        case "COMMENT_UPDATED":
          if (event.data.postOwnerId === event.data.fromUserId) break;
          notification = {
            userId: event.data.postOwnerId,
            type: "COMMENT_UPDATED",
            message: event.data.fromUserName
              ? `${event.data.fromUserName} updated a comment on your post`
              : `User ${event.data.fromUserId} updated a comment on your post`,
          };
          break;

        case "COMMENT_DELETED":
          if (event.data.postOwnerId === event.data.fromUserId) break;
          notification = {
            userId: event.data.postOwnerId,
            type: "COMMENT_DELETED",
            message: event.data.fromUserName
              ? `${event.data.fromUserName} deleted a comment on your post`
              : `User ${event.data.fromUserId} deleted a comment on your post`,
          };
          break;

        case "POST_LIKED":
          if (event.data.postOwnerId === event.data.fromUserId) break;
          notification = {
            userId: event.data.postOwnerId,
            type: "POST_LIKED",
            message: event.data.fromUserName
              ? `${event.data.fromUserName} liked your post`
              : `User ${event.data.fromUserId} liked your post`,
          };
          break;

        case "FRIEND_REQUEST_SENT":
          notification = {
            userId: event.data.toUserId,
            type: "FRIEND_REQUEST_SENT",
            message: event.data.fromUserName
              ? `New friend request from ${event.data.fromUserName}`
              : `New friend request from user ${event.data.fromUserId}`,
          };
          break;

        case "FRIEND_REQUEST_ACCEPTED":
          notification = {
            userId: event.data.toUserId,
            type: "FRIEND_REQUEST_ACCEPTED",
            message: event.data.fromUserName
              ? `${event.data.fromUserName} accepted your request`
              : `User ${event.data.fromUserId} accepted your request`,
          };
          break;

        case "FRIEND_REQUEST_REJECTED":
          notification = {
            userId: event.data.toUserId,
            type: "FRIEND_REQUEST_REJECTED",
            message: event.data.fromUserName
              ? `${event.data.fromUserName} rejected your request`
              : `User ${event.data.fromUserId} rejected your request`,
          };
          break;

        case "FRIEND_BLOCKED":
          notification = {
            userId: event.data.toUserId,
            type: "FRIEND_BLOCKED",
            message: `User ${event.data.fromUserId} blocked you`,
          };
          break;

        case "FRIEND_UNBLOCKED":
          notification = {
            userId: event.data.toUserId,
            type: "FRIEND_UNBLOCKED",
            message: `User ${event.data.fromUserId} unblocked you`,
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
