/* ============================================================
   views.js — Renderização das páginas do aplicativo
   Namespace global: window.Views
   ============================================================ */
(function () {
  "use strict";

  const { el, qs, fmtNumber, fmtInt, fmtDate, fmtDateTime, toast, openModal, closeModal, confirmDialog, uid } = Utils;

  const STATUS_OPTIONS = ["Rascunho", "Em elaboração", "Enviado", "Em negociação", "Aprovado", "Recusado", "Cancelado"];
  const STATUS_BADGE = {
    "Rascunho": "badge-gray",
    "Em elaboração": "badge-blue",
    "Enviado": "badge-blue",
    "Em negociação": "badge-amber",
    "Aprovado": "badge-green",
    "Recusado": "badge-red",
    "Cancelado": "badge-gray",
  };

  const TIPO_LABEL = {
    assentamento: "Assentamento & Tratamento",
    pintura: "Pintura / Texturas",
    verniz_pu: "Painéis Aparentes - Verniz PU",
  };

  const ROLE_LABEL = { master: "Master", basico: "Colaborador" };

  function currentUser() { return DB.Auth.getCurrentUser(); }
  function isMaster() { const u = currentUser(); return !!u && u.role === "master"; }
  function setPageTitle(text) { const h = document.getElementById("page-title"); if (h) h.textContent = text; }

  // ------------------------------------------------------------
  // Campos de formulário reutilizáveis
  // ------------------------------------------------------------
  function field(opts) {
    opts = opts || {};
    const wrapper = el("div", { class: "field" + (opts.full ? " full" : "") });
    wrapper.appendChild(el("label", {}, [opts.label + (opts.required ? " *" : "")]));

    let inputNode;
    if (opts.type === "select") {
      inputNode = el("select", { id: opts.id }, (opts.options || []).map((o) =>
        el("option", { value: o.value, selected: o.value === opts.value ? "selected" : null }, [o.label])
      ));
      if (opts.value !== undefined) inputNode.value = opts.value;
    } else if (opts.type === "textarea") {
      inputNode = el("textarea", { id: opts.id, placeholder: opts.placeholder || "" });
      inputNode.value = opts.value || "";
    } else {
      const group = opts.suffix ? el("div", { class: "input-suffix-group" }) : null;
      inputNode = el("input", {
        type: opts.type || "text", id: opts.id,
        placeholder: opts.placeholder || "",
        step: opts.step || (opts.type === "number" ? "any" : null),
        min: opts.min !== undefined ? opts.min : null,
        autocomplete: opts.type === "password" ? "current-password" : null,
      });
      inputNode.value = opts.value !== undefined && opts.value !== null ? opts.value : "";
      if (group) {
        group.appendChild(inputNode);
        group.appendChild(el("span", { class: "input-suffix" }, [opts.suffix]));
        wrapper.appendChild(group);
      }
    }
    if (!(opts.suffix && opts.type !== "select" && opts.type !== "textarea")) {
      wrapper.appendChild(inputNode);
    }
    if (opts.hint) wrapper.appendChild(el("span", { class: "hint" }, [opts.hint]));
    wrapper.appendChild(el("span", { class: "error-msg" }, [opts.errorMsg || "Campo obrigatório."]));

    return {
      wrapper, input: inputNode,
      setError(msg) { wrapper.classList.add("has-error"); if (msg) wrapper.querySelector(".error-msg").textContent = msg; },
      clearError() { wrapper.classList.remove("has-error"); },
      value() {
        if (opts.type === "number") return inputNode.value === "" ? null : Number(inputNode.value);
        return inputNode.value;
      },
    };
  }

  function sectionCard(children, extraClass) {
    return el("div", { class: "card" + (extraClass ? " " + extraClass : "") }, children);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------
  function login(container) {
    container.innerHTML = "";
    const fEmail = field({ id: "login-email", label: "E-mail", required: true, placeholder: "seuemail@empresa.com" });
    const fSenha = field({ id: "login-senha", label: "Senha", required: true, type: "password", placeholder: "••••••••" });
    const errorBox = el("div", { class: "alert alert-warning hidden" }, []);
    const btnEntrar = el("button", { class: "btn btn-primary btn-block", type: "submit" }, ["Entrar"]);

    const form = el("form", {}, [fEmail.wrapper, fSenha.wrapper, errorBox, el("div", { class: "mt-16" }, [btnEntrar])]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.classList.add("hidden");
      [fEmail, fSenha].forEach((f) => f.clearError());
      let ok = true;
      if (!fEmail.value().trim()) { fEmail.setError("Informe seu e-mail."); ok = false; }
      if (!fSenha.value()) { fSenha.setError("Informe sua senha."); ok = false; }
      if (!ok) return;
      btnEntrar.disabled = true; btnEntrar.textContent = "Entrando...";
      try {
        const user = await DB.Auth.login(fEmail.value().trim(), fSenha.value());
        location.hash = user.role === "master" ? "#/dashboard" : "#/orcamentos";
      } catch (err) {
        errorBox.textContent = err.message || "Não foi possível entrar. Verifique e-mail e senha.";
        errorBox.classList.remove("hidden");
      } finally {
        btnEntrar.disabled = false; btnEntrar.textContent = "Entrar";
      }
    });

    const card = el("div", { class: "card", style: "max-width:380px; width:100%;" }, [
      el("div", { class: "row", style: "gap:12px; align-items:center; margin-bottom:20px;" }, [
        el("div", { class: "brand-mark" }, ["B"]),
        el("div", {}, [
          el("strong", { style: "display:block; font-size:15px;" }, ["Biomassa & Lightwall"]),
          el("span", { class: "muted small" }, ["Calculadora de quantitativos"]),
        ]),
      ]),
      el("h2", { style: "font-size:18px; margin-bottom:4px;" }, ["Entrar"]),
      el("p", { class: "muted small", style: "margin-bottom:16px;" }, ["Acesse com o e-mail e senha cadastrados pelo seu gestor."]),
      form,
    ]);
    container.appendChild(card);
  }

  // ------------------------------------------------------------
  // DASHBOARD (somente Master)
  // ------------------------------------------------------------
  async function dashboard(container) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    const orcamentos = await DB.Orcamentos.list();
    container.innerHTML = "";

    const total = orcamentos.length;
    const abertos = orcamentos.filter((o) => !["Aprovado", "Recusado", "Cancelado"].includes(o.status)).length;
    let metragemTotal = 0;
    const contagemTipo = { assentamento: 0, pintura: 0, verniz_pu: 0 };
    const contagemColaborador = {};
    orcamentos.forEach((o) => {
      const nome = o.responsavel || "—";
      contagemColaborador[nome] = (contagemColaborador[nome] || 0) + 1;
      (o.calculos || []).forEach((c) => {
        contagemTipo[c.tipo] = (contagemTipo[c.tipo] || 0) + 1;
        (c.resultado.medidas || []).forEach((m) => {
          if (m.unidade === "m²" && ["Metragem de parede", "Área Interna", "Área Externa", "Metragem de painéis", "Área a envernizar"].includes(m.label)) {
            metragemTotal += Number(m.valor) || 0;
          }
        });
      });
    });
    const tipoMaisUsado = Object.keys(contagemTipo).sort((a, b) => contagemTipo[b] - contagemTipo[a])[0];

    const kpis = el("div", { class: "kpi-grid" }, [
      kpiCard("Total de orçamentos", fmtInt(total), iconClipboard(), null),
      kpiCard("Em andamento", fmtInt(abertos), iconClock(), null),
      kpiCard("M² já quantificados", fmtNumber(metragemTotal, 1) + " m²", iconRuler(), null),
      kpiCard("Acabamento mais usado", total ? TIPO_LABEL[tipoMaisUsado] : "—", iconStar(), null),
    ]);

    const donutData = [
      { label: TIPO_LABEL.assentamento, value: contagemTipo.assentamento },
      { label: TIPO_LABEL.pintura, value: contagemTipo.pintura },
      { label: TIPO_LABEL.verniz_pu, value: contagemTipo.verniz_pu },
    ];
    const statusCounts = STATUS_OPTIONS.map((s) => ({ label: s, value: orcamentos.filter((o) => o.status === s).length }));
    const colaboradorCounts = Object.keys(contagemColaborador).sort((a, b) => contagemColaborador[b] - contagemColaborador[a])
      .map((nome) => ({ label: nome, value: contagemColaborador[nome] }));

    const grid = el("div", { class: "grid-2" }, [
      sectionCard([
        el("h3", { class: "card-title" }, ["Orçamentos por tipo de cálculo"]),
        el("p", { class: "card-subtitle mt-8" }, ["Distribuição dos cálculos incluídos em todos os orçamentos salvos."]),
        el("div", { class: "mt-16" }, [Charts.donut(donutData, { centerLabel: "cálculos" })]),
      ]),
      sectionCard([
        el("h3", { class: "card-title" }, ["Orçamentos por status"]),
        el("p", { class: "card-subtitle mt-8" }, ["Acompanhamento do andamento comercial."]),
        el("div", { class: "mt-16" }, [Charts.barsHorizontal(statusCounts)]),
      ]),
    ]);

    const colaboradorCard = sectionCard([
      el("h3", { class: "card-title" }, ["Orçamentos por colaborador"]),
      el("p", { class: "card-subtitle mt-8" }, ["Quantos orçamentos cada colaborador já criou."]),
      el("div", { class: "mt-16" }, [Charts.barsHorizontal(colaboradorCounts)]),
    ], "mt-24");

    const recentes = orcamentos
      .slice()
      .sort((a, b) => new Date(b.dataAtualizacao) - new Date(a.dataAtualizacao))
      .slice(0, 8);

    const recentesCard = sectionCard([
      el("div", { class: "row-between" }, [
        el("h3", { class: "card-title" }, ["Últimos orçamentos"]),
        el("a", { class: "btn btn-secondary btn-sm", href: "#/orcamentos" }, ["Ver todos"]),
      ]),
      recentes.length ? tableRecentes(recentes) : emptyState("Nenhum orçamento ainda", "Assim que a equipe começar a salvar orçamentos, eles aparecem aqui.", "#/calculadora", "Criar orçamento"),
    ], "mt-24");

    container.appendChild(el("div", { class: "stack" }, [kpis, grid, colaboradorCard, recentesCard]));
  }

  function tableRecentes(list) {
    const wrap = el("div", { class: "table-wrap mt-16" });
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, ["Cliente", "Telefone / E-mail", "Responsável", "Status", "Criado em"].map((h) => el("th", {}, [h])))]),
      el("tbody", {}, list.map((o) => el("tr", { style: "cursor:pointer", onclick: () => { location.hash = "#/orcamentos/" + o.id; } }, [
        el("td", {}, [el("strong", {}, [o.cliente || "—"]), el("div", { class: "small muted" }, [o.titulo || "(sem título)"])]),
        el("td", {}, [el("div", {}, [o.clienteTelefone || "—"]), el("div", { class: "small muted" }, [o.clienteEmail || "—"])]),
        el("td", {}, [o.responsavel || "—"]),
        el("td", {}, [statusBadge(o.status)]),
        el("td", {}, [fmtDateTime(o.dataCriacao)]),
      ]))),
    ]);
    wrap.appendChild(table);
    return wrap;
  }

  function kpiCard(label, value, icon) {
    return el("div", { class: "kpi-card" }, [
      el("div", { class: "kpi-top" }, [el("div", { class: "kpi-icon" }, [icon])]),
      el("div", { class: "kpi-value" }, [value]),
      el("div", { class: "kpi-label" }, [label]),
    ]);
  }

  function iconSvg(pathD) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = `<path d="${pathD}"/>`; return s; }
  const iconClipboard = () => iconSvg("M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1Zm0 3H7v14h10V5h-2v1H9V5Z");
  const iconClock = () => iconSvg("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.4l4 2.3-1 1.7-5-3V7Z");
  const iconRuler = () => iconSvg("M3 16.5 16.5 3 21 7.5 7.5 21 3 16.5Zm3.5-.7 1.2 1.2 1-1-1.2-1.2-1 1Zm2.8-2.8 1.2 1.2 1-1-1.2-1.2-1 1Zm2.8-2.8 1.2 1.2 1-1-1.2-1.2-1 1Z");
  const iconStar = () => iconSvg("m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z");
  const iconSearch = () => iconSvg("M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 18-5.2-5.2");
  const iconPlus = () => iconSvg("M12 4v16M4 12h16");
  const iconEdit = () => iconSvg("M4 20h4L19.5 8.5a1.5 1.5 0 0 0 0-2.1l-1.9-1.9a1.5 1.5 0 0 0-2.1 0L4 15v5Zm10-13.5L17.5 10");
  const iconTrash = () => iconSvg("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6");
  const iconEye = () => iconSvg("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z");
  const iconDownload = () => iconSvg("M12 3v12m0 0-4-4m4 4 4-4M4 19h16");
  const iconPrint = () => iconSvg("M6 9V3h12v6M6 18h12v3H6v-3ZM4 9h16v7H4V9Z");
  const iconPower = () => iconSvg("M12 2v9M18.4 6.6a8 8 0 1 1-12.8 0");
  const iconLogout = () => iconSvg("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9");

  function statusBadge(status) {
    return el("span", { class: "badge " + (STATUS_BADGE[status] || "badge-gray") }, [el("span", { class: "badge-dot" }), status || "—"]);
  }
  function tipoBadges(calculos) {
    const wrap = el("div", { class: "row", style: "gap:6px; flex-wrap:wrap;" });
    (calculos || []).forEach((c) => wrap.appendChild(el("span", { class: "badge badge-gray" }, [TIPO_LABEL[c.tipo] || c.tipo])));
    return wrap;
  }

  function emptyState(title, msg, href, cta) {
    const box = el("div", { class: "empty-state" }, [
      iconClipboard(),
      el("h3", {}, [title]),
      el("p", {}, [msg]),
    ]);
    if (href) box.appendChild(el("a", { class: "btn btn-primary mt-16", href }, [iconPlus(), cta || "Criar"]));
    return box;
  }

  function loadingBlock() {
    return el("div", { class: "loading-wrap" }, [el("div", { class: "spinner" })]);
  }

  // ------------------------------------------------------------
  // CALCULADORA (criar / editar orçamento)
  // ------------------------------------------------------------
  async function calculadora(container, orcamentoId) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    const paramsMap = await DB.Parametros.getMap();
    let existing = null;
    if (orcamentoId) {
      existing = await DB.Orcamentos.get(orcamentoId);
      if (!existing) {
        container.innerHTML = "";
        container.appendChild(emptyState("Orçamento não encontrado", "Ele pode ter sido excluído, ou você não tem permissão para acessá-lo.", "#/orcamentos", "Voltar para a lista"));
        return;
      }
    }
    container.innerHTML = "";

    if (!existing) {
      renderClienteGate();
    } else {
      renderForm(existing, null);
    }

    // ---- Etapa obrigatória: dados do cliente (item 3 do requisito) ----
    function renderClienteGate() {
      container.innerHTML = "";
      const fNome = field({ id: "cg-nome", label: "Nome do Cliente", required: true, placeholder: "Nome completo" });
      const fTel = field({ id: "cg-tel", label: "Telefone", required: true, placeholder: "(DD) 90000-0000" });
      const fEmail = field({ id: "cg-email", label: "E-mail", required: true, placeholder: "cliente@email.com" });
      const btnContinuar = el("button", { class: "btn btn-primary" }, ["Continuar"]);
      const btnCancelar = el("a", { class: "btn btn-secondary", href: "#/orcamentos" }, ["Cancelar"]);

      btnContinuar.addEventListener("click", () => {
        [fNome, fTel, fEmail].forEach((f) => f.clearError());
        let ok = true;
        if (!fNome.value().trim()) { fNome.setError("Informe o nome do cliente."); ok = false; }
        if (!fTel.value().trim()) { fTel.setError("Informe o telefone do cliente."); ok = false; }
        const emailVal = fEmail.value().trim();
        if (!emailVal) { fEmail.setError("Informe o e-mail do cliente."); ok = false; }
        else if (!EMAIL_RE.test(emailVal)) { fEmail.setError("Informe um e-mail válido."); ok = false; }
        if (!ok) {
          toast("Para iniciar o orçamento, preencha Nome, Telefone e E-mail do cliente.", "error");
          return;
        }
        renderForm(null, { nome: fNome.value().trim(), telefone: fTel.value().trim(), email: emailVal });
      });

      const card = sectionCard([
        el("h3", { class: "card-title" }, ["Dados do Cliente"]),
        el("p", { class: "card-subtitle mt-8" }, ["Antes de montar o orçamento, informe os dados de contato do cliente."]),
        el("div", { class: "form-grid mt-16" }, [fNome.wrapper, fTel.wrapper, fEmail.wrapper]),
        el("div", { class: "row mt-16", style: "justify-content:flex-end;" }, [btnCancelar, btnContinuar]),
      ]);
      container.appendChild(el("div", { class: "stack" }, [card]));
    }

    function renderForm(orc, clienteInicial) {
      container.innerHTML = "";
      const meta = {
        titulo: (orc && orc.titulo) || "",
        clienteNome: (orc && orc.cliente) || (clienteInicial && clienteInicial.nome) || "",
        clienteTelefone: (orc && orc.clienteTelefone) || (clienteInicial && clienteInicial.telefone) || "",
        clienteEmail: (orc && orc.clienteEmail) || (clienteInicial && clienteInicial.email) || "",
        status: (orc && orc.status) || "Rascunho",
        observacoes: (orc && orc.observacoes) || "",
      };
      const responsavelNome = orc ? orc.responsavel : currentUser().name;
      const responsavelRole = orc ? (orc.createdBy && orc.createdBy.role) : currentUser().role;

      function calcExistente(tipo) {
        return orc && (orc.calculos || []).find((c) => c.tipo === tipo);
      }

      const state = {
        assentamento: {
          ativo: !!calcExistente("assentamento"),
          inputs: (calcExistente("assentamento") || {}).inputs || { qtdPaineis: "", alturaPainel: 3, larguraPainel: 0.61 },
        },
        pintura: {
          ativo: !!calcExistente("pintura"),
          inputs: (calcExistente("pintura") || {}).inputs || { areaInterna: "", areaExterna: "", aplicarInterna: true, aplicarExterna: true, aplicarTextura: true },
        },
        verniz_pu: {
          ativo: !!calcExistente("verniz_pu"),
          inputs: (calcExistente("verniz_pu") || {}).inputs || { qtdPaineis: "", alturaPainel: 3, larguraPainel: 0.61, areaEnvernizar: "", opcaoGarantia: "5anos" },
        },
      };
      if (!orc) state.assentamento.ativo = true;

      // ---- Metadados do orçamento ----
      const fTitulo = field({ id: "f-titulo", label: "Título do Orçamento / Projeto", value: meta.titulo, placeholder: "Ex: Fachada Residencial Jardins (opcional)" });
      const fClienteNome = field({ id: "f-cliente-nome", label: "Nome do Cliente", required: true, value: meta.clienteNome, placeholder: "Nome completo" });
      const fClienteTel = field({ id: "f-cliente-tel", label: "Telefone do Cliente", required: true, value: meta.clienteTelefone, placeholder: "(DD) 90000-0000" });
      const fClienteEmail = field({ id: "f-cliente-email", label: "E-mail do Cliente", required: true, value: meta.clienteEmail, placeholder: "cliente@email.com" });
      const fStatus = field({ id: "f-status", label: "Status", type: "select", value: meta.status, options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })) });
      const fObs = field({ id: "f-obs", label: "Observações", type: "textarea", value: meta.observacoes, full: true, placeholder: "Detalhes adicionais do projeto (opcional)" });

      const responsavelBlock = el("div", { class: "field" }, [
        el("label", {}, ["Responsável"]),
        el("div", { class: "row", style: "gap:8px; padding:10px 12px; background:var(--color-bg); border-radius:var(--radius-sm); border:1px solid var(--color-border);" }, [
          el("strong", {}, [responsavelNome || "—"]),
          responsavelRole ? el("span", { class: "badge " + (responsavelRole === "master" ? "badge-blue" : "badge-gray") }, [ROLE_LABEL[responsavelRole] || responsavelRole]) : null,
        ].filter(Boolean)),
        el("span", { class: "hint" }, ["Definido automaticamente pelo sistema — não pode ser alterado manualmente."]),
      ]);

      const metaCard = sectionCard([
        el("h3", { class: "card-title" }, ["Dados do Orçamento"]),
        el("div", { class: "form-grid mt-16" }, [fTitulo.wrapper, fClienteNome.wrapper, fClienteTel.wrapper, fClienteEmail.wrapper, responsavelBlock, fStatus.wrapper, fObs.wrapper]),
      ]);

      // ---- Seções de cálculo ----
      const sectionsWrap = el("div", { class: "stack mt-24" });
      const resumoBody = el("div");
      const resumoCard = sectionCard([el("h3", { class: "card-title" }, ["Resumo do Orçamento"]), resumoBody], "mt-24");

      function renderResumo() {
        resumoBody.innerHTML = "";
        const ativos = Object.keys(state).filter((k) => state[k].ativo);
        if (!ativos.length) {
          resumoBody.appendChild(el("p", { class: "muted mt-8" }, ["Nenhum tipo de cálculo selecionado ainda."]));
          return;
        }
        const grid = el("div", { class: "calc-summary-grid mt-8" });
        ativos.forEach((k) => {
          const r = state[k].resultado;
          const nItens = r ? r.grupos.reduce((s, g) => s + g.itens.length, 0) : 0;
          grid.appendChild(el("div", { class: "calc-summary-item" }, [
            el("div", { class: "v" }, [String(nItens)]),
            el("div", { class: "l" }, [TIPO_LABEL[k] + " — itens de material"]),
          ]));
        });
        resumoBody.appendChild(grid);
      }

      function buildAssentamentoSection() {
        const s = state.assentamento;
        const chk = el("input", { type: "checkbox" });
        chk.checked = s.ativo;
        const body = el("div", { class: "mt-16" + (s.ativo ? "" : " hidden") });

        const fQtd = field({ id: "as-qtd", label: "Quantidade de Painéis 3m", required: true, type: "number", min: 1, value: s.inputs.qtdPaineis, suffix: "un" });
        const fAlt = field({ id: "as-alt", label: "Altura do Painel", required: true, type: "number", min: 0.01, value: s.inputs.alturaPainel, suffix: "m" });
        const fLarg = field({ id: "as-larg", label: "Largura do Painel", required: true, type: "number", min: 0.01, value: s.inputs.larguraPainel, suffix: "m" });
        const resultBox = el("div", { class: "mt-24" });

        body.appendChild(el("div", { class: "form-grid" }, [fQtd.wrapper, fAlt.wrapper, fLarg.wrapper]));
        body.appendChild(resultBox);

        function recalc(silent) {
          [fQtd, fAlt, fLarg].forEach((f) => f.clearError());
          const inputs = { qtdPaineis: fQtd.value(), alturaPainel: fAlt.value(), larguraPainel: fLarg.value() };
          s.inputs = inputs;
          let valid = true;
          if (!inputs.qtdPaineis || inputs.qtdPaineis <= 0) { if (!silent) fQtd.setError("Informe a quantidade de painéis."); valid = false; }
          if (!inputs.alturaPainel || inputs.alturaPainel <= 0) { if (!silent) fAlt.setError("Informe a altura do painel."); valid = false; }
          if (!inputs.larguraPainel || inputs.larguraPainel <= 0) { if (!silent) fLarg.setError("Informe a largura do painel."); valid = false; }
          s.valid = valid;
          resultBox.innerHTML = "";
          if (!valid) { s.resultado = null; renderResumo(); return; }
          const resultado = Calculos.calcAssentamento(inputs, paramsMap);
          s.resultado = resultado;
          resultBox.appendChild(renderResultado(resultado));
          renderResumo();
        }
        s.recalc = recalc;
        [fQtd, fAlt, fLarg].forEach((f) => f.input.addEventListener("input", () => recalc(false)));
        chk.addEventListener("change", () => { s.ativo = chk.checked; body.classList.toggle("hidden", !s.ativo); renderResumo(); });
        if (s.ativo) recalc(true);

        return sectionCard([
          el("div", { class: "row-between" }, [
            el("label", { class: "row", style: "gap:10px; cursor:pointer;" }, [chk, el("strong", {}, ["Assentamento & Tratamento de Juntas / Encunhamento"])]),
          ]),
          el("p", { class: "card-subtitle mt-8" }, ["Materiais para instalação dos painéis, tratamento de juntas e encunhamento."]),
          body,
        ]);
      }

      function buildPinturaSection() {
        const s = state.pintura;
        const chk = el("input", { type: "checkbox" }); chk.checked = s.ativo;
        const body = el("div", { class: "mt-16" + (s.ativo ? "" : " hidden") });

        const fInterna = field({ id: "pt-int", label: "Acabamento Interno", type: "number", min: 0, value: s.inputs.areaInterna, suffix: "m²" });
        const fExterna = field({ id: "pt-ext", label: "Acabamento Externo", type: "number", min: 0, value: s.inputs.areaExterna, suffix: "m²" });
        const cInterna = el("label", { class: "checkbox-row" }, [Object.assign(document.createElement("input"), { type: "checkbox", checked: s.inputs.aplicarInterna }), "Aplicar Pintura Lisa Interna"]);
        const cExterna = el("label", { class: "checkbox-row" }, [Object.assign(document.createElement("input"), { type: "checkbox", checked: s.inputs.aplicarExterna }), "Aplicar Pintura Lisa Externa"]);
        const cTextura = el("label", { class: "checkbox-row" }, [Object.assign(document.createElement("input"), { type: "checkbox", checked: s.inputs.aplicarTextura }), "Aplicar Textura Externa"]);
        const resultBox = el("div", { class: "mt-24" });

        body.appendChild(el("div", { class: "form-grid" }, [fInterna.wrapper, fExterna.wrapper]));
        body.appendChild(el("div", { class: "row mt-8", style: "gap:20px; flex-wrap:wrap;" }, [cInterna, cExterna, cTextura]));
        body.appendChild(resultBox);

        function recalc(silent) {
          [fInterna, fExterna].forEach((f) => f.clearError());
          const inputs = {
            areaInterna: fInterna.value() || 0, areaExterna: fExterna.value() || 0,
            aplicarInterna: cInterna.querySelector("input").checked,
            aplicarExterna: cExterna.querySelector("input").checked,
            aplicarTextura: cTextura.querySelector("input").checked,
          };
          s.inputs = inputs;
          let valid = true;
          if (!inputs.areaInterna && !inputs.areaExterna) {
            if (!silent) fInterna.setError("Informe a área interna ou externa a pintar.");
            valid = false;
          }
          s.valid = valid;
          resultBox.innerHTML = "";
          if (!valid) { s.resultado = null; renderResumo(); return; }
          const resultado = Calculos.calcPintura(inputs, paramsMap);
          s.resultado = resultado;
          resultBox.appendChild(renderResultado(resultado));
          renderResumo();
        }
        s.recalc = recalc;
        [fInterna, fExterna].forEach((f) => f.input.addEventListener("input", () => recalc(false)));
        [cInterna, cExterna, cTextura].forEach((c) => c.querySelector("input").addEventListener("change", () => recalc(false)));
        chk.addEventListener("change", () => { s.ativo = chk.checked; body.classList.toggle("hidden", !s.ativo); renderResumo(); });
        if (s.ativo) recalc(true);

        return sectionCard([
          el("div", { class: "row-between" }, [
            el("label", { class: "row", style: "gap:10px; cursor:pointer;" }, [chk, el("strong", {}, ["Pintura / Texturas Elastoméricas"])]),
          ]),
          el("p", { class: "card-subtitle mt-8" }, ["Materiais de pintura lisa (interna/externa) e textura elastomérica externa."]),
          body,
        ]);
      }

      function buildVernizSection() {
        const s = state.verniz_pu;
        const chk = el("input", { type: "checkbox" }); chk.checked = s.ativo;
        const body = el("div", { class: "mt-16" + (s.ativo ? "" : " hidden") });

        const fQtd = field({ id: "vp-qtd", label: "Quantidade de Painéis", required: true, type: "number", min: 1, value: s.inputs.qtdPaineis, suffix: "un" });
        const fAlt = field({ id: "vp-alt", label: "Altura do Painel", required: true, type: "number", min: 0.01, value: s.inputs.alturaPainel, suffix: "m" });
        const fLarg = field({ id: "vp-larg", label: "Largura do Painel", required: true, type: "number", min: 0.01, value: s.inputs.larguraPainel, suffix: "m" });
        const fArea = field({ id: "vp-area", label: "Área a Envernizar (superfície completa)", type: "number", min: 0, value: s.inputs.areaEnvernizar, suffix: "m²", hint: "Deixe em branco/0 se não for envernizar toda a superfície." });
        const fGarantia = field({ id: "vp-garantia", label: "Opção de Garantia (aplicação em superfície)", type: "select", value: s.inputs.opcaoGarantia, options: [{ value: "5anos", label: "Verniz PU Base D'água — 5 anos de garantia" }, { value: "1ano", label: "Verniz Acrílico — 1 ano de garantia" }] });
        const resultBox = el("div", { class: "mt-24" });

        body.appendChild(el("div", { class: "form-grid" }, [fQtd.wrapper, fAlt.wrapper, fLarg.wrapper, fArea.wrapper, fGarantia.wrapper]));
        body.appendChild(resultBox);

        function recalc(silent) {
          [fQtd, fAlt, fLarg].forEach((f) => f.clearError());
          const inputs = {
            qtdPaineis: fQtd.value(), alturaPainel: fAlt.value(), larguraPainel: fLarg.value(),
            areaEnvernizar: fArea.value() || 0, opcaoGarantia: fGarantia.value(),
          };
          s.inputs = inputs;
          let valid = true;
          if (!inputs.qtdPaineis || inputs.qtdPaineis <= 0) { if (!silent) fQtd.setError("Informe a quantidade de painéis."); valid = false; }
          if (!inputs.alturaPainel || inputs.alturaPainel <= 0) { if (!silent) fAlt.setError("Informe a altura do painel."); valid = false; }
          if (!inputs.larguraPainel || inputs.larguraPainel <= 0) { if (!silent) fLarg.setError("Informe a largura do painel."); valid = false; }
          s.valid = valid;
          resultBox.innerHTML = "";
          if (!valid) { s.resultado = null; renderResumo(); return; }
          const resultado = Calculos.calcVernizPU(inputs, paramsMap);
          s.resultado = resultado;
          resultBox.appendChild(renderResultado(resultado));
          renderResumo();
        }
        s.recalc = recalc;
        [fQtd, fAlt, fLarg, fArea].forEach((f) => f.input.addEventListener("input", () => recalc(false)));
        fGarantia.input.addEventListener("change", () => recalc(false));
        chk.addEventListener("change", () => { s.ativo = chk.checked; body.classList.toggle("hidden", !s.ativo); renderResumo(); });
        if (s.ativo) recalc(true);

        return sectionCard([
          el("div", { class: "row-between" }, [
            el("label", { class: "row", style: "gap:10px; cursor:pointer;" }, [chk, el("strong", {}, ["Painéis Aparentes - Verniz PU"])]),
          ]),
          el("p", { class: "card-subtitle mt-8" }, ["Tratamento de juntas, selante e aplicação de verniz em painéis aparentes."]),
          body,
        ]);
      }

      sectionsWrap.appendChild(buildAssentamentoSection());
      sectionsWrap.appendChild(buildPinturaSection());
      sectionsWrap.appendChild(buildVernizSection());
      renderResumo();

      // ---- Ações ----
      const btnSalvar = el("button", { class: "btn btn-primary" }, ["Salvar Orçamento"]);
      const btnCancelar = el("a", { class: "btn btn-secondary", href: orc ? "#/orcamentos/" + orc.id : "#/orcamentos" }, ["Cancelar"]);
      const actions = el("div", { class: "row-between mt-24" }, [
        el("div", {}, []),
        el("div", { class: "row" }, [btnCancelar, btnSalvar]),
      ]);

      btnSalvar.addEventListener("click", async () => {
        [fClienteNome, fClienteTel, fClienteEmail].forEach((f) => f.clearError());
        let ok = true;
        if (!fClienteNome.value().trim()) { fClienteNome.setError("Informe o nome do cliente."); ok = false; }
        if (!fClienteTel.value().trim()) { fClienteTel.setError("Informe o telefone do cliente."); ok = false; }
        const emailVal = fClienteEmail.value().trim();
        if (!emailVal) { fClienteEmail.setError("Informe o e-mail do cliente."); ok = false; }
        else if (!EMAIL_RE.test(emailVal)) { fClienteEmail.setError("Informe um e-mail válido."); ok = false; }
        if (!ok) toast("Para iniciar o orçamento, preencha Nome, Telefone e E-mail do cliente.", "error");

        const ativos = Object.keys(state).filter((k) => state[k].ativo);
        if (!ativos.length) { toast("Selecione ao menos um tipo de cálculo.", "error"); ok = false; }
        ativos.forEach((k) => state[k].recalc && state[k].recalc(false));
        const invalido = ativos.find((k) => !state[k].valid);
        if (invalido) { toast("Corrija os campos destacados em \"" + TIPO_LABEL[invalido] + "\".", "error"); ok = false; }
        if (!ok) return;

        const payload = {
          id: orc ? orc.id : undefined,
          titulo: fTitulo.value().trim() || null,
          cliente: fClienteNome.value().trim(),
          clienteTelefone: fClienteTel.value().trim(),
          clienteEmail: emailVal,
          status: fStatus.value(),
          observacoes: fObs.value().trim(),
          calculos: ativos.map((k) => ({ tipo: k, inputs: state[k].inputs, resultado: state[k].resultado })),
        };
        try {
          const saved = await DB.Orcamentos.save(payload);
          toast(orc ? "Orçamento atualizado com sucesso." : "Orçamento criado com sucesso.", "success");
          location.hash = "#/orcamentos/" + saved.id;
        } catch (err) {
          toast(err.message || "Não foi possível salvar o orçamento.", "error");
        }
      });

      container.appendChild(el("div", { class: "stack" }, [metaCard, sectionsWrap, resumoCard, actions]));
    }
  }

  function renderResultado(resultado) {
    const wrap = el("div", { class: "stack" });
    if (resultado.medidas && resultado.medidas.length) {
      const grid = el("div", { class: "calc-summary-grid" });
      resultado.medidas.forEach((m) => {
        grid.appendChild(el("div", { class: "calc-summary-item" }, [
          el("div", { class: "v" }, [fmtNumber(m.valor, 2) + " " + m.unidade]),
          el("div", { class: "l" }, [m.label]),
        ]));
      });
      wrap.appendChild(grid);
    }
    resultado.grupos.forEach((g) => {
      const rows = g.itens.map((it) => {
        const extra = it.caixas !== undefined
          ? el("div", { class: "meta" }, [fmtNumber(it.caixas, 2) + " caixas (comprar " + fmtInt(it.caixasComprar) + ")"])
          : (it.garantia ? el("div", { class: "meta" }, [it.garantia]) : null);
        return el("div", { class: "result-row" }, [
          el("div", {}, [
            el("div", { class: "name" }, [it.produto]),
            el("div", { class: "meta" }, [
              it.rendimento !== null && it.rendimento !== undefined ? "Rendimento: " + fmtNumber(it.rendimento, 2) + " " + (it.unidadeRendimento || "") : (it.unidadeRendimento || ""),
            ]),
            extra,
          ].filter(Boolean)),
          el("div", { class: "value" }, [
            fmtInt(it.quantidadeComprar) + " un",
            el("br"),
            el("small", {}, ["exato: " + fmtNumber(it.quantidadeExata, 2)]),
          ]),
        ]);
      });
      wrap.appendChild(el("div", { class: "result-section" }, [
        el("div", { class: "result-section-header" }, [g.titulo]),
        el("div", { class: "result-list" }, rows.length ? rows : [el("div", { class: "result-row muted" }, ["Sem itens."])]),
      ]));
    });
    return wrap;
  }

  // ------------------------------------------------------------
  // LISTA DE ORÇAMENTOS (Master: todos · Colaborador: somente os seus)
  // ------------------------------------------------------------
  async function orcamentosList(container) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    const all = await DB.Orcamentos.list();
    container.innerHTML = "";

    const master = isMaster();
    setPageTitle(master ? "Todos os Orçamentos" : "Meus Orçamentos");

    const filters = { busca: "", tipo: "", status: "", colaborador: "", de: "", ate: "" };

    const searchBox = el("div", { class: "search-box" }, [iconSearch(), el("input", { type: "search", placeholder: "Buscar por título, cliente, telefone, e-mail ou ID..." })]);
    const selTipo = el("select", {}, [
      el("option", { value: "" }, ["Todos os tipos"]),
      ...Object.keys(TIPO_LABEL).map((k) => el("option", { value: k }, [TIPO_LABEL[k]])),
    ]);
    const selStatus = el("select", {}, [
      el("option", { value: "" }, ["Todos os status"]),
      ...STATUS_OPTIONS.map((s) => el("option", { value: s }, [s])),
    ]);
    const colaboradores = Array.from(new Set(all.map((o) => o.responsavel).filter(Boolean))).sort();
    const selColaborador = el("select", {}, [
      el("option", { value: "" }, ["Todos os colaboradores"]),
      ...colaboradores.map((c) => el("option", { value: c }, [c])),
    ]);
    const fDe = el("input", { type: "date", title: "Criado a partir de" });
    const fAte = el("input", { type: "date", title: "Criado até" });

    const btnExportCsv = el("button", { class: "btn btn-secondary btn-sm" }, [iconDownload(), "Exportar CSV"]);
    const btnNovo = el("a", { class: "btn btn-primary", href: "#/calculadora" }, [iconPlus(), "Novo Orçamento"]);

    const tableWrap = el("div", { class: "mt-16" });

    let sortKey = "dataAtualizacao", sortDir = -1;

    function matches(o) {
      const q = filters.busca.trim().toLowerCase();
      const matchesBusca = !q || [o.titulo, o.cliente, o.clienteTelefone, o.clienteEmail, o.responsavel, o.id].some((v) => (v || "").toString().toLowerCase().includes(q));
      const matchesTipo = !filters.tipo || (o.calculos || []).some((c) => c.tipo === filters.tipo);
      const matchesStatus = !filters.status || o.status === filters.status;
      const matchesColaborador = !filters.colaborador || o.responsavel === filters.colaborador;
      const dataCriacao = new Date(o.dataCriacao);
      const matchesDe = !filters.de || dataCriacao >= new Date(filters.de + "T00:00:00");
      const matchesAte = !filters.ate || dataCriacao <= new Date(filters.ate + "T23:59:59");
      return matchesBusca && matchesTipo && matchesStatus && matchesColaborador && matchesDe && matchesAte;
    }

    function applyFilters() {
      let list = all.filter(matches);
      list.sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === "dataAtualizacao" || sortKey === "dataCriacao") { av = new Date(av); bv = new Date(bv); }
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      });
      renderTable(list);
    }

    function th(label, key) {
      const node = el("th", { class: "sortable" }, [label + (sortKey === key ? (sortDir === 1 ? " ▲" : " ▼") : "")]);
      node.addEventListener("click", () => {
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
        applyFilters();
      });
      return node;
    }

    function renderTable(list) {
      tableWrap.innerHTML = "";
      if (!list.length) {
        tableWrap.appendChild(emptyState("Nenhum orçamento encontrado", "Ajuste os filtros ou crie um novo orçamento.", "#/calculadora", "Novo Orçamento"));
        return;
      }
      const headCells = [th("Cliente", "cliente"), el("th", {}, ["Contato"]), el("th", {}, ["Tipos"])];
      if (master) headCells.push(th("Colaborador", "responsavel"));
      headCells.push(th("Status", "status"), th("Atualizado", "dataAtualizacao"), el("th", {}, ["Ações"]));

      const table = el("table", {}, [
        el("thead", {}, [el("tr", {}, headCells)]),
        el("tbody", {}, list.map((o) => {
          const cells = [
            el("td", {}, [el("strong", {}, [o.cliente || "—"]), el("div", { class: "small muted" }, [o.titulo || "(sem título)"])]),
            el("td", {}, [el("div", { class: "small" }, [o.clienteTelefone || "—"]), el("div", { class: "small muted" }, [o.clienteEmail || "—"])]),
            el("td", {}, [tipoBadges(o.calculos)]),
          ];
          if (master) cells.push(el("td", {}, [o.responsavel || "—"]));
          cells.push(
            el("td", {}, [statusBadge(o.status)]),
            el("td", {}, [fmtDateTime(o.dataAtualizacao)]),
            el("td", {}, [el("div", { class: "table-actions" }, [
              el("a", { class: "btn btn-ghost btn-icon", href: "#/orcamentos/" + o.id, title: "Ver" }, [iconEye()]),
              el("a", { class: "btn btn-ghost btn-icon", href: "#/orcamentos/" + o.id + "/editar", title: "Editar" }, [iconEdit()]),
              el("button", {
                class: "btn btn-ghost btn-icon", title: "Excluir",
                onclick: () => confirmDialog({
                  title: "Excluir orçamento",
                  message: `Tem certeza que deseja excluir o orçamento de "${o.cliente}"? Esta ação não pode ser desfeita.`,
                  confirmLabel: "Excluir", danger: true,
                  onConfirm: async () => {
                    try { await DB.Orcamentos.remove(o.id); toast("Orçamento excluído.", "success"); orcamentosList(container); }
                    catch (e) { toast(e.message || "Não foi possível excluir.", "error"); }
                  },
                }),
              }, [iconTrash()]),
            ])])
          );
          return el("tr", {}, cells);
        })),
      ]);
      tableWrap.appendChild(el("div", { class: "table-wrap" }, [table]));
    }

    searchBox.querySelector("input").addEventListener("input", Utils.debounce((e) => { filters.busca = e.target.value; applyFilters(); }, 200));
    selTipo.addEventListener("change", (e) => { filters.tipo = e.target.value; applyFilters(); });
    selStatus.addEventListener("change", (e) => { filters.status = e.target.value; applyFilters(); });
    selColaborador.addEventListener("change", (e) => { filters.colaborador = e.target.value; applyFilters(); });
    fDe.addEventListener("change", (e) => { filters.de = e.target.value; applyFilters(); });
    fAte.addEventListener("change", (e) => { filters.ate = e.target.value; applyFilters(); });
    btnExportCsv.addEventListener("click", () => exportOrcamentosCsv(all.filter(matches)));

    const filtersBar = [searchBox, selTipo, selStatus];
    if (master) filtersBar.push(selColaborador, fDe, fAte);

    const header = el("div", { class: "row-between" }, [
      el("div", { class: "filters-bar" }, filtersBar),
      el("div", { class: "row" }, [btnExportCsv, btnNovo]),
    ]);

    container.appendChild(el("div", { class: "stack" }, [header, tableWrap]));
    applyFilters();
  }

  function exportOrcamentosCsv(list) {
    const rows = [["Cliente", "Telefone", "E-mail", "Título", "Responsável", "Status", "Tipos", "Criado em", "Atualizado em"]];
    list.forEach((o) => rows.push([
      o.cliente, o.clienteTelefone || "", o.clienteEmail || "", o.titulo || "", o.responsavel || "", o.status,
      (o.calculos || []).map((c) => TIPO_LABEL[c.tipo]).join(" + "),
      fmtDate(o.dataCriacao), fmtDate(o.dataAtualizacao),
    ]));
    downloadCsv(rows, "orcamentos.csv");
    toast("CSV exportado.", "success");
  }

  function downloadCsv(rows, filename) {
    const csv = "﻿" + rows.map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------
  // DETALHE DO ORÇAMENTO
  // ------------------------------------------------------------
  async function orcamentoDetalhe(container, id) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    const o = await DB.Orcamentos.get(id);
    container.innerHTML = "";
    if (!o) {
      container.appendChild(emptyState("Orçamento não encontrado", "Ele pode ter sido excluído, ou você não tem permissão para acessá-lo.", "#/orcamentos", "Voltar para lista"));
      return;
    }

    const header = el("div", { class: "row-between no-print" }, [
      el("div", {}, [
        el("h2", { style: "font-size:20px; font-weight:700;" }, [o.cliente]),
        el("p", { class: "muted mt-8" }, [(o.titulo ? o.titulo + " · " : "") + "Nº " + o.id.slice(0, 8).toUpperCase()]),
      ]),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn-secondary", onclick: () => window.print() }, [iconPrint(), "Imprimir / PDF"]),
        el("button", { class: "btn btn-secondary", onclick: () => exportOrcamentoDetalheCsv(o) }, [iconDownload(), "Exportar CSV"]),
        el("a", { class: "btn btn-secondary", href: "#/orcamentos/" + o.id + "/editar" }, [iconEdit(), "Editar"]),
        el("button", {
          class: "btn btn-danger",
          onclick: () => confirmDialog({
            title: "Excluir orçamento", message: `Tem certeza que deseja excluir o orçamento de "${o.cliente}"?`, confirmLabel: "Excluir", danger: true,
            onConfirm: async () => {
              try { await DB.Orcamentos.remove(o.id); toast("Orçamento excluído.", "success"); location.hash = "#/orcamentos"; }
              catch (e) { toast(e.message || "Não foi possível excluir.", "error"); }
            },
          }),
        }, [iconTrash(), "Excluir"]),
      ]),
    ]);

    const metaCard = sectionCard([
      el("div", { class: "row", style: "gap:10px; flex-wrap:wrap;" }, [statusBadge(o.status), tipoBadges(o.calculos)]),
      el("div", { class: "form-grid mt-16" }, [
        infoBlock("Cliente", o.cliente),
        infoBlock("Telefone", o.clienteTelefone || "—"),
        infoBlock("E-mail", o.clienteEmail || "—"),
        infoBlock("Responsável", (o.responsavel || "—") + (o.createdBy && o.createdBy.role ? " · " + (ROLE_LABEL[o.createdBy.role] || o.createdBy.role) : "")),
        infoBlock("Criado em", fmtDateTime(o.dataCriacao)),
        infoBlock("Última atualização", fmtDateTime(o.dataAtualizacao)),
      ]),
      o.observacoes ? el("div", { class: "mt-16" }, [el("label", { class: "small muted" }, ["Observações"]), el("p", { class: "mt-8" }, [o.observacoes])]) : null,
    ].filter(Boolean));

    const calcCards = (o.calculos || []).map((c) => sectionCard([
      el("h3", { class: "card-title" }, [TIPO_LABEL[c.tipo] || c.tipo]),
      el("div", { class: "mt-16" }, [renderResultado(c.resultado)]),
    ]));

    container.appendChild(el("div", { class: "stack" }, [header, metaCard, ...calcCards]));
  }

  function infoBlock(label, value) {
    return el("div", { class: "field" }, [el("label", {}, [label]), el("p", {}, [value])]);
  }

  function exportOrcamentoDetalheCsv(o) {
    const rows = [["Tipo de Cálculo", "Produto", "Unidade de Rendimento", "Rendimento", "Quantidade Exata", "Quantidade a Comprar"]];
    (o.calculos || []).forEach((c) => {
      c.resultado.grupos.forEach((g) => {
        g.itens.forEach((it) => {
          rows.push([TIPO_LABEL[c.tipo], it.produto, it.unidadeRendimento || "", it.rendimento ?? "", fmtNumber(it.quantidadeExata, 2), it.quantidadeComprar]);
        });
      });
    });
    downloadCsv(rows, "orcamento-" + (o.cliente || o.id).replace(/[^a-z0-9]+/gi, "-") + ".csv");
    toast("CSV exportado.", "success");
  }

  // ------------------------------------------------------------
  // PARÂMETROS TÉCNICOS (somente Master)
  // ------------------------------------------------------------
  async function parametros(container) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    let all = await DB.Parametros.list();
    container.innerHTML = "";

    const TIPO_FILTRO = { "": "Todos", geral: "Regras Gerais", assentamento: TIPO_LABEL.assentamento, pintura: TIPO_LABEL.pintura, verniz_pu: TIPO_LABEL.verniz_pu };
    let tipoAtivo = "";
    const tabs = el("div", { class: "tabs" }, Object.keys(TIPO_FILTRO).map((k) => {
      const btn = el("button", { class: "tab-btn" + (k === tipoAtivo ? " active" : "") }, [TIPO_FILTRO[k]]);
      btn.addEventListener("click", () => { tipoAtivo = k; renderList(); Utils.qsa(".tab-btn", tabs).forEach((b) => b.classList.remove("active")); btn.classList.add("active"); });
      return btn;
    }));

    const btnNovo = el("button", { class: "btn btn-primary" }, [iconPlus(), "Novo Parâmetro"]);
    const btnReset = el("button", { class: "btn btn-secondary" }, ["Restaurar padrões da planilha"]);
    const tableWrap = el("div", { class: "mt-16" });

    const alertBox = el("div", { class: "alert alert-info mt-16" }, [
      iconSvg("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"),
      el("span", {}, ["Estes são os rendimentos técnicos usados nas fórmulas (equivalentes às colunas \"Rendimento\" da planilha original). Alterar um valor aqui afeta apenas os ", el("strong", {}, ["novos"]), " cálculos — orçamentos já salvos mantêm o valor usado no momento em que foram calculados."]),
    ]);

    function renderList() {
      tableWrap.innerHTML = "";
      const list = all.filter((p) => !tipoAtivo || p.tipoCalculo === tipoAtivo);
      if (!list.length) {
        tableWrap.appendChild(emptyState("Nenhum parâmetro nesta categoria", "Adicione um novo parâmetro técnico.", null, null));
        return;
      }
      const table = el("table", {}, [
        el("thead", {}, [el("tr", {}, ["Produto / Regra", "Tipo de Cálculo", "Categoria", "Rendimento", "Unidade", "Ações"].map((h) => el("th", {}, [h])))]),
        el("tbody", {}, list.map((p) => el("tr", {}, [
          el("td", {}, [p.produto]),
          el("td", {}, [el("span", { class: "badge badge-gray" }, [TIPO_FILTRO[p.tipoCalculo] || p.tipoCalculo])]),
          el("td", {}, [categoriaBadge(p.categoria)]),
          el("td", {}, [p.categoria === "acessorio_fixo" ? "Fixo (" + (p.quantidadeFixa ?? 1) + " un)" : fmtNumber(p.rendimento, 2)]),
          el("td", {}, [p.unidade || "—"]),
          el("td", {}, [el("div", { class: "table-actions" }, [
            el("button", { class: "btn btn-ghost btn-icon", title: "Editar", onclick: () => openParametroModal(p) }, [iconEdit()]),
            el("button", {
              class: "btn btn-ghost btn-icon", title: "Excluir",
              onclick: () => confirmDialog({
                title: "Excluir parâmetro", message: `Excluir "${p.produto}"? Os cálculos passarão a usar o valor padrão original da planilha para este item.`,
                confirmLabel: "Excluir", danger: true,
                onConfirm: async () => { await DB.Parametros.remove(p.id); all = all.filter((x) => x.id !== p.id); toast("Parâmetro excluído.", "success"); renderList(); },
              }),
            }, [iconTrash()]),
          ])]),
        ]))),
      ]);
      tableWrap.appendChild(el("div", { class: "table-wrap" }, [table]));
    }

    function categoriaBadge(cat) {
      const map = { produto: ["badge-green", "Produto"], regra: ["badge-blue", "Regra de fórmula"], acessorio_fixo: ["badge-amber", "Acessório fixo"] };
      const [cls, label] = map[cat] || ["badge-gray", cat];
      return el("span", { class: "badge " + cls }, [label]);
    }

    function openParametroModal(existing) {
      const fProduto = field({ id: "pm-produto", label: "Nome do Produto / Regra", required: true, value: existing ? existing.produto : "", full: true });
      const fTipo = field({ id: "pm-tipo", label: "Tipo de Cálculo", type: "select", value: existing ? existing.tipoCalculo : "assentamento", options: Object.keys(TIPO_FILTRO).filter((k) => k).map((k) => ({ value: k, label: TIPO_FILTRO[k] })) });
      const fCategoria = field({ id: "pm-cat", label: "Categoria", type: "select", value: existing ? existing.categoria : "produto", options: [{ value: "produto", label: "Produto (rendimento)" }, { value: "regra", label: "Regra de fórmula (percentual/fração)" }, { value: "acessorio_fixo", label: "Acessório fixo (quantidade fixa)" }] });
      const fRendimento = field({ id: "pm-rend", label: "Rendimento", type: "number", step: "any", value: existing ? existing.rendimento : "" });
      const fUnidade = field({ id: "pm-un", label: "Unidade", value: existing ? existing.unidade : "", placeholder: "ex: m² por balde" });

      function toggleCategoria() {
        const isFixo = fCategoria.value() === "acessorio_fixo";
        fRendimento.wrapper.querySelector("label").textContent = isFixo ? "Quantidade Fixa" : "Rendimento";
      }
      fCategoria.input.addEventListener("change", toggleCategoria);
      toggleCategoria();

      const body = el("div", { class: "form-grid" }, [fProduto.wrapper, fTipo.wrapper, fCategoria.wrapper, fRendimento.wrapper, fUnidade.wrapper]);
      const footer = el("div", { class: "row" }, [
        el("button", { class: "btn btn-secondary", onclick: () => closeModal() }, ["Cancelar"]),
        el("button", {
          class: "btn btn-primary",
          onclick: async () => {
            [fProduto, fRendimento].forEach((f) => f.clearError());
            let ok = true;
            if (!fProduto.value().trim()) { fProduto.setError("Informe um nome."); ok = false; }
            const isFixo = fCategoria.value() === "acessorio_fixo";
            if (!isFixo && (fRendimento.value() === null || fRendimento.value() <= 0)) { fRendimento.setError("Informe um rendimento maior que zero."); ok = false; }
            if (!ok) return;
            const param = Object.assign({}, existing, {
              produto: fProduto.value().trim(),
              tipoCalculo: fTipo.value(),
              categoria: fCategoria.value(),
              rendimento: isFixo ? null : fRendimento.value(),
              quantidadeFixa: isFixo ? (fRendimento.value() || 1) : undefined,
              unidade: fUnidade.value().trim(),
              chave: existing ? existing.chave : "custom_" + uid(),
            });
            try {
              const saved = await DB.Parametros.save(param);
              if (existing) { Object.assign(existing, saved); } else { all.push(saved); }
              closeModal();
              toast("Parâmetro salvo.", "success");
              renderList();
            } catch (e) { toast(e.message || "Não foi possível salvar.", "error"); }
          },
        }, ["Salvar"]),
      ]);
      openModal({ title: existing ? "Editar Parâmetro" : "Novo Parâmetro", bodyNode: body, footerNode: footer });
    }

    btnNovo.addEventListener("click", () => openParametroModal(null));
    btnReset.addEventListener("click", () => confirmDialog({
      title: "Restaurar padrões", message: "Isso substitui todos os parâmetros técnicos pelos valores originais da planilha. Personalizações serão perdidas. Continuar?",
      confirmLabel: "Restaurar", danger: true,
      onConfirm: async () => {
        try { await DB.Parametros.resetDefaults(); toast("Parâmetros restaurados.", "success"); parametros(container); }
        catch (e) { toast(e.message || "Não foi possível restaurar.", "error"); }
      },
    }));

    const header = el("div", { class: "row-between" }, [
      el("div", {}, [el("h3", { class: "card-title" }, ["Parâmetros Técnicos"]), el("p", { class: "card-subtitle mt-8" }, ["Rendimentos e regras usadas no motor de cálculo."])]),
      el("div", { class: "row" }, [btnReset, btnNovo]),
    ]);

    container.appendChild(el("div", { class: "stack" }, [header, alertBox, tabs, tableWrap]));
    renderList();
  }

  // ------------------------------------------------------------
  // USUÁRIOS (somente Master)
  // ------------------------------------------------------------
  async function usuarios(container) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    let all = await DB.Usuarios.list();
    container.innerHTML = "";

    const tableWrap = el("div", { class: "mt-16" });
    const meId = currentUser() && currentUser().id;

    function renderList() {
      tableWrap.innerHTML = "";
      if (!all.length) {
        tableWrap.appendChild(emptyState("Nenhum usuário cadastrado", "Crie o primeiro usuário do sistema.", null, null));
        return;
      }
      const table = el("table", {}, [
        el("thead", {}, [el("tr", {}, ["Nome", "E-mail", "Perfil", "Status", "Criado em", "Ações"].map((h) => el("th", {}, [h])))]),
        el("tbody", {}, all.map((u) => el("tr", {}, [
          el("td", {}, [u.name + (u.id === meId ? " (você)" : "")]),
          el("td", {}, [u.email]),
          el("td", {}, [el("span", { class: "badge " + (u.role === "master" ? "badge-blue" : "badge-gray") }, [ROLE_LABEL[u.role] || u.role])]),
          el("td", {}, [el("span", { class: "badge " + (u.active ? "badge-green" : "badge-gray") }, [el("span", { class: "badge-dot" }), u.active ? "Ativo" : "Inativo"])]),
          el("td", {}, [fmtDate(u.createdAt)]),
          el("td", {}, [el("div", { class: "table-actions" }, [
            el("button", { class: "btn btn-ghost btn-icon", title: "Editar", onclick: () => openUsuarioModal(u) }, [iconEdit()]),
            el("button", { class: "btn btn-ghost btn-icon", title: u.active ? "Desativar" : "Ativar", onclick: () => toggleActive(u) }, [iconPower()]),
            el("button", {
              class: "btn btn-ghost btn-icon", title: "Excluir",
              onclick: () => confirmDialog({
                title: "Excluir usuário", message: `Tem certeza que deseja excluir "${u.name}"? Os orçamentos já criados por ele permanecem no sistema.`,
                confirmLabel: "Excluir", danger: true,
                onConfirm: async () => {
                  try { await DB.Usuarios.remove(u.id); all = all.filter((x) => x.id !== u.id); toast("Usuário excluído.", "success"); renderList(); }
                  catch (e) { toast(e.message || "Não foi possível excluir.", "error"); }
                },
              }),
            }, [iconTrash()]),
          ])]),
        ]))),
      ]);
      tableWrap.appendChild(el("div", { class: "table-wrap" }, [table]));
    }

    async function toggleActive(u) {
      try {
        const saved = await DB.Usuarios.save({ id: u.id, name: u.name, role: u.role, active: !u.active });
        Object.assign(u, saved);
        toast(u.active ? "Usuário ativado." : "Usuário desativado.", "success");
        renderList();
      } catch (e) { toast(e.message || "Não foi possível atualizar.", "error"); }
    }

    function openUsuarioModal(existing) {
      const fNome = field({ id: "us-nome", label: "Nome", required: true, value: existing ? existing.name : "" });
      const fEmail = field({ id: "us-email", label: "E-mail", required: !existing, value: existing ? existing.email : "", hint: existing ? "O e-mail não pode ser alterado após a criação." : "" });
      if (existing) fEmail.input.disabled = true;
      const fSenha = field({ id: "us-senha", label: existing ? "Nova Senha" : "Senha", type: "password", required: !existing, hint: existing ? "Deixe em branco para manter a senha atual." : "Mínimo de 6 caracteres." });
      const fPerfil = field({ id: "us-perfil", label: "Perfil", type: "select", value: existing ? existing.role : "basico", options: [{ value: "basico", label: "Básico (Colaborador)" }, { value: "master", label: "Master (Gestor)" }] });
      const ativoInput = Object.assign(document.createElement("input"), { type: "checkbox", checked: existing ? existing.active : true });
      const cAtivo = el("label", { class: "checkbox-row" }, [ativoInput, "Usuário ativo"]);

      const body = el("div", { class: "form-grid" }, [fNome.wrapper, fEmail.wrapper, fSenha.wrapper, fPerfil.wrapper, el("div", { class: "field full" }, [cAtivo])]);
      const footer = el("div", { class: "row" }, [
        el("button", { class: "btn btn-secondary", onclick: () => closeModal() }, ["Cancelar"]),
        el("button", {
          class: "btn btn-primary",
          onclick: async () => {
            [fNome, fEmail, fSenha].forEach((f) => f.clearError());
            let ok = true;
            if (!fNome.value().trim()) { fNome.setError("Informe o nome."); ok = false; }
            if (!existing) {
              if (!fEmail.value().trim()) { fEmail.setError("Informe o e-mail."); ok = false; }
              else if (!EMAIL_RE.test(fEmail.value().trim())) { fEmail.setError("Informe um e-mail válido."); ok = false; }
              if (!fSenha.value()) { fSenha.setError("Informe uma senha."); ok = false; }
            }
            if (fSenha.value() && fSenha.value().length < 6) { fSenha.setError("A senha deve ter ao menos 6 caracteres."); ok = false; }
            if (!ok) return;
            const payload = { id: existing ? existing.id : undefined, name: fNome.value().trim(), role: fPerfil.value(), active: ativoInput.checked };
            if (!existing) payload.email = fEmail.value().trim();
            if (fSenha.value()) payload.password = fSenha.value();
            try {
              const saved = await DB.Usuarios.save(payload);
              if (existing) { Object.assign(existing, saved); } else { all.push(saved); }
              closeModal();
              toast("Usuário salvo.", "success");
              renderList();
            } catch (e) { toast(e.message || "Não foi possível salvar.", "error"); }
          },
        }, ["Salvar"]),
      ]);
      openModal({ title: existing ? "Editar Usuário" : "Novo Usuário", bodyNode: body, footerNode: footer });
    }

    const header = el("div", { class: "row-between" }, [
      el("div", {}, [el("h3", { class: "card-title" }, ["Usuários"]), el("p", { class: "card-subtitle mt-8" }, ["Gerencie quem tem acesso ao sistema e com qual perfil."])]),
      el("button", { class: "btn btn-primary", onclick: () => openUsuarioModal(null) }, [iconPlus(), "Novo Usuário"]),
    ]);

    container.appendChild(el("div", { class: "stack" }, [header, tableWrap]));
    renderList();
  }

  window.Views = { login, dashboard, calculadora, orcamentosList, orcamentoDetalhe, parametros, usuarios, TIPO_LABEL, STATUS_OPTIONS, ROLE_LABEL };
})();
