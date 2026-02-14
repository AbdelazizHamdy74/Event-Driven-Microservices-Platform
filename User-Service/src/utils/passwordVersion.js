const crypto = require("crypto");

const buildPasswordVersion = (hashedPassword) =>
  crypto.createHash("sha256").update(String(hashedPassword || "")).digest("hex");

module.exports = {
  buildPasswordVersion,
};
