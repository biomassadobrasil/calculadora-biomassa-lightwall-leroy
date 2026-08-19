/* ============================================================
   server/routes/parametros.js — parâmetros técnicos (rendimentos)
   Leitura: qualquer usuário autenticado (o motor de cálculo precisa deles).
   Escrita: somente MASTER.
   ============================================================ */
"use strict";
const express = require("express");
const crypto = require("crypto");
const { pool, resetParametros } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();
router.use(requireAuth);

function toJson(row) {
  return {
    id: row.id,
    chave: row.chave,
    tipoCalculo: row.tipo_calculo,
    categoria: row.categoria,
    produto: row.produto,
    rendimento: row.rendimento === null ? null : Number(row.rendimento),
    quantidadeFixa: row.quantidade_fixa === null ? undefined : Number(row.quantidade_fixa),
    unidade: row.unidade,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM parametros ORDER BY tipo_calculo, produto");
    res.json(rows.map(toJson));
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("master"), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.produto || !b.tipoCalculo || !b.categoria) return res.status(400).json({ error: "Dados incompletos." });
    const id = crypto.randomUUID();
    const chave = b.chave || "custom_" + id;
    const { rows } = await pool.query(
      `INSERT INTO parametros (id, chave, tipo_calculo, categoria, produto, rendimento, quantidade_fixa, unidade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, chave, b.tipoCalculo, b.categoria, b.produto, b.rendimento ?? null, b.quantidadeFixa ?? null, b.unidade || null]
    );
    res.status(201).json(toJson(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireRole("master"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE parametros SET tipo_calculo=$1, categoria=$2, produto=$3, rendimento=$4, quantidade_fixa=$5, unidade=$6
       WHERE id=$7 RETURNING *`,
      [b.tipoCalculo, b.categoria, b.produto, b.rendimento ?? null, b.quantidadeFixa ?? null, b.unidade || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Parâmetro não encontrado." });
    res.json(toJson(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole("master"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM parametros WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reset", requireRole("master"), async (req, res, next) => {
  try {
    await resetParametros();
    const { rows } = await pool.query("SELECT * FROM parametros ORDER BY tipo_calculo, produto");
    res.json(rows.map(toJson));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
