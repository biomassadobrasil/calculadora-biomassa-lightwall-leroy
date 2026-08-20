/* ============================================================
   server/db.js — Pool do Postgres + migrações + seed inicial
   ============================================================ */
"use strict";
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[db] Variável de ambiente DATABASE_URL não configurada. Adicione o plugin PostgreSQL no Railway.");
}
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || "");

const pool = new Pool({
  connectionString,
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : false,
});

// Mesmos parâmetros técnicos extraídos da planilha original (ver histórico do projeto).
const SEED_PARAMETROS = [
  { chave: "unidades_por_caixa_argamassa", tipoCalculo: "geral", categoria: "regra", produto: "Conversão de embalagens em caixas (Argamassa Polimérica)", rendimento: 6, unidade: "bisnagas por caixa" },
  { chave: "margem_seguranca_caixas", tipoCalculo: "geral", categoria: "regra", produto: "Margem de segurança no cálculo de caixas", rendimento: 0.4, unidade: "caixas (margem fixa)" },
  { chave: "assentamento_argamassa", tipoCalculo: "assentamento", categoria: "produto", produto: "Argamassa Polimérica Biomassa (Bisnaga 3 kg)", rendimento: 3, unidade: "placas por bisnaga" },
  { chave: "assentamento_bioprimer", tipoCalculo: "assentamento", categoria: "produto", produto: "Bioprimer - Promotor de Aderência (Balde 3,6 L)", rendimento: 32, unidade: "m² por balde" },
  { chave: "assentamento_bioflex", tipoCalculo: "assentamento", categoria: "produto", produto: "Bioflex - Base Coat & Tratamento de Juntas (Balde 5 kg)", rendimento: 1.66, unidade: "m² por balde" },
  { chave: "assentamento_tela", tipoCalculo: "assentamento", categoria: "produto", produto: "Tela de Fibra de Vidro 15cm x 50m (rolo)", rendimento: 7.5, unidade: "m² por rolo" },
  { chave: "assentamento_gel", tipoCalculo: "assentamento", categoria: "produto", produto: "Gel de Encunhamento (Balde 25 kg)", rendimento: 15.5, unidade: "m linear por balde" },
  { chave: "assentamento_pct_bioflex", tipoCalculo: "assentamento", categoria: "regra", produto: "% da metragem linear de juntas tratada com Bioflex", rendimento: 0.2, unidade: "fração (20%)" },
  { chave: "assentamento_pct_tela", tipoCalculo: "assentamento", categoria: "regra", produto: "% da metragem linear de juntas tratada com Tela", rendimento: 0.15, unidade: "fração (15%)" },
  { chave: "pintura_bioprimer", tipoCalculo: "pintura", categoria: "produto", produto: "Bioprimer - Promotor de Aderência (Balde 3,6 L)", rendimento: 32, unidade: "m² por balde" },
  { chave: "pintura_massa_regularizadora", tipoCalculo: "pintura", categoria: "produto", produto: "Massa Regularizadora (Balde 25 kg)", rendimento: 25, unidade: "m² por balde" },
  { chave: "pintura_tinta_emborrachada", tipoCalculo: "pintura", categoria: "produto", produto: "Tinta Emborrachada (Balde 18 L)", rendimento: 80, unidade: "m² por balde" },
  { chave: "pintura_selador", tipoCalculo: "pintura", categoria: "produto", produto: "Selador Acrílico Pigmentado - Biomassa (Barrica 16 L)", rendimento: 75, unidade: "m² por barrica" },
  { chave: "pintura_biorevest_lamato", tipoCalculo: "pintura", categoria: "produto", produto: "BioRevest - Textura Elastomérica Lamato (Balde 25 kg)", rendimento: 10, unidade: "m² por balde" },
  { chave: "pintura_biorevest_rolada", tipoCalculo: "pintura", categoria: "produto", produto: "BioRevest - Textura Elastomérica Rolada (Balde 25 kg)", rendimento: 13, unidade: "m² por balde" },
  { chave: "pintura_biorevest_pedras", tipoCalculo: "pintura", categoria: "produto", produto: "BioRevest - Textura Elastomérica Pedras Naturais (Balde 25 kg)", rendimento: 14, unidade: "m² por balde" },
  { chave: "verniz_bioprotect_juntas", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Bioprotect - Verniz PU Base D'água (Balde 3,6 L) · Tratamento de Juntas", rendimento: 54, unidade: "m² de junta por balde" },
  { chave: "verniz_sante_pu40", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Sante PU 40 Biomassa (Sachê 800 g)", rendimento: 6, unidade: "m linear por sachê" },
  { chave: "verniz_bioprotect_superficie_5anos", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Bioprotect - Verniz PU Base D'água (Balde 3,6 L) · Superfície (5 anos garantia)", rendimento: 36, unidade: "m² por balde" },
  { chave: "verniz_acrilico_1ano", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Bioprotect - Verniz Acrílico (Balde 3,6 L) · Superfície (1 ano garantia)", rendimento: 36, unidade: "m² por balde" },
  { chave: "verniz_argamassa", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Argamassa Polimérica Biomassa (Bisnaga 3 kg) · Assentamento de Painéis Aparentes", rendimento: 2, unidade: "placas por bisnaga" },
  { chave: "verniz_aplicador_manual", tipoCalculo: "verniz_pu", categoria: "acessorio_fixo", produto: "Aplicador Manual para Selante Biomassa", rendimento: null, quantidadeFixa: 1, unidade: "unidade (item fixo)" },
  { chave: "verniz_pct_juntas", tipoCalculo: "verniz_pu", categoria: "regra", produto: "% da metragem linear de juntas convertida em m² de junta", rendimento: 0.01, unidade: "fração (1%)" },
];

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('master','basico')),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orcamentos (
      id TEXT PRIMARY KEY,
      titulo TEXT,
      cliente_nome TEXT NOT NULL,
      cliente_telefone TEXT NOT NULL,
      cliente_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Rascunho',
      observacoes TEXT,
      calculos JSONB NOT NULL DEFAULT '[]',
      created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name TEXT NOT NULL,
      created_by_role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parametros (
      id TEXT PRIMARY KEY,
      chave TEXT NOT NULL UNIQUE,
      tipo_calculo TEXT NOT NULL,
      categoria TEXT NOT NULL,
      produto TEXT NOT NULL,
      rendimento DOUBLE PRECISION,
      quantidade_fixa DOUBLE PRECISION,
      unidade TEXT
    );
  `);
  // Auditoria dos Parâmetros Técnicos — sem FK para parametros/users de propósito:
  // o registro deve sobreviver mesmo que o parâmetro ou o usuário sejam excluídos depois,
  // e nenhuma rota da API permite alterar ou apagar linhas desta tabela (histórico permanente).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parametros_auditoria (
      id TEXT PRIMARY KEY,
      parametro_id TEXT,
      parametro_produto TEXT NOT NULL,
      parametro_chave TEXT,
      campo_alterado TEXT NOT NULL,
      valor_anterior TEXT,
      valor_novo TEXT,
      tipo_acao TEXT NOT NULL CHECK (tipo_acao IN ('Inclusão','Alteração','Exclusão')),
      usuario_id INTEGER,
      usuario_nome TEXT NOT NULL,
      usuario_role TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parametros_auditoria_criado_em ON parametros_auditoria (criado_em DESC);`);
}

/** Executa fn(client) dentro de uma transação (BEGIN/COMMIT/ROLLBACK).
 *  Usado para garantir que a alteração do parâmetro e o respectivo registro de
 *  auditoria sejam salvos juntos, sempre — nunca um sem o outro. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function seedParametros() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM parametros");
  if (rows[0].n > 0) return;
  for (const p of SEED_PARAMETROS) {
    await pool.query(
      `INSERT INTO parametros (id, chave, tipo_calculo, categoria, produto, rendimento, quantidade_fixa, unidade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (chave) DO NOTHING`,
      [crypto.randomUUID(), p.chave, p.tipoCalculo, p.categoria, p.produto, p.rendimento ?? null, p.quantidadeFixa ?? null, p.unidade || null]
    );
  }
}

async function resetParametros() {
  await pool.query("DELETE FROM parametros");
  await seedParametros();
}

async function seedMasterUser() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) return;
  const email = process.env.MASTER_EMAIL;
  const password = process.env.MASTER_PASSWORD;
  if (!email || !password) {
    console.warn("[db] Nenhum usuário cadastrado e MASTER_EMAIL/MASTER_PASSWORD não configurados. " +
      "Defina essas variáveis de ambiente no Railway e reinicie o serviço para criar o primeiro usuário Master.");
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, active) VALUES ($1,$2,$3,'master',true)`,
    [process.env.MASTER_NAME || "Administrador", email.toLowerCase().trim(), hash]
  );
  console.log(`[db] Usuário Master inicial criado: ${email}`);
}

async function initDb() {
  await migrate();
  await seedParametros();
  await seedMasterUser();
}

module.exports = { pool, initDb, resetParametros, withTransaction, SEED_PARAMETROS };
