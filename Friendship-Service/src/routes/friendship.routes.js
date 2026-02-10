const express = require("express");
const router = express.Router();
const controller = require("../controllers/friendship.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);

router.post("/requests/:userId", controller.sendRequest);
router.post("/requests/:userId/accept", controller.acceptRequest);
router.post("/requests/:userId/reject", controller.rejectRequest);

router.post("/blocks/:userId", controller.blockUser);
router.delete("/blocks/:userId", controller.unblockUser);

router.get("/status/:userId", controller.getStatus);

module.exports = router;
