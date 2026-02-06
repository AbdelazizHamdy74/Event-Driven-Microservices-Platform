require("dotenv").config();
const express = require("express");
const userRoutes = require("./routes/user.routes");
const authRoute = require("./routes/auth.routes");
const { connectProducer } = require("./config/kafka");

const app = express();
app.use(express.json());

app.use("/users", userRoutes);
app.use("/auth", authRoute);
const startServer = async () => {
  await connectProducer();

  app.listen(process.env.PORT, () => {
    console.log(`User Service running on port ${process.env.PORT}`);
  });
};

startServer();
