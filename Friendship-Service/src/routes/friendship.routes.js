const express = require("express");
const router = express.Router();
const controller = require("../controllers/friendship.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.post("/requests/:userId", controller.sendRequest);
router.post("/requests/:userId/accept", controller.acceptRequest);
router.post("/requests/:userId/reject", controller.rejectRequest);
router.post("/requests/:userId/cancel", controller.cancelRequest);

router.post("/blocks/:userId", controller.blockUser);
router.delete("/blocks/:userId", controller.unblockUser);

router.get("/friends", controller.getFriends);
router.get("/requests", controller.getRequests);
router.get("/status/:userId", controller.getStatus);

module.exports = router;
