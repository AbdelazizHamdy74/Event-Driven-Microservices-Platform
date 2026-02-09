const express = require("express");
const router = express.Router();
const controller = require("../controllers/comment.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.post("/posts/:postId", controller.createcomment);
router.get("/posts/:postId", controller.getCommentsByPost);
router.get("/posts/:postId/:commentId", controller.getCommentByPost);
router.put("/posts/:postId/:commentId", controller.updatecomment);
router.delete("/posts/:postId/:commentId", controller.deletecomment);

router.get("/", controller.getMycomments);

module.exports = router;
