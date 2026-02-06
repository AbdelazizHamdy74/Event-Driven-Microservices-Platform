require("dotenv").config();
const startConsumer = require("./consumers/notification.consumer");

startConsumer().then(() => {
  console.log("Notification Service listening to events...");
});
