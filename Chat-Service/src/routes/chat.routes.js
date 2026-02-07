const express = require("express");
const router = express.Router();
const controller = require("../controllers/chat.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.get("/", controller.getMyConversations);
router.get("/:otherUserId/messages", controller.getMessages);
router.post("/:otherUserId/messages", controller.sendMessage);

module.exports = router;
