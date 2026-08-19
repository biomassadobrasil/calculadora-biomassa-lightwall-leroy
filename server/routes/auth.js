/* ============================================================
   server/routes/auth.js — login / logout / me
   ============================================================ */
"use strict";
const express = require("express");
const { pool } = require("../db");
const { signToken, setSessionCookie, clearSessionCookie, comparePassword, publicUser, requireAuth } = require("../auth");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha." });

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: "E-mail ou senha inválidos." });

    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });

    const token = signToken(user.id);
    setSessionCookie(res, req, token);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
