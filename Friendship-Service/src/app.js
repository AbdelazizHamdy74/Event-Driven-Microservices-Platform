require("dotenv").config();
const express = require("express");
const friendshipRoutes = require("./routes/friendship.routes");
const { connectProducer } = require("./config/kafka");

const app = express();
app.use(express.json());

app.use("/friendships", friendshipRoutes);

const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`Friendship Service running on port ${process.env.PORT}`);
  });
};

startServer();
