require("dotenv").config();
const express = require("express");
const cors = require("cors");
const commentRoutes = require("./routes/comment.routes");
const { connectProducer } = require("./config/kafka");

const app = express();
app.use(express.json());
app.use(cors());

app.use("/comments", commentRoutes);

const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`Comment Service running on port ${process.env.PORT}`);
  });
};

startServer();
