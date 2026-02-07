const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/", userController.createUser);
router.get("/:id", auth, userController.getUserById);

module.exports = router;
