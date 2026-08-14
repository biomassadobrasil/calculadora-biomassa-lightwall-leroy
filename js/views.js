/* ============================================================
   views.js — Renderização das páginas do aplicativo
   Namespace global: window.Views
   ============================================================ */
(function () {
  "use strict";

  const { el, qs, fmtNumber, fmtInt, fmtDate, fmtDateTime, toast, openModal, closeModal, confirmDialog, uid } = Utils;

  const STATUS_OPTIONS = ["Em aberto", "Em execução", "Concluído", "Cancelado"];
  const STATUS_BADGE = {
    "Em aberto": "badge-blue",
    "Em execução": "badge-amber",
    "Concluído": "badge-green",
    "Cancelado": "badge-gray",
  };

  const TIPO_LABEL = {
    assentamento: "Assentamento & Tratamento",
    pintura: "Pintura / Texturas",
    verniz_pu: "Painéis Aparentes - Verniz PU",
  };

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

  // ------------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------------
  async function dashboard(container) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    const orcamentos = await DB.Orcamentos.list();
    container.innerHTML = "";

    const total = orcamentos.length;
    const abertos = orcamentos.filter((o) => o.status === "Em aberto" || o.status === "Em execução").length;
    let metragemTotal = 0;
    const contagemTipo = { assentamento: 0, pintura: 0, verniz_pu: 0 };
    orcamentos.forEach((o) => {
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
      kpiCard("Em aberto / execução", fmtInt(abertos), iconClock(), null),
      kpiCard("M² já quantificados", fmtNumber(metragemTotal, 1) + " m²", iconRuler(), null),
      kpiCard("Acabamento mais usado", total ? TIPO_LABEL[tipoMaisUsado] : "—", iconStar(), null),
    ]);

    const donutData = [
      { label: TIPO_LABEL.assentamento, value: contagemTipo.assentamento },
      { label: TIPO_LABEL.pintura, value: contagemTipo.pintura },
      { label: TIPO_LABEL.verniz_pu, value: contagemTipo.verniz_pu },
    ];
    const statusCounts = STATUS_OPTIONS.map((s) => ({ label: s, value: orcamentos.filter((o) => o.status === s).length }));

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

    const recentes = orcamentos
      .slice()
      .sort((a, b) => new Date(b.dataAtualizacao) - new Date(a.dataAtualizacao))
      .slice(0, 5);

    const recentesCard = sectionCard([
      el("div", { class: "row-between" }, [
        el("h3", { class: "card-title" }, ["Últimos orçamentos"]),
        el("a", { class: "btn btn-secondary btn-sm", href: "#/orcamentos" }, ["Ver todos"]),
      ]),
      recentes.length ? tableRecentes(recentes) : emptyState("Nenhum orçamento ainda", "Crie o primeiro cálculo para começar a acompanhar os indicadores.", "#/calculadora", "Criar orçamento"),
    ]);

    container.appendChild(el("div", { class: "stack" }, [kpis, grid, recentesCard]));
  }

  function tableRecentes(list) {
    const wrap = el("div", { class: "table-wrap mt-16" });
    const table = el("table", {}, [
      el("thead", {}, [el("tr", {}, ["Projeto / Cliente", "Tipos", "Status", "Atualizado"].map((h) => el("th", {}, [h])))]),
      el("tbody", {}, list.map((o) => el("tr", { style: "cursor:pointer" , onclick: () => { location.hash = "#/orcamentos/" + o.id; } }, [
        el("td", {}, [el("strong", {}, [o.titulo || "(sem título)"]), el("div", { class: "small muted" }, [o.cliente || "—"])]),
        el("td", {}, [tipoBadges(o.calculos)]),
        el("td", {}, [statusBadge(o.status)]),
        el("td", {}, [fmtDateTime(o.dataAtualizacao)]),
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
    if (orcamentoId) existing = await DB.Orcamentos.get(orcamentoId);
    container.innerHTML = "";

    const meta = {
      titulo: (existing && existing.titulo) || "",
      cliente: (existing && existing.cliente) || "",
      responsavel: (existing && existing.responsavel) || "",
      status: (existing && existing.status) || "Em aberto",
      observacoes: (existing && existing.observacoes) || "",
    };

    function calcExistente(tipo) {
      return existing && (existing.calculos || []).find((c) => c.tipo === tipo);
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
    if (!existing) state.assentamento.ativo = true; // ao menos um tipo pré-selecionado para novo orçamento

    // ---- Metadados do orçamento ----
    const fTitulo = field({ id: "f-titulo", label: "Título do Orçamento / Projeto", required: true, value: meta.titulo, placeholder: "Ex: Fachada Residencial Jardins" });
    const fCliente = field({ id: "f-cliente", label: "Cliente", required: true, value: meta.cliente, placeholder: "Nome do cliente ou obra" });
    const fResponsavel = field({ id: "f-responsavel", label: "Responsável", value: meta.responsavel, placeholder: "Quem está calculando" });
    const fStatus = field({ id: "f-status", label: "Status", type: "select", value: meta.status, options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })) });
    const fObs = field({ id: "f-obs", label: "Observações", type: "textarea", value: meta.observacoes, full: true, placeholder: "Detalhes adicionais do projeto (opcional)" });

    const metaCard = sectionCard([
      el("h3", { class: "card-title" }, ["Dados do Orçamento"]),
      el("div", { class: "form-grid mt-16" }, [fTitulo.wrapper, fCliente.wrapper, fResponsavel.wrapper, fStatus.wrapper, fObs.wrapper]),
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
    const btnCancelar = el("a", { class: "btn btn-secondary", href: existing ? "#/orcamentos/" + existing.id : "#/orcamentos" }, ["Cancelar"]);
    const actions = el("div", { class: "row-between mt-24" }, [
      el("div", {}, []),
      el("div", { class: "row" }, [btnCancelar, btnSalvar]),
    ]);

    btnSalvar.addEventListener("click", async () => {
      [fTitulo, fCliente].forEach((f) => f.clearError());
      let ok = true;
      if (!fTitulo.value().trim()) { fTitulo.setError("Informe um título para o orçamento."); ok = false; }
      if (!fCliente.value().trim()) { fCliente.setError("Informe o cliente."); ok = false; }
      const ativos = Object.keys(state).filter((k) => state[k].ativo);
      if (!ativos.length) { toast("Selecione ao menos um tipo de cálculo.", "error"); ok = false; }
      ativos.forEach((k) => state[k].recalc && state[k].recalc(false));
      const invalido = ativos.find((k) => !state[k].valid);
      if (invalido) { toast("Corrija os campos destacados em \"" + TIPO_LABEL[invalido] + "\".", "error"); ok = false; }
      if (!ok) return;

      const orcamento = {
        id: existing ? existing.id : undefined,
        titulo: fTitulo.value().trim(),
        cliente: fCliente.value().trim(),
        responsavel: fResponsavel.value().trim(),
        status: fStatus.value(),
        observacoes: fObs.value().trim(),
        dataCriacao: existing ? existing.dataCriacao : undefined,
        calculos: ativos.map((k) => ({ tipo: k, inputs: state[k].inputs, resultado: state[k].resultado })),
      };
      const saved = await DB.Orcamentos.save(orcamento);
      toast(existing ? "Orçamento atualizado com sucesso." : "Orçamento criado com sucesso.", "success");
      location.hash = "#/orcamentos/" + saved.id;
    });

    container.appendChild(el("div", { class: "stack" }, [metaCard, sectionsWrap, resumoCard, actions]));
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
        const qtdLabel = it.embalagemLabel || "";
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
  // LISTA DE ORÇAMENTOS
  // ------------------------------------------------------------
  async function orcamentosList(container) {
    container.innerHTML = "";
    container.appendChild(loadingBlock());
    const all = await DB.Orcamentos.list();
    container.innerHTML = "";

    const filters = { busca: "", tipo: "", status: "" };

    const searchBox = el("div", { class: "search-box" }, [iconSearch(), el("input", { type: "search", placeholder: "Buscar por título, cliente ou responsável..." })]);
    const selTipo = el("select", {}, [
      el("option", { value: "" }, ["Todos os tipos"]),
      ...Object.keys(TIPO_LABEL).map((k) => el("option", { value: k }, [TIPO_LABEL[k]])),
    ]);
    const selStatus = el("select", {}, [
      el("option", { value: "" }, ["Todos os status"]),
      ...STATUS_OPTIONS.map((s) => el("option", { value: s }, [s])),
    ]);
    const btnExportCsv = el("button", { class: "btn btn-secondary btn-sm" }, [iconDownload(), "Exportar CSV"]);
    const btnNovo = el("a", { class: "btn btn-primary", href: "#/calculadora" }, [iconPlus(), "Novo Orçamento"]);

    const tableWrap = el("div", { class: "mt-16" });

    let sortKey = "dataAtualizacao", sortDir = -1;

    function applyFilters() {
      let list = all.filter((o) => {
        const q = filters.busca.trim().toLowerCase();
        const matchesBusca = !q || [o.titulo, o.cliente, o.responsavel].some((v) => (v || "").toLowerCase().includes(q));
        const matchesTipo = !filters.tipo || (o.calculos || []).some((c) => c.tipo === filters.tipo);
        const matchesStatus = !filters.status || o.status === filters.status;
        return matchesBusca && matchesTipo && matchesStatus;
      });
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
      const table = el("table", {}, [
        el("thead", {}, [el("tr", {}, [
          th("Projeto / Cliente", "titulo"), el("th", {}, ["Tipos"]), th("Status", "status"),
          th("Atualizado", "dataAtualizacao"), el("th", {}, ["Ações"]),
        ])]),
        el("tbody", {}, list.map((o) => el("tr", {}, [
          el("td", {}, [el("strong", {}, [o.titulo || "(sem título)"]), el("div", { class: "small muted" }, [o.cliente || "—"])]),
          el("td", {}, [tipoBadges(o.calculos)]),
          el("td", {}, [statusBadge(o.status)]),
          el("td", {}, [fmtDateTime(o.dataAtualizacao)]),
          el("td", {}, [el("div", { class: "table-actions" }, [
            el("a", { class: "btn btn-ghost btn-icon", href: "#/orcamentos/" + o.id, title: "Ver" }, [iconEye()]),
            el("a", { class: "btn btn-ghost btn-icon", href: "#/orcamentos/" + o.id + "/editar", title: "Editar" }, [iconEdit()]),
            el("button", {
              class: "btn btn-ghost btn-icon", title: "Excluir",
              onclick: () => confirmDialog({
                title: "Excluir orçamento",
                message: `Tem certeza que deseja excluir "${o.titulo}"? Esta ação não pode ser desfeita.`,
                confirmLabel: "Excluir", danger: true,
                onConfirm: async () => { await DB.Orcamentos.remove(o.id); toast("Orçamento excluído.", "success"); orcamentosList(container); },
              }),
            }, [iconTrash()]),
          ])]),
        ]))),
      ]);
      tableWrap.appendChild(el("div", { class: "table-wrap" }, [table]));
    }

    searchBox.querySelector("input").addEventListener("input", Utils.debounce((e) => { filters.busca = e.target.value; applyFilters(); }, 200));
    selTipo.addEventListener("change", (e) => { filters.tipo = e.target.value; applyFilters(); });
    selStatus.addEventListener("change", (e) => { filters.status = e.target.value; applyFilters(); });
    btnExportCsv.addEventListener("click", () => exportOrcamentosCsv(getCurrentFiltered()));

    function getCurrentFiltered() {
      return all.filter((o) => {
        const q = filters.busca.trim().toLowerCase();
        const matchesBusca = !q || [o.titulo, o.cliente, o.responsavel].some((v) => (v || "").toLowerCase().includes(q));
        const matchesTipo = !filters.tipo || (o.calculos || []).some((c) => c.tipo === filters.tipo);
        const matchesStatus = !filters.status || o.status === filters.status;
        return matchesBusca && matchesTipo && matchesStatus;
      });
    }

    const header = el("div", { class: "row-between" }, [
      el("div", { class: "filters-bar" }, [searchBox, selTipo, selStatus]),
      el("div", { class: "row" }, [btnExportCsv, btnNovo]),
    ]);

    container.appendChild(el("div", { class: "stack" }, [header, tableWrap]));
    applyFilters();
  }

  function exportOrcamentosCsv(list) {
    const rows = [["Título", "Cliente", "Responsável", "Status", "Tipos", "Criado em", "Atualizado em"]];
    list.forEach((o) => rows.push([
      o.titulo, o.cliente, o.responsavel || "", o.status,
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
      container.appendChild(emptyState("Orçamento não encontrado", "Ele pode ter sido excluído.", "#/orcamentos", "Voltar para lista"));
      return;
    }

    const header = el("div", { class: "row-between no-print" }, [
      el("div", {}, [
        el("h2", { style: "font-size:20px; font-weight:700;" }, [o.titulo]),
        el("p", { class: "muted mt-8" }, ["Cliente: " + (o.cliente || "—") + (o.responsavel ? " · Responsável: " + o.responsavel : "")]),
      ]),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn-secondary", onclick: () => window.print() }, [iconPrint(), "Imprimir / PDF"]),
        el("button", { class: "btn btn-secondary", onclick: () => exportOrcamentoDetalheCsv(o) }, [iconDownload(), "Exportar CSV"]),
        el("a", { class: "btn btn-secondary", href: "#/orcamentos/" + o.id + "/editar" }, [iconEdit(), "Editar"]),
        el("button", {
          class: "btn btn-danger",
          onclick: () => confirmDialog({
            title: "Excluir orçamento", message: `Tem certeza que deseja excluir "${o.titulo}"?`, confirmLabel: "Excluir", danger: true,
            onConfirm: async () => { await DB.Orcamentos.remove(o.id); toast("Orçamento excluído.", "success"); location.hash = "#/orcamentos"; },
          }),
        }, [iconTrash(), "Excluir"]),
      ]),
    ]);

    const metaCard = sectionCard([
      el("div", { class: "row", style: "gap:10px; flex-wrap:wrap;" }, [statusBadge(o.status), tipoBadges(o.calculos)]),
      el("div", { class: "form-grid mt-16" }, [
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
    downloadCsv(rows, "orcamento-" + (o.titulo || o.id).replace(/[^a-z0-9]+/gi, "-") + ".csv");
    toast("CSV exportado.", "success");
  }

  // ------------------------------------------------------------
  // PARÂMETROS TÉCNICOS
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
            const saved = await DB.Parametros.save(param);
            if (existing) { Object.assign(existing, saved); } else { all.push(saved); }
            closeModal();
            toast("Parâmetro salvo.", "success");
            renderList();
          },
        }, ["Salvar"]),
      ]);
      openModal({ title: existing ? "Editar Parâmetro" : "Novo Parâmetro", bodyNode: body, footerNode: footer });
    }

    btnNovo.addEventListener("click", () => openParametroModal(null));
    btnReset.addEventListener("click", () => confirmDialog({
      title: "Restaurar padrões", message: "Isso substitui todos os parâmetros técnicos pelos valores originais da planilha. Personalizações serão perdidas. Continuar?",
      confirmLabel: "Restaurar", danger: true,
      onConfirm: async () => { await DB.Parametros.resetDefaults(); toast("Parâmetros restaurados.", "success"); parametros(container); },
    }));

    const header = el("div", { class: "row-between" }, [
      el("div", {}, [el("h3", { class: "card-title" }, ["Parâmetros Técnicos"]), el("p", { class: "card-subtitle mt-8" }, ["Rendimentos e regras usadas no motor de cálculo."])]),
      el("div", { class: "row" }, [btnReset, btnNovo]),
    ]);

    container.appendChild(el("div", { class: "stack" }, [header, alertBox, tabs, tableWrap]));
    renderList();
  }

  window.Views = { dashboard, calculadora, orcamentosList, orcamentoDetalhe, parametros, TIPO_LABEL, STATUS_OPTIONS };
})();
