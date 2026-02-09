require("dotenv").config();
const express = require("express");
const likeRoutes = require("./routes/like.routes");
const { connectProducer } = require("./config/kafka");

const app = express();
app.use(express.json());

app.use("/likes", likeRoutes);

const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`Like Service running on port ${process.env.PORT}`);
  });
};

startServer();
