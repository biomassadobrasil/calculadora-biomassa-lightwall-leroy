/* ============================================================
   server/routes/usuarios.js — gerenciamento de usuários (somente MASTER)
   ============================================================ */
"use strict";
const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole, hashPassword, publicUser } = require("../auth");

const router = express.Router();
router.use(requireAuth, requireRole("master"));

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users ORDER BY name");
    res.json(rows.map(publicUser));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const email = String(b.email || "").toLowerCase().trim();
    const password = String(b.password || "");
    const role = b.role === "master" ? "master" : "basico";
    if (!name || !email || !password) return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    if (password.length < 6) return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres." });

    const hash = await hashPassword(password);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, active) VALUES ($1,$2,$3,$4,true) RETURNING *`,
        [name, email, hash, role]
      );
      res.status(201).json(publicUser(rows[0]));
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

async function countActiveMasters(excludeId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'master' AND active = true AND id <> $1",
    [excludeId || -1]
  );
  return rows[0].n;
}

router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Usuário não encontrado." });

    const b = req.body || {};
    const name = b.name !== undefined ? String(b.name).trim() : existing.name;
    const role = b.role === "master" || b.role === "basico" ? b.role : existing.role;
    const active = b.active !== undefined ? !!b.active : existing.active;

    const rebaixandoOuDesativandoUltimoMaster =
      existing.role === "master" && existing.active && (role !== "master" || !active);
    if (rebaixandoOuDesativandoUltimoMaster) {
      const outrosAtivos = await countActiveMasters(id);
      if (outrosAtivos === 0) {
        return res.status(400).json({ error: "Não é possível remover o último usuário Master ativo do sistema." });
      }
    }

    let passwordHash = existing.password_hash;
    if (b.password) {
      if (String(b.password).length < 6) return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres." });
      passwordHash = await hashPassword(String(b.password));
    }

    const { rows: updatedRows } = await pool.query(
      `UPDATE users SET name=$1, role=$2, active=$3, password_hash=$4 WHERE id=$5 RETURNING *`,
      [name, role, active, passwordHash, id]
    );
    res.json(publicUser(updatedRows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Usuário não encontrado." });
    if (existing.role === "master" && existing.active) {
      const outrosAtivos = await countActiveMasters(id);
      if (outrosAtivos === 0) return res.status(400).json({ error: "Não é possível excluir o último usuário Master ativo do sistema." });
    }
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
