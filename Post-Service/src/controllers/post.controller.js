const postService = require("../services/post.service");

exports.createPost = async (req, res) => {
  const post = await postService.createPost(req.user.id, req.body.content);
  res.status(201).json(post);
};

exports.getMyPosts = async (req, res) => {
  const posts = await postService.getMyPosts(req.user.id);
  res.json(posts);
};

exports.getPostsByUserId = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const posts = await postService.getPostsByUserId(userId);
  res.json(posts);
};

exports.getFeed = async (req, res) => {
  const raw = typeof req.query.userIds === "string" ? req.query.userIds : "";
  const userIds = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  // Always include current user in feed
  userIds.push(req.user.id);

  const posts = await postService.getFeedPosts(userIds);
  res.json(posts);
};

exports.getPostById = async (req, res) => {
  const post = await postService.getPostById(Number(req.params.id));
  if (!post) return res.status(404).json({ message: "Post not found" });
  res.json(post);
};

exports.updatePost = async (req, res) => {
  await postService.updatePost(req.params.id, {
    id: req.user.id,
    role: req.user.role,
    content: req.body.content,
  });
  res.json({ message: "Post updated" });
};

exports.deletePost = async (req, res) => {
  await postService.deletePost(req.params.id, req.user);
  res.json({ message: "Post deleted" });
};

// const postService = require("../services/post.service");

// exports.createPost = async (req, res) => {
//   const post = await postService.createPost(req.body);
//   res.status(201).json(post);
// };
