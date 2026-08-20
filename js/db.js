/* ============================================================
   db.js — Cliente da API (substitui a antiga camada IndexedDB)
   Os dados agora ficam no banco de dados compartilhado (servidor),
   com controle de acesso por perfil aplicado no backend.
   Namespace global: window.DB
   ============================================================ */
(function () {
  "use strict";

  let currentUser = null;

  async function api(path, opts) {
    opts = opts || {};
    const fetchOpts = { method: opts.method || "GET", credentials: "same-origin" };
    if (opts.body !== undefined) {
      fetchOpts.headers = { "Content-Type": "application/json" };
      fetchOpts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, fetchOpts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* corpo vazio, ok */ }
    if (!res.ok) {
      if (res.status === 401) currentUser = null;
      const err = new Error((data && data.error) || ("Erro " + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------------- Autenticação ----------------
  const Auth = {
    async me() {
      const data = await api("/api/auth/me");
      currentUser = data.user;
      return currentUser;
    },
    async login(email, password) {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      currentUser = data.user;
      return currentUser;
    },
    async logout() {
      try { await api("/api/auth/logout", { method: "POST" }); } finally { currentUser = null; }
    },
    getCurrentUser() { return currentUser; },
    async activationInfo(token) {
      try {
        return await api("/api/auth/ativar/" + encodeURIComponent(token));
      } catch (e) {
        return { valid: false, error: e.message };
      }
    },
    async activate(token, password, confirmPassword) {
      const data = await api("/api/auth/ativar/" + encodeURIComponent(token), { method: "POST", body: { password, confirmPassword } });
      currentUser = data.user;
      return currentUser;
    },
    async solicitarNovoLink(email) {
      return api("/api/auth/solicitar-novo-link", { method: "POST", body: { email } });
    },
  };

  // ---------------- Orçamentos ----------------
  const Orcamentos = {
    async list() {
      return api("/api/orcamentos");
    },
    async get(id) {
      try {
        return await api("/api/orcamentos/" + encodeURIComponent(id));
      } catch (e) {
        if (e.status === 404 || e.status === 403) return null;
        throw e;
      }
    },
    async save(orcamento) {
      if (orcamento.id) {
        return api("/api/orcamentos/" + encodeURIComponent(orcamento.id), { method: "PUT", body: orcamento });
      }
      return api("/api/orcamentos", { method: "POST", body: orcamento });
    },
    async remove(id) {
      return api("/api/orcamentos/" + encodeURIComponent(id), { method: "DELETE" });
    },
  };

  // ---------------- Parâmetros Técnicos ----------------
  const Parametros = {
    async list() {
      return api("/api/parametros");
    },
    async listByTipo(tipo) {
      const all = await this.list();
      return all.filter((p) => p.tipoCalculo === tipo || p.tipoCalculo === "geral");
    },
    async save(param) {
      if (param.id) return api("/api/parametros/" + encodeURIComponent(param.id), { method: "PUT", body: param });
      return api("/api/parametros", { method: "POST", body: param });
    },
    async remove(id) {
      return api("/api/parametros/" + encodeURIComponent(id), { method: "DELETE" });
    },
    async resetDefaults() {
      return api("/api/parametros/reset", { method: "POST" });
    },
    async auditoria() {
      return api("/api/parametros/auditoria");
    },
    async getMap() {
      const all = await this.list();
      const map = {};
      all.forEach((p) => { map[p.chave] = p; });
      return map;
    },
  };

  // ---------------- Usuários (somente Master) ----------------
  const Usuarios = {
    async list() {
      return api("/api/usuarios");
    },
    async save(user) {
      if (user.id) return api("/api/usuarios/" + encodeURIComponent(user.id), { method: "PUT", body: user });
      return api("/api/usuarios", { method: "POST", body: user });
    },
    async remove(id) {
      return api("/api/usuarios/" + encodeURIComponent(id), { method: "DELETE" });
    },
    async reenviarConvite(id) {
      return api("/api/usuarios/" + encodeURIComponent(id) + "/reenviar-convite", { method: "POST" });
    },
  };

  window.DB = { init: async () => {}, Auth, Orcamentos, Parametros, Usuarios };
})();
