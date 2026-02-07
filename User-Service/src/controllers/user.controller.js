const userService = require("../services/user.service");

exports.createUser = async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json(user);
};

exports.getUserById = async (req, res) => {
  const requestedId = Number(req.params.id);
  const user = await userService.getUserById(requestedId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
};
