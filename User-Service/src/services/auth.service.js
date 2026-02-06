const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { producer } = require("../config/kafka");

exports.signup = async ({ name, email, password }) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  const [result] = await db.execute(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, hashedPassword],
  );

  const user = { id: result.insertId, name, email, role: "user" };

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
  const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [
    email,
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
