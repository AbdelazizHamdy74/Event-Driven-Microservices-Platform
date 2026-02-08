const express = require("express");
const router = express.Router();
const controller = require("../controllers/comment.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.post("/", controller.createcomment);
router.get("/", controller.getMycomments);
router.put("/:id", controller.updatecomment);
router.delete("/:id", controller.deletecomment);

module.exports = router;
