const express = require("express");
const router = express.Router();
const controller = require("../controllers/post.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.post("/", controller.createPost);
router.get("/:id", controller.getPostById);
router.get("/", controller.getMyPosts);
router.put("/:id", controller.updatePost);
router.delete("/:id", controller.deletePost);

module.exports = router;

// const express = require("express");
// const router = express.Router();
// const postController = require("../controllers/post.controller");

// router.post("/", postController.createPost);

// module.exports = router;
