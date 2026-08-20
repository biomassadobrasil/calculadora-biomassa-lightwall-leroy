/* ============================================================
   server/routes/auth.js — login / logout / me / ativação de conta por convite
   ============================================================ */
"use strict";
const express = require("express");
const crypto = require("crypto");
const { pool, withTransaction } = require("../db");
const {
  signToken, setSessionCookie, clearSessionCookie, comparePassword, hashPassword,
  publicUser, requireAuth, generateActivationToken, hashToken,
} = require("../auth");
const { sendEmail, buildActivationEmailHtml } = require("../email");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha." });

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || user.status !== "ativo" || !user.password_hash) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

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

// ---------------- Ativação de conta por convite (rotas públicas) ----------------

async function buscarTokenValido(rawToken) {
  const hash = hashToken(rawToken);
  const { rows } = await pool.query(
    `SELECT t.*, u.name, u.email, u.role, u.status AS user_status
       FROM activation_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return { erro: "Link de ativação inválido." };
  if (row.used_at) return { erro: "Este link já foi utilizado. Solicite um novo convite." };
  if (new Date(row.expires_at) < new Date()) return { erro: "Este link expirou. Solicite um novo convite." };
  if (row.user_status !== "pendente") return { erro: "Esta conta já foi ativada anteriormente." };
  return { row };
}

// Consultado pela tela de ativação para exibir nome/e-mail antes de pedir a senha.
router.get("/ativar/:token", async (req, res, next) => {
  try {
    const { row, erro } = await buscarTokenValido(req.params.token);
    if (erro) return res.status(400).json({ valid: false, error: erro });
    res.json({ valid: true, user: { name: row.name, email: row.email, role: row.role } });
  } catch (err) {
    next(err);
  }
});

router.post("/ativar/:token", async (req, res, next) => {
  try {
    const { row, erro } = await buscarTokenValido(req.params.token);
    if (erro) return res.status(400).json({ error: erro });

    const senha = String(req.body.password || "");
    const confirmacao = String(req.body.confirmPassword || "");
    if (!senha || senha.length < 6) return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres." });
    if (senha !== confirmacao) return res.status(400).json({ error: "As senhas não coincidem." });

    const hash = await hashPassword(senha);
    const userAtualizado = await withTransaction(async (client) => {
      await client.query("UPDATE activation_tokens SET used_at = now() WHERE id = $1", [row.id]);
      const { rows } = await client.query(
        "UPDATE users SET password_hash = $1, status = 'ativo' WHERE id = $2 RETURNING *",
        [hash, row.user_id]
      );
      return rows[0];
    });

    const token = signToken(userAtualizado.id);
    setSessionCookie(res, req, token);
    res.json({ user: publicUser(userAtualizado) });
  } catch (err) {
    next(err);
  }
});

// Autoatendimento: solicitar novo link quando o anterior expirou. Resposta genérica
// sempre igual, independentemente de o e-mail existir ou estar pendente — evita que
// alguém descubra quais e-mails estão cadastrados no sistema.
router.post("/solicitar-novo-link", async (req, res, next) => {
  const respostaGenerica = { ok: true, message: "Se este e-mail estiver cadastrado e pendente de ativação, um novo link foi enviado." };
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!email) return res.json(respostaGenerica);

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || user.status !== "pendente") return res.json(respostaGenerica);

    const { raw, hash, expiresAt } = generateActivationToken();
    await withTransaction(async (client) => {
      await client.query("DELETE FROM activation_tokens WHERE user_id = $1 AND used_at IS NULL", [user.id]);
      await client.query(
        "INSERT INTO activation_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)",
        [crypto.randomUUID(), user.id, hash, expiresAt]
      );
    });

    const link = `${req.protocol}://${req.get("host")}/#/ativar-conta/${raw}`;
    try {
      await sendEmail({
        to: user.email, subject: "Novo link para ativar sua conta — Biomassa & Lightwall",
        html: buildActivationEmailHtml({ name: user.name, email: user.email, role: user.role, link }),
      });
    } catch (e) {
      console.error("[auth] Falha ao reenviar e-mail de ativação:", e.message);
    }
    res.json(respostaGenerica);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
