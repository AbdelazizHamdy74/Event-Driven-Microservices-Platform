const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { buildPasswordVersion } = require("../utils/passwordVersion");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await db.execute(
      "SELECT id, role, password FROM users WHERE id = ? LIMIT 1",
      [decoded.id],
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = rows[0];
    if (typeof decoded.pwdv !== "string") {
      return res.status(401).json({ message: "Session expired, please login again" });
    }

    const currentPasswordVersion = buildPasswordVersion(user.password);
    if (decoded.pwdv !== currentPasswordVersion) {
      return res
        .status(401)
        .json({ message: "Token expired after password change" });
    }

    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};
