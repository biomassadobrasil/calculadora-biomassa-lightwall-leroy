/* ============================================================
   server/routes/usuarios.js — gerenciamento de usuários (somente MASTER)
   Criação por convite: o admin nunca define nem vê a senha do usuário —
   um e-mail com link seguro e temporário é enviado para o próprio usuário
   criar a senha (ver server/routes/auth.js: /ativar/:token).
   ============================================================ */
"use strict";
const express = require("express");
const crypto = require("crypto");
const { pool, withTransaction } = require("../db");
const { requireAuth, requireRole, hashPassword, publicUser, generateActivationToken } = require("../auth");
const { sendEmail, buildActivationEmailHtml } = require("../email");

const router = express.Router();
router.use(requireAuth, requireRole("master"));

/** Grava o token no banco (dentro da transação de quem chamar) e devolve o link pronto. */
async function gravarTokenERetornarLink(req, client, userId, { raw, hash, expiresAt }) {
  await client.query(
    "INSERT INTO activation_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)",
    [crypto.randomUUID(), userId, hash, expiresAt]
  );
  return `${req.protocol}://${req.get("host")}/#/ativar-conta/${raw}`;
}

/** Envia o e-mail de convite/ativação. Propositalmente FORA de qualquer transação de
 *  banco — uma falha no envio nunca deve desfazer a criação do usuário; o admin pode
 *  usar "Reenviar convite" depois. Retorna null em sucesso, ou uma mensagem de aviso. */
async function enviarConviteBestEffort(user, link) {
  try {
    await sendEmail({
      to: user.email,
      subject: "Seu usuário foi criado — Biomassa & Lightwall",
      html: buildActivationEmailHtml({ name: user.name, email: user.email, role: user.role, link }),
    });
    return null;
  } catch (e) {
    console.error("[usuarios] Falha ao enviar e-mail de convite:", e.message);
    return "Usuário criado, mas não foi possível enviar o e-mail de ativação agora. Use \"Reenviar convite\" na lista de usuários.";
  }
}

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
    const role = b.role === "master" ? "master" : "basico";
    if (!name || !email) return res.status(400).json({ error: "Nome e e-mail são obrigatórios." });

    let novoUsuario, link;
    try {
      novoUsuario = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO users (name, email, role, status) VALUES ($1,$2,$3,'pendente') RETURNING *`,
          [name, email, role]
        );
        const user = rows[0];
        link = await gravarTokenERetornarLink(req, client, user.id, generateActivationToken());
        return user;
      });
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
      throw e;
    }

    const emailWarning = await enviarConviteBestEffort(novoUsuario, link);
    // O link também é devolvido ao Master (não só enviado por e-mail) para que ele possa
    // compartilhar manualmente (WhatsApp, Teams etc.) caso o e-mail automático falhe ou
    // ainda não esteja configurado com um domínio verificado — é o mesmo link que iria
    // no e-mail, não um segredo adicional.
    res.status(201).json({ ...publicUser(novoUsuario), emailWarning, activationLink: link });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reenviar-convite", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    if (user.status !== "pendente") return res.status(400).json({ error: "Este usuário já ativou a conta." });

    const link = await withTransaction(async (client) => {
      await client.query("DELETE FROM activation_tokens WHERE user_id = $1 AND used_at IS NULL", [id]);
      return gravarTokenERetornarLink(req, client, id, generateActivationToken());
    });
    const emailWarning = await enviarConviteBestEffort(user, link);
    res.json({ ok: true, message: `Convite reenviado para ${user.email}.`, emailWarning, activationLink: link });
  } catch (err) {
    next(err);
  }
});

async function countActiveMasters(excludeId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'master' AND status = 'ativo' AND id <> $1",
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
    // "status" só pode ser movido entre ativo/inativo por aqui — "pendente" só é alcançado
    // na criação e só é encerrado pela própria ativação (nunca definido manualmente).
    let status = existing.status;
    if (b.status === "ativo" || b.status === "inativo") status = b.status;

    const rebaixandoOuDesativandoUltimoMaster =
      existing.role === "master" && existing.status === "ativo" && (role !== "master" || status !== "ativo");
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

    const atualizado = await withTransaction(async (client) => {
      // Se o admin desativa a conta, qualquer convite pendente ainda não usado é invalidado.
      if (status === "inativo") {
        await client.query("UPDATE activation_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [id]);
      }
      const { rows: updatedRows } = await client.query(
        `UPDATE users SET name=$1, role=$2, status=$3, password_hash=$4 WHERE id=$5 RETURNING *`,
        [name, role, status, passwordHash, id]
      );
      return updatedRows[0];
    });
    res.json(publicUser(atualizado));
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
    if (existing.role === "master" && existing.status === "ativo") {
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
