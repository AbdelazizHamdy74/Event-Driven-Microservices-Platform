const commentService = require("../services/comment.service");

exports.createcomment = async (req, res) => {
  const comment = await commentService.createcomment(
    req.user.id,
    req.body.content,
  );
  res.status(201).json(comment);
};

exports.getMycomments = async (req, res) => {
  const comments = await commentService.getMycomments(req.user.id);
  res.json(comments);
};

exports.updatecomment = async (req, res) => {
  await commentService.updatecomment(req.params.id, {
    id: req.user.id,
    role: req.user.role,
    content: req.body.content,
  });
  res.json({ message: "comment updated" });
};

exports.deletecomment = async (req, res) => {
  await commentService.deletecomment(req.params.id, req.user);
  res.json({ message: "comment deleted" });
};
