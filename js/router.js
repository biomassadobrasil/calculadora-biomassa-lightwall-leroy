/* ============================================================
   router.js — roteador via hash + inicialização do app
   ============================================================ */
(function () {
  "use strict";

  const view = document.getElementById("view");
  const pageTitle = document.getElementById("page-title");

  const ROUTES = [
    { pattern: /^\/dashboard$/, title: "Dashboard", render: () => Views.dashboard(view) },
    { pattern: /^\/calculadora$/, title: "Calculadora", render: () => Views.calculadora(view, null) },
    { pattern: /^\/orcamentos\/([^/]+)\/editar$/, title: "Editar Orçamento", render: (m) => Views.calculadora(view, m[1]) },
    { pattern: /^\/orcamentos\/([^/]+)$/, title: "Detalhe do Orçamento", render: (m) => Views.orcamentoDetalhe(view, m[1]) },
    { pattern: /^\/orcamentos$/, title: "Orçamentos", render: () => Views.orcamentosList(view) },
    { pattern: /^\/parametros$/, title: "Parâmetros Técnicos", render: () => Views.parametros(view) },
  ];

  function currentPath() {
    const hash = location.hash || "#/dashboard";
    return hash.replace(/^#/, "") || "/dashboard";
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

  async function handleRoute() {
    const path = currentPath();
    const match = ROUTES.find((r) => r.pattern.test(path));
    closeMobileSidebar();
    window.scrollTo(0, 0);
    if (!match) {
      location.hash = "#/dashboard";
      return;
    }
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

  DB.init()
    .then(handleRoute)
    .catch((err) => {
      console.error("Falha ao iniciar banco de dados local:", err);
      view.innerHTML = "";
      view.appendChild(Utils.el("div", { class: "card" }, [
        Utils.el("h3", { class: "card-title" }, ["Não foi possível iniciar o armazenamento local"]),
        Utils.el("p", { class: "muted mt-8" }, ["Verifique se o navegador permite IndexedDB para arquivos locais (abra via um servidor local se necessário)."]),
      ]));
    });
})();
