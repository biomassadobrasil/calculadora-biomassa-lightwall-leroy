/* ============================================================
   db.js — Camada de dados (IndexedDB)
   Substitui a planilha como "banco de dados" do aplicativo.
   Namespace global: window.DB
   ============================================================ */
(function () {
  "use strict";

  const DB_NAME = "biomassa_calc_db";
  const DB_VERSION = 1;
  const STORE_ORCAMENTOS = "orcamentos";
  const STORE_PARAMETROS = "parametros";

  let dbPromise = null;

  // --------------------------------------------------------
  // Seed inicial dos "Parâmetros Técnicos" — os rendimentos e
  // regras de negócio extraídos das 3 abas da planilha original.
  // As duas correções aprovadas (D30 usando C8 em vez de C9, e
  // metragem de painéis dinâmica em vez de constante fixa 1,83)
  // já estão refletidas na forma como calculos.js usa estes dados.
  // --------------------------------------------------------
  const SEED_PARAMETROS = [
    // Regras compartilhadas
    { chave: "unidades_por_caixa_argamassa", tipoCalculo: "geral", categoria: "regra", produto: "Conversão de embalagens em caixas (Argamassa Polimérica)", rendimento: 6, unidade: "bisnagas por caixa" },
    { chave: "margem_seguranca_caixas", tipoCalculo: "geral", categoria: "regra", produto: "Margem de segurança no cálculo de caixas", rendimento: 0.4, unidade: "caixas (margem fixa)" },

    // Assentamento & Tratamento de Juntas
    { chave: "assentamento_argamassa", tipoCalculo: "assentamento", categoria: "produto", produto: "Argamassa Polimérica Biomassa (Bisnaga 3 kg)", rendimento: 3, unidade: "placas por bisnaga" },
    { chave: "assentamento_bioprimer", tipoCalculo: "assentamento", categoria: "produto", produto: "Bioprimer - Promotor de Aderência (Balde 3,6 L)", rendimento: 32, unidade: "m² por balde" },
    { chave: "assentamento_bioflex", tipoCalculo: "assentamento", categoria: "produto", produto: "Bioflex - Base Coat & Tratamento de Juntas (Balde 5 kg)", rendimento: 1.66, unidade: "m² por balde" },
    { chave: "assentamento_tela", tipoCalculo: "assentamento", categoria: "produto", produto: "Tela de Fibra de Vidro 15cm x 50m (rolo)", rendimento: 7.5, unidade: "m² por rolo" },
    { chave: "assentamento_gel", tipoCalculo: "assentamento", categoria: "produto", produto: "Gel de Encunhamento (Balde 25 kg)", rendimento: 15.5, unidade: "m linear por balde" },
    { chave: "assentamento_pct_bioflex", tipoCalculo: "assentamento", categoria: "regra", produto: "% da metragem linear de juntas tratada com Bioflex", rendimento: 0.2, unidade: "fração (20%)" },
    { chave: "assentamento_pct_tela", tipoCalculo: "assentamento", categoria: "regra", produto: "% da metragem linear de juntas tratada com Tela", rendimento: 0.15, unidade: "fração (15%)" },

    // Pintura / Texturas Elastoméricas
    { chave: "pintura_bioprimer", tipoCalculo: "pintura", categoria: "produto", produto: "Bioprimer - Promotor de Aderência (Balde 3,6 L)", rendimento: 32, unidade: "m² por balde" },
    { chave: "pintura_massa_regularizadora", tipoCalculo: "pintura", categoria: "produto", produto: "Massa Regularizadora (Balde 25 kg)", rendimento: 25, unidade: "m² por balde" },
    { chave: "pintura_tinta_emborrachada", tipoCalculo: "pintura", categoria: "produto", produto: "Tinta Emborrachada (Balde 18 L)", rendimento: 80, unidade: "m² por balde" },
    { chave: "pintura_selador", tipoCalculo: "pintura", categoria: "produto", produto: "Selador Acrílico Pigmentado - Biomassa (Barrica 16 L)", rendimento: 75, unidade: "m² por barrica" },
    { chave: "pintura_biorevest_lamato", tipoCalculo: "pintura", categoria: "produto", produto: "BioRevest - Textura Elastomérica Lamato (Balde 25 kg)", rendimento: 10, unidade: "m² por balde" },
    { chave: "pintura_biorevest_rolada", tipoCalculo: "pintura", categoria: "produto", produto: "BioRevest - Textura Elastomérica Rolada (Balde 25 kg)", rendimento: 13, unidade: "m² por balde" },
    { chave: "pintura_biorevest_pedras", tipoCalculo: "pintura", categoria: "produto", produto: "BioRevest - Textura Elastomérica Pedras Naturais (Balde 25 kg)", rendimento: 14, unidade: "m² por balde" },

    // Painéis Aparentes - Verniz PU
    { chave: "verniz_bioprotect_juntas", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Bioprotect - Verniz PU Base D'água (Balde 3,6 L) · Tratamento de Juntas", rendimento: 54, unidade: "m² de junta por balde" },
    { chave: "verniz_sante_pu40", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Sante PU 40 Biomassa (Sachê 800 g)", rendimento: 6, unidade: "m linear por sachê" },
    { chave: "verniz_bioprotect_superficie_5anos", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Bioprotect - Verniz PU Base D'água (Balde 3,6 L) · Superfície (5 anos garantia)", rendimento: 36, unidade: "m² por balde" },
    { chave: "verniz_acrilico_1ano", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Bioprotect - Verniz Acrílico (Balde 3,6 L) · Superfície (1 ano garantia)", rendimento: 36, unidade: "m² por balde" },
    { chave: "verniz_argamassa", tipoCalculo: "verniz_pu", categoria: "produto", produto: "Argamassa Polimérica Biomassa (Bisnaga 3 kg) · Assentamento de Painéis Aparentes", rendimento: 2, unidade: "placas por bisnaga" },
    { chave: "verniz_aplicador_manual", tipoCalculo: "verniz_pu", categoria: "acessorio_fixo", produto: "Aplicador Manual para Selante Biomassa", rendimento: null, quantidadeFixa: 1, unidade: "unidade (item fixo)" },
    { chave: "verniz_pct_juntas", tipoCalculo: "verniz_pu", categoria: "regra", produto: "% da metragem linear de juntas convertida em m² de junta", rendimento: 0.01, unidade: "fração (1%)" },
  ];

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE_ORCAMENTOS)) {
          const os = db.createObjectStore(STORE_ORCAMENTOS, { keyPath: "id" });
          os.createIndex("cliente", "cliente", { unique: false });
          os.createIndex("dataCriacao", "dataCriacao", { unique: false });
          os.createIndex("status", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_PARAMETROS)) {
          const ps = db.createObjectStore(STORE_PARAMETROS, { keyPath: "id" });
          ps.createIndex("tipoCalculo", "tipoCalculo", { unique: false });
          ps.createIndex("chave", "chave", { unique: true });
        }
      };
      req.onsuccess = (ev) => resolve(ev.target.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function withStore(storeName, mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function ensureSeed() {
    const count = await withStore(STORE_PARAMETROS, "readonly", (s) => reqToPromise(s.count()));
    if (count > 0) return;
    await withStore(STORE_PARAMETROS, "readwrite", (store) => {
      SEED_PARAMETROS.forEach((p) => {
        store.add(Object.assign({ id: Utils.uid() }, p));
      });
    });
  }

  // ---------------- Orçamentos ----------------
  const Orcamentos = {
    async list() {
      return withStore(STORE_ORCAMENTOS, "readonly", (s) => reqToPromise(s.getAll()));
    },
    async get(id) {
      return withStore(STORE_ORCAMENTOS, "readonly", (s) => reqToPromise(s.get(id)));
    },
    async save(orcamento) {
      if (!orcamento.id) orcamento.id = Utils.uid();
      orcamento.dataAtualizacao = Utils.nowIso();
      if (!orcamento.dataCriacao) orcamento.dataCriacao = orcamento.dataAtualizacao;
      await withStore(STORE_ORCAMENTOS, "readwrite", (s) => s.put(orcamento));
      return orcamento;
    },
    async remove(id) {
      return withStore(STORE_ORCAMENTOS, "readwrite", (s) => s.delete(id));
    },
  };

  // ---------------- Parâmetros Técnicos ----------------
  const Parametros = {
    async list() {
      return withStore(STORE_PARAMETROS, "readonly", (s) => reqToPromise(s.getAll()));
    },
    async listByTipo(tipo) {
      const all = await this.list();
      return all.filter((p) => p.tipoCalculo === tipo || p.tipoCalculo === "geral");
    },
    async get(id) {
      return withStore(STORE_PARAMETROS, "readonly", (s) => reqToPromise(s.get(id)));
    },
    async save(param) {
      if (!param.id) param.id = Utils.uid();
      await withStore(STORE_PARAMETROS, "readwrite", (s) => s.put(param));
      return param;
    },
    async remove(id) {
      return withStore(STORE_PARAMETROS, "readwrite", (s) => s.delete(id));
    },
    async resetDefaults() {
      await withStore(STORE_PARAMETROS, "readwrite", (s) => s.clear());
      await ensureSeed();
    },
    /** Retorna um mapa { chave: paramObj } para uso no motor de cálculo */
    async getMap() {
      const all = await this.list();
      const map = {};
      all.forEach((p) => { map[p.chave] = p; });
      return map;
    },
  };

  window.DB = { init: () => openDb().then(ensureSeed), Orcamentos, Parametros };
})();
