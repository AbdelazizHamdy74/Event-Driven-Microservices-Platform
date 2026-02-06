const express = require("express");
const router = express.Router();
const controller = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

router.post("/signup", controller.signup);
router.post("/login", controller.login);
router.get("/users", auth, admin, controller.getAllUsers);

module.exports = router;
