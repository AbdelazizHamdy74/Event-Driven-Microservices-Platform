const express = require("express");
const router = express.Router();
const controller = require("../controllers/like.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.post("/posts/:postId", controller.likePost);
router.delete("/posts/:postId", controller.unlikePost);
router.get("/posts/:postId/count", controller.getLikeCount);

module.exports = router;
