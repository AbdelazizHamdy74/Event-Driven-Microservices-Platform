const express = require("express");
const router = express.Router();
const controller = require("../controllers/chat.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.get("/incoming", controller.listIncomingMessageRequests);
router.post("/:fromUserId/accept", controller.acceptMessageRequest);
router.post("/:fromUserId/decline", controller.declineMessageRequest);
router.post("/:toUserId", controller.sendMessageRequest);

module.exports = router;
