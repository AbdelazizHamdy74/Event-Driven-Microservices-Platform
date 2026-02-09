const { kafka } = require("../config/kafka");
const db = require("../config/db");

const consumer = kafka.consumer({ groupId: "comment-group" });

const startPostConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: "post-events" });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());

      if (event.event === "POST_DELETED" && event.data?.postId) {
        await db.execute("DELETE FROM comments WHERE post_id = ?", [
          event.data.postId,
        ]);
      }
    },
  });
};

module.exports = startPostConsumer;
