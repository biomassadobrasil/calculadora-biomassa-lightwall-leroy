/* ============================================================
   calculos.js — Motor de cálculo (regras de negócio da planilha)
   Cada função é pura: recebe inputs + parâmetros técnicos (do
   cadastro editável) e devolve medidas + lista de materiais.

   Correções aplicadas em relação à planilha original (aprovadas
   pelo usuário — ver relatório de entrega):
   1. Pintura/Texturas: "BioRevest Pedras Naturais" agora usa a
      área EXTERNA (C8) em vez da célula vazia C9 (bug original
      fazia o resultado ser sempre 0).
   2. Painéis Aparentes: a metragem de painéis agora é calculada
      dinamicamente (qtd × altura × largura) em vez da constante
      fixa 1,83 (3 × 0,61) da planilha original — mesma correção
      aplicada por analogia ao cálculo de Bioprimer em Assentamento
      (que também usava a constante fixa 1,83 em vez do valor real).

   Namespace global: window.Calculos
   ============================================================ */
(function () {
  "use strict";

  const ROUND = (n) => Math.round(n || 0);
  const ROUNDUP = (n) => Math.ceil(n || 0);

  function rendimento(params, chave, fallback) {
    const p = params[chave];
    if (!p || p.rendimento === null || p.rendimento === undefined) return fallback;
    return Number(p.rendimento);
  }

  function nomeProduto(params, chave, fallback) {
    const p = params[chave];
    return (p && p.produto) || fallback;
  }

  function unidadeProduto(params, chave, fallback) {
    const p = params[chave];
    return (p && p.unidade) || fallback;
  }

  /**
   * Item de material calculado.
   * quantidadeExata: valor "cru" da fórmula (pode ser fracionário).
   * quantidadeComprar: valor arredondado para cima — o que de fato
   * se deve comprar (nenhuma embalagem fracionária).
   */
  function item(chave, params, { unidade, fallbackNome, quantidadeExata, jaArredondado, embalagem }) {
    const nome = nomeProduto(params, chave, fallbackNome);
    const un = unidadeProduto(params, chave, unidade);
    const qtdExata = Number(quantidadeExata) || 0;
    const qtdComprar = jaArredondado ? qtdExata : Math.ceil(qtdExata - 1e-9);
    return {
      chave,
      produto: nome,
      unidadeRendimento: un,
      rendimento: rendimento(params, chave, null),
      embalagem: embalagem || null,
      quantidadeExata: qtdExata,
      quantidadeComprar: Math.max(qtdComprar, quantidadeExata > 0 ? 1 : 0),
    };
  }

  // ============================================================
  // 1. ASSENTAMENTO & TRATAMENTO DE JUNTAS / ENCUNHAMENTO
  // ============================================================
  function calcAssentamento(inputs, params) {
    const qtdPaineis = Number(inputs.qtdPaineis) || 0;
    const alturaPainel = Number(inputs.alturaPainel) || 0;
    const larguraPainel = Number(inputs.larguraPainel) || 0;

    const metragemParede = qtdPaineis * (alturaPainel * larguraPainel);
    const metragemLinearJuntas = ((larguraPainel + alturaPainel) * 2) * qtdPaineis;
    const pctBioflex = rendimento(params, "assentamento_pct_bioflex", 0.2);
    const pctTela = rendimento(params, "assentamento_pct_tela", 0.15);
    const tratamentoJuntasBioflexM2 = metragemLinearJuntas * pctBioflex;
    const tratamentoJuntasTelaM2 = metragemLinearJuntas * pctTela;
    const metragemLinearEncunhamento = qtdPaineis * larguraPainel;

    const unidadesPorCaixa = rendimento(params, "unidades_por_caixa_argamassa", 6);
    const margem = rendimento(params, "margem_seguranca_caixas", 0.4);

    const rendArgamassa = rendimento(params, "assentamento_argamassa", 3);
    const embArgamassa = rendArgamassa > 0 ? qtdPaineis / rendArgamassa : 0;
    const argamassa = item("assentamento_argamassa", params, {
      fallbackNome: "Argamassa Polimérica Biomassa (Bisnaga 3 kg)", unidade: "placas por bisnaga",
      quantidadeExata: embArgamassa,
    });
    argamassa.caixas = (embArgamassa / unidadesPorCaixa) + margem;
    argamassa.caixasComprar = Math.ceil(argamassa.caixas - 1e-9);

    const rendBioprimer = rendimento(params, "assentamento_bioprimer", 32);
    const bioprimer = item("assentamento_bioprimer", params, {
      fallbackNome: "Bioprimer - Promotor de Aderência (Balde 3,6 L)", unidade: "m² por balde",
      quantidadeExata: rendBioprimer > 0 ? metragemParede / rendBioprimer : 0,
    });

    const rendBioflex = rendimento(params, "assentamento_bioflex", 1.66);
    const bioflex = item("assentamento_bioflex", params, {
      fallbackNome: "Bioflex - Base Coat & Tratamento de Juntas (Balde 5 kg)", unidade: "m² por balde",
      quantidadeExata: rendBioflex > 0 ? ROUNDUP(tratamentoJuntasBioflexM2 / rendBioflex) : 0,
      jaArredondado: true,
    });

    const rendTela = rendimento(params, "assentamento_tela", 7.5);
    const tela = item("assentamento_tela", params, {
      fallbackNome: "Tela de Fibra de Vidro 15cm x 50m (rolo)", unidade: "m² por rolo",
      quantidadeExata: rendTela > 0 ? ROUNDUP(tratamentoJuntasTelaM2 / rendTela) : 0,
      jaArredondado: true,
    });

    const rendGel = rendimento(params, "assentamento_gel", 15.5);
    const gel = item("assentamento_gel", params, {
      fallbackNome: "Gel de Encunhamento (Balde 25 kg)", unidade: "m linear por balde",
      quantidadeExata: rendGel > 0 ? ROUND(metragemLinearEncunhamento / rendGel) : 0,
      jaArredondado: true,
    });

    return {
      tipo: "assentamento",
      titulo: "Assentamento & Tratamento de Juntas / Encunhamento",
      inputs: { qtdPaineis, alturaPainel, larguraPainel },
      medidas: [
        { label: "Metragem de parede", valor: metragemParede, unidade: "m²" },
        { label: "Metragem linear de juntas", valor: metragemLinearJuntas, unidade: "m" },
        { label: "Tratamento de juntas (Bioflex)", valor: tratamentoJuntasBioflexM2, unidade: "m²" },
        { label: "Tratamento de juntas (Tela)", valor: tratamentoJuntasTelaM2, unidade: "m²" },
        { label: "Metragem linear de encunhamento", valor: metragemLinearEncunhamento, unidade: "m" },
      ],
      grupos: [
        { titulo: "Assentamento", itens: [argamassa] },
        { titulo: "Tratamento de Juntas", itens: [bioprimer, bioflex, tela] },
        { titulo: "Encunhamento", itens: [gel] },
      ],
    };
  }

  // ============================================================
  // 2. PINTURA / TEXTURAS ELASTOMÉRICAS
  // ============================================================
  function calcPintura(inputs, params) {
    const areaInterna = Number(inputs.areaInterna) || 0;
    const areaExterna = Number(inputs.areaExterna) || 0;
    const aplicarInterna = inputs.aplicarInterna !== false && areaInterna > 0;
    const aplicarExterna = inputs.aplicarExterna !== false && areaExterna > 0;
    const aplicarTextura = inputs.aplicarTextura !== false && areaExterna > 0;

    function secaoLisa(area, sufixoLabel) {
      const rBioprimer = rendimento(params, "pintura_bioprimer", 32);
      const rMassa = rendimento(params, "pintura_massa_regularizadora", 25);
      const rTinta = rendimento(params, "pintura_tinta_emborrachada", 80);
      return [
        item("pintura_bioprimer", params, { fallbackNome: "Bioprimer - Promotor de Aderência (Balde 3,6 L)", unidade: "m² por balde", quantidadeExata: rBioprimer > 0 ? ROUND(area / rBioprimer) : 0, jaArredondado: true }),
        item("pintura_massa_regularizadora", params, { fallbackNome: "Massa Regularizadora (Balde 25 kg)", unidade: "m² por balde", quantidadeExata: rMassa > 0 ? ROUND(area / rMassa) : 0, jaArredondado: true }),
        item("pintura_tinta_emborrachada", params, { fallbackNome: "Tinta Emborrachada (Balde 18 L)", unidade: "m² por balde", quantidadeExata: rTinta > 0 ? ROUND(area / rTinta) : 0, jaArredondado: true }),
      ];
    }

    const grupos = [];
    if (aplicarInterna) grupos.push({ titulo: "Acabamento Interno com Pintura Lisa", itens: secaoLisa(areaInterna) });
    if (aplicarExterna) grupos.push({ titulo: "Acabamento Externo com Pintura Lisa", itens: secaoLisa(areaExterna) });
    if (aplicarTextura) {
      const rSelador = rendimento(params, "pintura_selador", 75);
      const rLamato = rendimento(params, "pintura_biorevest_lamato", 10);
      const rRolada = rendimento(params, "pintura_biorevest_rolada", 13);
      const rPedras = rendimento(params, "pintura_biorevest_pedras", 14);
      grupos.push({
        titulo: "Acabamento Externo com Textura",
        itens: [
          item("pintura_selador", params, { fallbackNome: "Selador Acrílico Pigmentado - Biomassa (Barrica 16 L)", unidade: "m² por barrica", quantidadeExata: rSelador > 0 ? ROUND(areaExterna / rSelador) : 0, jaArredondado: true }),
          item("pintura_biorevest_lamato", params, { fallbackNome: "BioRevest - Textura Elastomérica Lamato (Balde 25 kg)", unidade: "m² por balde", quantidadeExata: rLamato > 0 ? ROUND(areaExterna / rLamato) : 0, jaArredondado: true }),
          item("pintura_biorevest_rolada", params, { fallbackNome: "BioRevest - Textura Elastomérica Rolada (Balde 25 kg)", unidade: "m² por balde", quantidadeExata: rRolada > 0 ? ROUND(areaExterna / rRolada) : 0, jaArredondado: true }),
          // CORRIGIDO: planilha original dividia por C9 (célula vazia) — usa-se areaExterna (C8), igual às demais linhas do grupo.
          item("pintura_biorevest_pedras", params, { fallbackNome: "BioRevest - Textura Elastomérica Pedras Naturais (Balde 25 kg)", unidade: "m² por balde", quantidadeExata: rPedras > 0 ? ROUND(areaExterna / rPedras) : 0, jaArredondado: true }),
        ],
      });
    }

    return {
      tipo: "pintura",
      titulo: "Pintura / Texturas Elastoméricas",
      inputs: { areaInterna, areaExterna, aplicarInterna, aplicarExterna, aplicarTextura },
      medidas: [
        { label: "Área Interna", valor: areaInterna, unidade: "m²" },
        { label: "Área Externa", valor: areaExterna, unidade: "m²" },
      ],
      grupos,
    };
  }

  // ============================================================
  // 3. PAINÉIS APARENTES - VERNIZ PU
  // ============================================================
  function calcVernizPU(inputs, params) {
    const qtdPaineis = Number(inputs.qtdPaineis) || 0;
    const alturaPainel = Number(inputs.alturaPainel) || 0;
    const larguraPainel = Number(inputs.larguraPainel) || 0;
    const areaEnvernizar = Number(inputs.areaEnvernizar) || 0;
    const opcaoGarantia = inputs.opcaoGarantia === "1ano" ? "1ano" : "5anos";

    // CORRIGIDO: planilha original usava a constante fixa 1,83 (3 x 0,61);
    // aqui a metragem é dinâmica, igual à Aba "Assentamento & Tratamento".
    const metragemPaineis = qtdPaineis * alturaPainel * larguraPainel;
    const metragemLinearJuntas = alturaPainel * qtdPaineis * 2;
    const pctJuntas = rendimento(params, "verniz_pct_juntas", 0.01);
    const m2Juntas = metragemLinearJuntas * pctJuntas;

    const unidadesPorCaixa = rendimento(params, "unidades_por_caixa_argamassa", 6);
    const margem = rendimento(params, "margem_seguranca_caixas", 0.4);

    const rendBioprotectJuntas = rendimento(params, "verniz_bioprotect_juntas", 54);
    const bioprotectJuntas = item("verniz_bioprotect_juntas", params, {
      fallbackNome: "Bioprotect - Verniz PU Base D'água (Balde 3,6 L)", unidade: "m² de junta por balde",
      quantidadeExata: rendBioprotectJuntas > 0 ? (m2Juntas / rendBioprotectJuntas) + margem : 0,
    });

    const rendSante = rendimento(params, "verniz_sante_pu40", 6);
    const sante = item("verniz_sante_pu40", params, {
      fallbackNome: "Sante PU 40 Biomassa (Sachê 800 g)", unidade: "m linear por sachê",
      quantidadeExata: rendSante > 0 ? (qtdPaineis * alturaPainel) / rendSante : 0,
    });

    const aplicador = item("verniz_aplicador_manual", params, {
      fallbackNome: "Aplicador Manual para Selante Biomassa", unidade: "unidade (item fixo)",
      quantidadeExata: qtdPaineis > 0 ? 1 : 0,
      jaArredondado: true,
    });

    const rendArgamassaVerniz = rendimento(params, "verniz_argamassa", 2);
    const embArgamassaVerniz = rendArgamassaVerniz > 0 ? qtdPaineis / rendArgamassaVerniz : 0;
    const argamassa = item("verniz_argamassa", params, {
      fallbackNome: "Argamassa Polimérica Biomassa (Bisnaga 3 kg)", unidade: "placas por bisnaga",
      quantidadeExata: embArgamassaVerniz,
    });
    argamassa.caixas = (embArgamassaVerniz / unidadesPorCaixa) + margem;
    argamassa.caixasComprar = Math.ceil(argamassa.caixas - 1e-9);

    const grupos = [
      { titulo: "Tratamento de Juntas de Painéis Aparentes", itens: [bioprotectJuntas] },
      { titulo: "Selante entre Juntas (Sachê 800g)", itens: [sante] },
      { titulo: "Acessórios de Aplicação", itens: [aplicador] },
      { titulo: "Assentamento de Painéis Aparentes", itens: [argamassa] },
    ];

    if (areaEnvernizar > 0) {
      const chaveOpcao = opcaoGarantia === "1ano" ? "verniz_acrilico_1ano" : "verniz_bioprotect_superficie_5anos";
      const nomeFallback = opcaoGarantia === "1ano" ? "Bioprotect - Verniz Acrílico (Balde 3,6 L)" : "Bioprotect - Verniz PU Base D'água (Balde 3,6 L)";
      const rendSuperficie = rendimento(params, chaveOpcao, 36);
      const superficie = item(chaveOpcao, params, {
        fallbackNome: nomeFallback, unidade: "m² por balde",
        quantidadeExata: rendSuperficie > 0 ? areaEnvernizar / rendSuperficie : 0,
      });
      superficie.garantia = opcaoGarantia === "1ano" ? "1 ano de garantia" : "5 anos de garantia";
      grupos.push({ titulo: "Aplicação de Verniz em Toda a Superfície", itens: [superficie] });
    }

    return {
      tipo: "verniz_pu",
      titulo: "Painéis Aparentes - Verniz PU",
      inputs: { qtdPaineis, alturaPainel, larguraPainel, areaEnvernizar, opcaoGarantia },
      medidas: [
        { label: "Metragem de painéis", valor: metragemPaineis, unidade: "m²" },
        { label: "Metragem linear de juntas", valor: metragemLinearJuntas, unidade: "m" },
        { label: "M² de juntas", valor: m2Juntas, unidade: "m²" },
        { label: "Área a envernizar", valor: areaEnvernizar, unidade: "m²" },
      ],
      grupos,
    };
  }

  const TIPOS = {
    assentamento: { label: "Assentamento & Tratamento de Juntas", calc: calcAssentamento },
    pintura: { label: "Pintura / Texturas Elastoméricas", calc: calcPintura },
    verniz_pu: { label: "Painéis Aparentes - Verniz PU", calc: calcVernizPU },
  };

  window.Calculos = { TIPOS, calcAssentamento, calcPintura, calcVernizPU };
})();
