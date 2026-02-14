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

exports.resetPassword = async (req, res) => {
  const result = await authService.resetPassword(req.user.id, req.body);
  res.json(result);
};

exports.forgotPassword = async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  res.json(result);
};

exports.resetPasswordWithOtp = async (req, res) => {
  const result = await authService.resetPasswordWithOtp(req.body);
  res.json(result);
};

exports.getSession = async (req, res) => {
  res.json({
    user: req.user,
  });
};
