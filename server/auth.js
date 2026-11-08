const bcrypt = require("bcryptjs");
const { db } = require("./db");

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: "Duhet të kyçeni si administrator." });
}

async function getAdmin(req) {
  if (!req.session?.adminId) return null;
  return db.get(
    "SELECT id, name, email, created_at FROM admins WHERE id = ?",
    [req.session.adminId]
  );
}

async function login(email, password) {
  const admin = await db.get("SELECT * FROM admins WHERE email = ?", [
    String(email || "").trim().toLowerCase(),
  ]);
  if (!admin) return { ok: false, error: "Email ose fjalëkalimi nuk është i saktë." };
  const match = bcrypt.compareSync(String(password || "").trim(), admin.password_hash);
  if (!match) return { ok: false, error: "Email ose fjalëkalimi nuk është i saktë." };
  return {
    ok: true,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  };
}

async function changePassword(adminId, currentPass, newPass) {
  const admin = await db.get("SELECT * FROM admins WHERE id = ?", [adminId]);
  if (!admin) return { ok: false, error: "Admin nuk u gjet." };
  if (!bcrypt.compareSync(String(currentPass || ""), admin.password_hash)) {
    return { ok: false, error: "Fjalëkalimi aktual nuk është i saktë." };
  }
  if (String(newPass || "").length < 6) {
    return { ok: false, error: "Fjalëkalimi i ri duhet të ketë së paku 6 karaktere." };
  }
  const hash = bcrypt.hashSync(String(newPass), 12);
  await db.run("UPDATE admins SET password_hash = ? WHERE id = ?", [hash, adminId]);
  return { ok: true };
}

module.exports = { requireAuth, getAdmin, login, changePassword };
