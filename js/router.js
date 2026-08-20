/* ============================================================
   router.js — roteador via hash + autenticação + controle de acesso
   ============================================================ */
(function () {
  "use strict";

  const view = document.getElementById("view");
  const pageTitle = document.getElementById("page-title");

  const ROUTES = [
    { path: "/dashboard", title: "Dashboard", roles: ["master"], render: () => Views.dashboard(view) },
    { path: "/calculadora", title: "Calculadora", pattern: /^\/calculadora$/, render: () => Views.calculadora(view, null) },
    { path: "/orcamentos/:id/editar", pattern: /^\/orcamentos\/([^/]+)\/editar$/, title: "Editar Orçamento", render: (m) => Views.calculadora(view, m[1]) },
    { path: "/orcamentos/:id", pattern: /^\/orcamentos\/([^/]+)$/, title: "Detalhe do Orçamento", render: (m) => Views.orcamentoDetalhe(view, m[1]) },
    { path: "/orcamentos", pattern: /^\/orcamentos$/, title: "Orçamentos", render: () => Views.orcamentosList(view) },
    { path: "/parametros", pattern: /^\/parametros$/, title: "Parâmetros Técnicos", render: () => Views.parametros(view) },
    { path: "/parametros/historico", pattern: /^\/parametros\/historico$/, title: "Histórico de Alterações", roles: ["master"], render: () => Views.parametrosHistorico(view) },
    { path: "/usuarios", pattern: /^\/usuarios$/, title: "Usuários", roles: ["master"], render: () => Views.usuarios(view) },
  ].map((r) => Object.assign(r, { pattern: r.pattern || new RegExp("^" + r.path.replace(/\//g, "\\/") + "$") }));

  function currentPath() {
    const hash = location.hash || "#/dashboard";
    return hash.replace(/^#/, "") || "/dashboard";
  }

  function landingFor(user) {
    return user && user.role === "master" ? "/dashboard" : "/orcamentos";
  }

  function updateActiveNav(path) {
    Utils.qsa(".nav-item").forEach((a) => {
      const route = a.getAttribute("data-route");
      a.classList.toggle("active", route && path.startsWith(route));
    });
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("open");
  }

  function applyAuthUI(user) {
    Utils.qsa("[data-roles]").forEach((el) => {
      const allowed = el.getAttribute("data-roles").split(",");
      el.classList.toggle("hidden", !user || !allowed.includes(user.role));
    });
    const orcamentosNavLabel = Utils.qs('.nav-item[data-route="/orcamentos"] span');
    if (orcamentosNavLabel) orcamentosNavLabel.textContent = user && user.role === "master" ? "Orçamentos" : "Meus Orçamentos";

    const userChip = document.getElementById("topbar-user");
    if (userChip) {
      userChip.innerHTML = "";
      if (user) {
        userChip.classList.remove("hidden");
        userChip.appendChild(Utils.el("span", { class: "badge " + (user.role === "master" ? "badge-blue" : "badge-gray"), style: "margin-right:8px;" }, [Views.ROLE_LABEL[user.role] || user.role]));
        userChip.appendChild(Utils.el("span", { class: "small", style: "margin-right:12px; font-weight:600;" }, [user.name]));
        userChip.appendChild(Utils.el("button", {
          class: "btn btn-ghost btn-sm", title: "Sair",
          onclick: async () => { await DB.Auth.logout(); location.hash = "#/login"; },
        }, ["Sair"]));
      } else {
        userChip.classList.add("hidden");
      }
    }
  }

  function setShellVisible(visible) {
    document.body.classList.toggle("auth-mode", !visible);
  }

  async function renderLogin() {
    setShellVisible(false);
    pageTitle.textContent = "Entrar";
    view.innerHTML = "";
    Views.login(view);
  }

  async function handleRoute() {
    const path = currentPath();

    if (path === "/login") {
      if (DB.Auth.getCurrentUser()) { location.hash = "#" + landingFor(DB.Auth.getCurrentUser()); return; }
      await renderLogin();
      return;
    }

    // Ativação de conta por convite: rota pública, não exige sessão (o usuário ainda não tem uma).
    const ativacao = path.match(/^\/ativar-conta\/([^/]+)$/);
    if (ativacao) {
      setShellVisible(false);
      pageTitle.textContent = "Ativar Conta";
      view.innerHTML = "";
      await Views.ativarConta(view, ativacao[1]);
      return;
    }

    let user = DB.Auth.getCurrentUser();
    if (!user) {
      try { user = await DB.Auth.me(); } catch (e) { user = null; }
    }
    if (!user) {
      location.hash = "#/login";
      return;
    }

    setShellVisible(true);
    applyAuthUI(user);

    const match = ROUTES.find((r) => r.pattern.test(path));
    if (!match) {
      location.hash = "#" + landingFor(user);
      return;
    }
    if (match.roles && !match.roles.includes(user.role)) {
      location.hash = "#" + landingFor(user);
      return;
    }

    closeMobileSidebar();
    window.scrollTo(0, 0);
    pageTitle.textContent = match.title;
    updateActiveNav(path);
    try {
      await match.render(path.match(match.pattern));
    } catch (err) {
      console.error(err);
      view.innerHTML = "";
      view.appendChild(Utils.el("div", { class: "card" }, [
        Utils.el("h3", { class: "card-title" }, ["Ocorreu um erro ao carregar esta página"]),
        Utils.el("p", { class: "muted mt-8" }, [String(err && err.message ? err.message : err)]),
      ]));
    }
  }

  window.addEventListener("hashchange", handleRoute);

  document.getElementById("btn-menu").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebar-overlay").classList.add("open");
  });
  document.getElementById("sidebar-overlay").addEventListener("click", closeMobileSidebar);
  Utils.qsa(".nav-item").forEach((a) => a.addEventListener("click", closeMobileSidebar));

  handleRoute().catch((err) => {
    console.error("Falha ao iniciar a aplicação:", err);
    view.innerHTML = "";
    view.appendChild(Utils.el("div", { class: "card" }, [
      Utils.el("h3", { class: "card-title" }, ["Não foi possível carregar a aplicação"]),
      Utils.el("p", { class: "muted mt-8" }, [String(err && err.message ? err.message : err)]),
    ]));
  });
})();
