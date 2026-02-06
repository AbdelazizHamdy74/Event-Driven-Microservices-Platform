const authService = require("../services/auth.service");

exports.signup = async (req, res) => {
  const user = await authService.signup(req.body);
  res.status(201).json(user);
};

exports.login = async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
};

exports.getAllUsers = async (req, res) => {
  const users = await authService.getAllUsers();
  res.json(users);
};
