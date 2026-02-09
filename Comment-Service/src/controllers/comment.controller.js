const commentService = require("../services/comment.service");

exports.createcomment = async (req, res) => {
  const comment = await commentService.createcomment(
    req.user.id,
    Number(req.params.postId),
    req.body.content,
    req.headers.authorization || "",
  );
  res.status(201).json(comment);
};

exports.getMycomments = async (req, res) => {
  const comments = await commentService.getMycomments(req.user.id);
  res.json(comments);
};

exports.getCommentsByPost = async (req, res) => {
  const comments = await commentService.getCommentsByPost(
    Number(req.params.postId),
  );
  res.json(comments);
};

exports.getCommentByPost = async (req, res) => {
  const comment = await commentService.getCommentByPost(
    Number(req.params.postId),
    Number(req.params.commentId),
  );
  if (!comment) return res.status(404).json({ message: "comment not found" });
  res.json(comment);
};

exports.updatecomment = async (req, res) => {
  await commentService.updatecomment(
    Number(req.params.commentId),
    Number(req.params.postId),
    {
      id: req.user.id,
      role: req.user.role,
      content: req.body.content,
    },
    req.headers.authorization || "",
  );
  res.json({ message: "comment updated" });
};

exports.deletecomment = async (req, res) => {
  await commentService.deletecomment(
    Number(req.params.commentId),
    Number(req.params.postId),
    req.user,
    req.headers.authorization || "",
  );
  res.json({ message: "comment deleted" });
};
