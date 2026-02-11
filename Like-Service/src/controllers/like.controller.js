const likeService = require("../services/like.service");

// exports.likePost = async (req, res) => {
//   const like = await likeService.likePost(
//     req.user.id,
//     Number(req.params.postId),
//     Number(req.body.postOwnerId),
//     {
//       userName: req.body.userName,
//     },
//     req.headers.authorization || "",
//   );
//   res.status(201).json(like);
// };
exports.likePost = async (req, res) => {
  const like = await likeService.likePost(
    req.user.id,
    Number(req.params.postId),
    req.headers.authorization || "",
  );

  res.status(201).json(like);
};

exports.unlikePost = async (req, res) => {
  const result = await likeService.unlikePost(
    req.user.id,
    Number(req.params.postId),
    req.headers.authorization || "",
  );
  res.json(result);
};

exports.getLikeCount = async (req, res) => {
  const count = await likeService.getLikeCount(Number(req.params.postId));
  res.json({ postId: Number(req.params.postId), count });
};
