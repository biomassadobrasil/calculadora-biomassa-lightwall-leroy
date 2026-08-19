/* ============================================================
   server/auth.js — hashing, JWT e middlewares de autenticação/autorização
   ============================================================ */
"use strict";
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

const COOKIE_NAME = "biomassa_session";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[auth] Variável de ambiente JWT_SECRET não configurada. Defina um valor aleatório e secreto no Railway.");
}
const TOKEN_TTL_SECONDS = 7 * 24 * 3600; // 7 dias

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET || "dev-only-insecure-secret", { expiresIn: TOKEN_TTL_SECONDS });
}

function setSessionCookie(res, req, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !!req.secure,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });
}

function clearSessionCookie(res, req) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: !!req.secure, path: "/" });
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, createdAt: row.created_at };
}

/** Exige sessão válida; carrega o usuário FRESCO do banco a cada requisição
 *  (garante que uma desativação/mudança de perfil tenha efeito imediato). */
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Não autenticado." });
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET || "dev-only-insecure-secret");
    } catch (e) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [payload.uid]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: "Usuário inexistente ou desativado." });
    req.user = publicUser(user);
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "Você não tem permissão para acessar este recurso." });
    }
    next();
  };
}

module.exports = {
  COOKIE_NAME, signToken, setSessionCookie, clearSessionCookie,
  hashPassword, comparePassword, publicUser, requireAuth, requireRole,
};
