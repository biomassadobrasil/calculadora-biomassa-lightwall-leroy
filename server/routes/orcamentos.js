/* ============================================================
   server/routes/orcamentos.js — CRUD de orçamentos com controle de acesso
   Regra de segurança (aplicada aqui, no servidor — não apenas na UI):
     MASTER  -> pode ler/editar/excluir qualquer orçamento.
     BÁSICO  -> só pode ler/editar/excluir os orçamentos que ele mesmo criou.
   ============================================================ */
"use strict";
const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

const STATUS_VALIDOS = ["Rascunho", "Em elaboração", "Enviado", "Em negociação", "Aprovado", "Recusado", "Cancelado"];

function toJson(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    cliente: row.cliente_nome,
    clienteTelefone: row.cliente_telefone,
    clienteEmail: row.cliente_email,
    responsavel: row.created_by_name,
    status: row.status,
    observacoes: row.observacoes,
    calculos: row.calculos || [],
    createdBy: { id: row.created_by_id, name: row.created_by_name, role: row.created_by_role },
    dataCriacao: row.created_at,
    dataAtualizacao: row.updated_at,
  };
}

function podeAcessar(user, row) {
  return user.role === "master" || row.created_by_id === user.id;
}

router.get("/", async (req, res, next) => {
  try {
    let result;
    if (req.user.role === "master") {
      result = await pool.query("SELECT * FROM orcamentos ORDER BY updated_at DESC");
    } else {
      result = await pool.query("SELECT * FROM orcamentos WHERE created_by_id = $1 ORDER BY updated_at DESC", [req.user.id]);
    }
    res.json(result.rows.map(toJson));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orcamentos WHERE id = $1", [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Orçamento não encontrado." });
    if (!podeAcessar(req.user, row)) return res.status(403).json({ error: "Você não tem permissão para acessar este orçamento." });
    res.json(toJson(row));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const b = req.body || {};
    const cliente = String(b.cliente || "").trim();
    const clienteTelefone = String(b.clienteTelefone || "").trim();
    const clienteEmail = String(b.clienteEmail || "").trim();
    if (!cliente || !clienteTelefone || !clienteEmail) {
      return res.status(400).json({ error: "Para iniciar o orçamento, preencha Nome, Telefone e E-mail do cliente." });
    }
    const status = STATUS_VALIDOS.includes(b.status) ? b.status : "Rascunho";
    const calculos = Array.isArray(b.calculos) ? b.calculos : [];
    const id = crypto.randomUUID();

    const { rows } = await pool.query(
      `INSERT INTO orcamentos (id, titulo, cliente_nome, cliente_telefone, cliente_email, status, observacoes, calculos, created_by_id, created_by_name, created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, b.titulo || null, cliente, clienteTelefone, clienteEmail, status, b.observacoes || null, JSON.stringify(calculos), req.user.id, req.user.name, req.user.role]
    );
    res.status(201).json(toJson(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orcamentos WHERE id = $1", [req.params.id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Orçamento não encontrado." });
    if (!podeAcessar(req.user, existing)) return res.status(403).json({ error: "Você não tem permissão para editar este orçamento." });

    const b = req.body || {};
    const cliente = String(b.cliente ?? existing.cliente_nome).trim();
    const clienteTelefone = String(b.clienteTelefone ?? existing.cliente_telefone).trim();
    const clienteEmail = String(b.clienteEmail ?? existing.cliente_email).trim();
    if (!cliente || !clienteTelefone || !clienteEmail) {
      return res.status(400).json({ error: "Nome, Telefone e E-mail do cliente são obrigatórios." });
    }
    const status = STATUS_VALIDOS.includes(b.status) ? b.status : existing.status;
    const calculos = Array.isArray(b.calculos) ? b.calculos : existing.calculos;

    const { rows: updatedRows } = await pool.query(
      `UPDATE orcamentos SET titulo=$1, cliente_nome=$2, cliente_telefone=$3, cliente_email=$4, status=$5, observacoes=$6, calculos=$7, updated_at=now()
       WHERE id=$8 RETURNING *`,
      [b.titulo ?? existing.titulo, cliente, clienteTelefone, clienteEmail, status, b.observacoes ?? existing.observacoes, JSON.stringify(calculos), req.params.id]
    );
    res.json(toJson(updatedRows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orcamentos WHERE id = $1", [req.params.id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Orçamento não encontrado." });
    if (!podeAcessar(req.user, existing)) return res.status(403).json({ error: "Você não tem permissão para excluir este orçamento." });
    await pool.query("DELETE FROM orcamentos WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
