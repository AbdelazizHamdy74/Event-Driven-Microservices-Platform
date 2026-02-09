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

exports.updateUser = async (req, res) => {
  const requestedId = Number(req.params.id);
  if (req.user.id !== requestedId && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const user = await userService.updateUser(requestedId, req.body);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    if (err.message === "No valid fields to update") {
      return res.status(400).json({ message: err.message });
    }
    throw err;
  }
};

exports.deleteUser = async (req, res) => {
  const requestedId = Number(req.params.id);
  if (req.user.id !== requestedId && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const deleted = await userService.deleteUser(requestedId);
  if (!deleted) return res.status(404).json({ message: "User not found" });
  res.json({ message: "User deleted" });
};
