const db = require("../config/db");
const bcrypt = require("bcryptjs");

const { producer } = require("../config/kafka");

exports.createUser = async (userData) => {
  const { name, email, password } = userData;

  const hashedPassword = await bcrypt.hash(password, 10);

  const [result] = await db.execute(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, hashedPassword],
  );

  const user = {
    id: result.insertId,
    name,
    email,
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

exports.getUserById = async (id) => {
  const [rows] = await db.execute(
    "SELECT id, name, email FROM users WHERE id = ?",
    [id],
  );
  if (!rows.length) return null;
  return rows[0];
};

exports.updateUser = async (id, payload = {}) => {
  const fields = [];
  const values = [];

  if (typeof payload.name === "string" && payload.name.trim()) {
    fields.push("name = ?");
    values.push(payload.name.trim());
  }

  if (typeof payload.email === "string" && payload.email.trim()) {
    fields.push("email = ?");
    values.push(payload.email.trim());
  }

  if (typeof payload.password === "string" && payload.password) {
    const hashedPassword = await bcrypt.hash(payload.password, 10);
    fields.push("password = ?");
    values.push(hashedPassword);
  }

  if (!fields.length) {
    throw new Error("No valid fields to update");
  }

  values.push(id);
  const [result] = await db.execute(
    `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );

  if (!result.affectedRows) return null;

  const [rows] = await db.execute(
    "SELECT id, name, email, role FROM users WHERE id = ?",
    [id],
  );
  return rows[0] || null;
};

exports.deleteUser = async (id) => {
  const [result] = await db.execute("DELETE FROM users WHERE id = ?", [id]);
  if (!result.affectedRows) return false;
  return true;
};
