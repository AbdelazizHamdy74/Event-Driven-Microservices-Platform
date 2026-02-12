const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { producer } = require("../config/kafka");
const { sendEmail } = require("../utils/sendEmail");

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 10;
const OTP_SUCCESS_MESSAGE = "If this email exists, OTP has been sent";

const createError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const sendForgotPasswordEmail = async ({ email, name, otp }) => {
  await sendEmail({
    to: email,
    subject: "Your password reset OTP",
    text: `Hello ${name || "User"}, your OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
};

exports.signup = async ({ name, email, password }) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const normalizedEmail = email.trim().toLowerCase();

  const [result] = await db.execute(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, normalizedEmail, hashedPassword],
  );

  const user = {
    id: result.insertId,
    name,
    email: normalizedEmail,
    role: "user",
  };

  await producer.send({
    topic: "user-events",
    messages: [
      {
        value: JSON.stringify({
          event: "USER_CREATED",
          data: user,
        }),
      },
    ],
  });

  return user;
};

exports.login = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [
    normalizedEmail,
  ]);

  if (!rows.length) throw new Error("Invalid credentials");

  const user = rows[0];
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  return { token };
};

exports.getAllUsers = async () => {
  const [users] = await db.execute("SELECT id, name, email, role FROM users");
  return users;
};

exports.resetPassword = async (userId, { oldPassword, newPassword }) => {
  if (!oldPassword || !newPassword) {
    throw createError("oldPassword and newPassword are required", 400);
  }

  const [rows] = await db.execute(
    "SELECT id, password FROM users WHERE id = ?",
    [userId],
  );

  if (!rows.length) {
    throw createError("User not found", 404);
  }

  const user = rows[0];

  if (!user.password) {
    throw createError("Password reset is not available for this account", 400);
  }

  const oldPasswordMatch = await bcrypt.compare(oldPassword, user.password);

  if (!oldPasswordMatch) {
    throw createError("Old password is incorrect", 400);
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);

  if (isSamePassword) {
    throw createError("New password must be different from old password", 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await db.execute(
    await db.execute("UPDATE users SET password = ? WHERE id = ?"),
    [hashedPassword, userId],
  );

  return { message: "Password reset successful" };
};

exports.forgotPassword = async ({ email }) => {
  if (typeof email !== "string" || !email.trim()) {
    throw createError("Email is required", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [rows] = await db.execute(
    "SELECT id, name, email FROM users WHERE email = ?",
    [normalizedEmail],
  );

  if (!rows.length) {
    return { message: OTP_SUCCESS_MESSAGE };
  }

  const user = rows[0];
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db.execute("DELETE FROM password_reset_otps WHERE user_id = ?", [
    user.id,
  ]);

  await db.execute(
    "INSERT INTO password_reset_otps (user_id, otp_hash, expires_at) VALUES (?, ?, ?)",
    [user.id, otpHash, expiresAt],
  );

  await sendForgotPasswordEmail({
    email: user.email,
    name: user.name,
    otp,
  });

  return { message: OTP_SUCCESS_MESSAGE };
};

exports.resetPasswordWithOtp = async ({ email, otp, newPassword }) => {
  if (typeof email !== "string" || !email.trim()) {
    throw createError("Email is required", 400);
  }

  if (typeof otp !== "string" || !otp.trim()) {
    throw createError("OTP is required", 400);
  }

  if (typeof newPassword !== "string" || !newPassword) {
    throw createError("newPassword is required", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      "SELECT id, password FROM users WHERE email = ? FOR UPDATE",
      [normalizedEmail],
    );

    if (!userRows.length) {
      throw createError("Invalid or expired OTP", 400);
    }

    const user = userRows[0];

    if (user.password) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        throw createError(
          "New password must be different from old password",
          400,
        );
      }
    }

    const otpHash = hashOtp(otp.trim());

    const [otpRows] = await connection.execute(
      [
        "SELECT id, expires_at, used_at",
        "FROM password_reset_otps",
        "WHERE user_id = ? AND otp_hash = ?",
        "ORDER BY id DESC",
        "LIMIT 1 FOR UPDATE",
      ].join(" "),
      [user.id, otpHash],
    );

    if (!otpRows.length) {
      throw createError("Invalid or expired OTP", 400);
    }

    const otpRecord = otpRows[0];

    if (otpRecord.used_at) {
      throw createError("OTP already used", 400);
    }

    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      throw createError("OTP expired", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await connection.execute("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      user.id,
    ]);

    await connection.execute(
      "UPDATE password_reset_otps SET used_at = NOW() WHERE id = ?",
      [otpRecord.id],
    );

    await connection.commit();
    return { message: "Password reset successful" };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
