/* ============================================================
   server/routes/parametros.js — parâmetros técnicos (rendimentos)
   Leitura: qualquer usuário autenticado (o motor de cálculo precisa deles).
   Escrita (incluir/editar/excluir/restaurar): somente MASTER — validado aqui
   no servidor, não apenas escondido na tela.
   Toda escrita gera automaticamente um registro permanente de auditoria
   (parametros_auditoria), dentro da MESMA transação da alteração: ou os dois
   são salvos juntos, ou nenhum dos dois é salvo.
   ============================================================ */
"use strict";
const express = require("express");
const crypto = require("crypto");
const { pool, withTransaction, SEED_PARAMETROS } = require("../db");
const { requireAuth, requireRole } = require("../auth");

const router = express.Router();
router.use(requireAuth);

const FIELD_LABELS = {
  produto: "Produto/Regra",
  tipoCalculo: "Tipo de Cálculo",
  categoria: "Categoria",
  rendimento: "Rendimento",
  quantidadeFixa: "Quantidade Fixa",
  unidade: "Unidade",
};

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

function resumoLegivel(row) {
  return `Produto: ${row.produto} | Tipo: ${row.tipo_calculo} | Categoria: ${row.categoria} | Rendimento: ${row.rendimento ?? "-"} | Qtd. Fixa: ${row.quantidade_fixa ?? "-"} | Unidade: ${row.unidade ?? "-"}`;
}

/** Grava uma linha de auditoria. Nenhuma rota desta API permite alterar ou
 *  excluir linhas de parametros_auditoria — é somente-inserção por design. */
async function registrarAuditoria(client, { parametroId, parametroProduto, parametroChave, campo, valorAnterior, valorNovo, tipoAcao, user, ts }) {
  await client.query(
    `INSERT INTO parametros_auditoria
       (id, parametro_id, parametro_produto, parametro_chave, campo_alterado, valor_anterior, valor_novo, tipo_acao, usuario_id, usuario_nome, usuario_role, criado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      crypto.randomUUID(), parametroId, parametroProduto, parametroChave || null, campo,
      valorAnterior === null || valorAnterior === undefined ? null : String(valorAnterior),
      valorNovo === null || valorNovo === undefined ? null : String(valorNovo),
      tipoAcao, user.id, user.name, user.role, ts,
    ]
  );
}

// ---------------- Leitura (qualquer usuário autenticado) ----------------
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM parametros ORDER BY tipo_calculo, produto");
    res.json(rows.map(toJson));
  } catch (err) {
    next(err);
  }
});

// Histórico de auditoria — somente MASTER consulta.
router.get("/auditoria", requireRole("master"), async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM parametros_auditoria ORDER BY criado_em DESC LIMIT 500");
    res.json(rows.map((r) => ({
      id: r.id,
      parametroId: r.parametro_id,
      parametroProduto: r.parametro_produto,
      parametroChave: r.parametro_chave,
      campoAlterado: r.campo_alterado,
      valorAnterior: r.valor_anterior,
      valorNovo: r.valor_novo,
      tipoAcao: r.tipo_acao,
      usuarioId: r.usuario_id,
      usuarioNome: r.usuario_nome,
      usuarioRole: r.usuario_role,
      criadoEm: r.criado_em,
    })));
  } catch (err) {
    next(err);
  }
});

// ---------------- Escrita (somente MASTER — validado no servidor) ----------------
router.post("/", requireRole("master"), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.produto || !b.tipoCalculo || !b.categoria) return res.status(400).json({ error: "Dados incompletos." });
    const id = crypto.randomUUID();
    const chave = b.chave || "custom_" + id;
    const ts = new Date();

    const novo = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO parametros (id, chave, tipo_calculo, categoria, produto, rendimento, quantidade_fixa, unidade)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, chave, b.tipoCalculo, b.categoria, b.produto, b.rendimento ?? null, b.quantidadeFixa ?? null, b.unidade || null]
      );
      const row = rows[0];
      await registrarAuditoria(client, {
        parametroId: row.id, parametroProduto: row.produto, parametroChave: row.chave,
        campo: "(registro completo)", valorAnterior: null, valorNovo: resumoLegivel(row),
        tipoAcao: "Inclusão", user: req.user, ts,
      });
      return row;
    });
    res.status(201).json(toJson(novo));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireRole("master"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const ts = new Date();

    const atualizado = await withTransaction(async (client) => {
      const { rows: existingRows } = await client.query("SELECT * FROM parametros WHERE id = $1", [req.params.id]);
      const existing = existingRows[0];
      if (!existing) return null;

      const novos = {
        tipo_calculo: b.tipoCalculo ?? existing.tipo_calculo,
        categoria: b.categoria ?? existing.categoria,
        produto: b.produto ?? existing.produto,
        rendimento: b.rendimento === undefined ? existing.rendimento : b.rendimento,
        quantidade_fixa: b.quantidadeFixa === undefined ? existing.quantidade_fixa : b.quantidadeFixa,
        unidade: b.unidade === undefined ? existing.unidade : b.unidade,
      };

      const { rows: updatedRows } = await client.query(
        `UPDATE parametros SET tipo_calculo=$1, categoria=$2, produto=$3, rendimento=$4, quantidade_fixa=$5, unidade=$6
         WHERE id=$7 RETURNING *`,
        [novos.tipo_calculo, novos.categoria, novos.produto, novos.rendimento, novos.quantidade_fixa, novos.unidade, req.params.id]
      );
      const row = updatedRows[0];

      const camposComparados = [
        ["produto", "produto"], ["tipo_calculo", "tipoCalculo"], ["categoria", "categoria"],
        ["rendimento", "rendimento"], ["quantidade_fixa", "quantidadeFixa"], ["unidade", "unidade"],
      ];
      for (const [dbField, jsKey] of camposComparados) {
        const antes = existing[dbField];
        const depois = row[dbField];
        if (String(antes ?? "") !== String(depois ?? "")) {
          await registrarAuditoria(client, {
            parametroId: row.id, parametroProduto: row.produto, parametroChave: row.chave,
            campo: FIELD_LABELS[jsKey], valorAnterior: antes, valorNovo: depois,
            tipoAcao: "Alteração", user: req.user, ts,
          });
        }
      }
      return row;
    });

    if (!atualizado) return res.status(404).json({ error: "Parâmetro não encontrado." });
    res.json(toJson(atualizado));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole("master"), async (req, res, next) => {
  try {
    const ts = new Date();
    const excluido = await withTransaction(async (client) => {
      const { rows } = await client.query("SELECT * FROM parametros WHERE id = $1", [req.params.id]);
      const existing = rows[0];
      if (!existing) return null;
      await client.query("DELETE FROM parametros WHERE id = $1", [req.params.id]);
      await registrarAuditoria(client, {
        parametroId: existing.id, parametroProduto: existing.produto, parametroChave: existing.chave,
        campo: "(registro completo)", valorAnterior: resumoLegivel(existing), valorNovo: null,
        tipoAcao: "Exclusão", user: req.user, ts,
      });
      return existing;
    });
    if (!excluido) return res.status(404).json({ error: "Parâmetro não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reset", requireRole("master"), async (req, res, next) => {
  try {
    const ts = new Date();
    const rows = await withTransaction(async (client) => {
      const { rows: antigos } = await client.query("SELECT * FROM parametros");
      for (const antigo of antigos) {
        await registrarAuditoria(client, {
          parametroId: antigo.id, parametroProduto: antigo.produto, parametroChave: antigo.chave,
          campo: "(registro completo)", valorAnterior: resumoLegivel(antigo), valorNovo: null,
          tipoAcao: "Exclusão", user: req.user, ts,
        });
      }
      await client.query("DELETE FROM parametros");

      for (const p of SEED_PARAMETROS) {
        const id = crypto.randomUUID();
        const { rows: inserted } = await client.query(
          `INSERT INTO parametros (id, chave, tipo_calculo, categoria, produto, rendimento, quantidade_fixa, unidade)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [id, p.chave, p.tipoCalculo, p.categoria, p.produto, p.rendimento ?? null, p.quantidadeFixa ?? null, p.unidade || null]
        );
        const novo = inserted[0];
        await registrarAuditoria(client, {
          parametroId: novo.id, parametroProduto: novo.produto, parametroChave: novo.chave,
          campo: "(registro completo)", valorAnterior: null,
          valorNovo: resumoLegivel(novo) + " (restaurado ao padrão da planilha)",
          tipoAcao: "Inclusão", user: req.user, ts,
        });
      }

      const { rows: atual } = await client.query("SELECT * FROM parametros ORDER BY tipo_calculo, produto");
      return atual;
    });
    res.json(rows.map(toJson));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
