require("dotenv").config();
const express = require("express");
const postRoutes = require("./routes/post.routes");
const { connectProducer } = require("./config/kafka");

const app = express();
app.use(express.json());

app.use("/posts", postRoutes);

const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`Post Service running on port ${process.env.PORT}`);
  });
};

startServer();
