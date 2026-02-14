const jwt = require("jsonwebtoken");
const { validateUserSession } = require("../../../shared/auth/validateUserSession");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    const session = await validateUserSession({
      authorization: req.headers.authorization,
      userServiceUrl: process.env.USER_SERVICE_URL || "http://localhost:3001",
      timeoutMs: Number(process.env.AUTH_CHECK_TIMEOUT_MS) || 3000,
    });

    if (!session.ok) {
      if (session.status === 401 || session.status === 403) {
        return res.status(401).json({ message: session.message || "Unauthorized" });
      }
      return res.status(502).json({ message: "Auth service unavailable" });
    }

    req.user = session.user;
    next();
  } catch (error) {
    next(error);
  }
};
