# Calculadora Biomassa & Lightwall

Aplicativo web para cálculo de quantitativo de materiais das linhas **Biomassa & Lightwall**
(painéis, tratamento de juntas, pintura/texturas e verniz PU), convertido a partir da planilha
`Calculadora BIOMASSA & LIGHTWALL - Leroy Merlin.xlsx`.

## Como abrir (uso local, sem instalar nada)

1. Dê duplo clique em `index.html` (abre no seu navegador padrão), **ou**
2. Clique com o botão direito → Abrir com → Chrome/Edge.

Não é necessário instalar Node.js, servidor ou qualquer dependência. O app roda 100% no
navegador e guarda os dados localmente no próprio navegador (IndexedDB) — ou seja, os
orçamentos salvos ficam disponíveis mesmo depois de fechar e abrir o navegador de novo,
**no mesmo computador e no mesmo navegador** em que foram criados.

> Se seu navegador bloquear IndexedDB para arquivos abertos via duplo clique (raro, alguns
> navegadores restringem armazenamento em `file://`), sirva a pasta com qualquer servidor
> estático — por exemplo `npx serve .` (se tiver Node.js) — e acesse via `http://localhost`.

## Estrutura do projeto

```
calculadora-biomassa-app/
├─ index.html          # shell da aplicação (layout, sidebar, roteador)
├─ css/
│  └─ style.css        # design system completo (cores, componentes, responsivo)
└─ js/
   ├─ utils.js          # helpers: formatação, DOM, toast, modal, confirmação
   ├─ db.js             # camada de dados — IndexedDB (substitui a planilha)
   ├─ calculos.js        # motor de cálculo — todas as fórmulas da planilha
   ├─ charts.js          # gráficos SVG do dashboard (sem dependências externas)
   ├─ views.js           # páginas: Dashboard, Calculadora, Orçamentos, Parâmetros
   └─ router.js          # roteador via hash (#/dashboard, #/orcamentos, ...)
```

Nenhuma etapa de build é necessária — são arquivos HTML/CSS/JS puros, sem frameworks,
sem `npm install`, sem bundler.

## Estrutura de dados (IndexedDB)

Como pedido, o app **não depende de planilha como banco de dados**. Os dados vivem em duas
"tabelas" (object stores) no IndexedDB do navegador:

- **`orcamentos`** — cada orçamento salvo: título, cliente, responsável, status, observações,
  datas, e a lista de cálculos incluídos. Cada cálculo grava tanto os **inputs** informados
  quanto um **snapshot dos resultados** no momento do cálculo — assim, se você editar um
  parâmetro técnico depois, orçamentos antigos **não mudam retroativamente**.
- **`parametros`** — os rendimentos/regras técnicas usadas nas fórmulas (equivalentes às
  colunas "Rendimento" da planilha original). Totalmente editável pela tela
  **Parâmetros Técnicos**, com opção de restaurar os valores originais da planilha.

## Funcionalidades implementadas

- **Dashboard**: indicadores (total de orçamentos, em aberto/execução, m² já quantificados,
  acabamento mais usado), gráfico de distribuição por tipo de cálculo, gráfico por status,
  lista dos últimos orçamentos.
- **Calculadora**: formulário único com os 3 módulos de cálculo (cada um pode ser
  ativado/desativado independentemente, permitindo combinar, por exemplo, Assentamento +
  Pintura no mesmo orçamento), validação em tempo real, resultado calculado instantaneamente
  a cada tecla, com quantidade exata e quantidade recomendada para compra (arredondada para
  cima).
- **Orçamentos**: listagem com busca (título/cliente/responsável), filtro por tipo de cálculo
  e por status (combináveis), ordenação por coluna, exportação para CSV (abre no Excel),
  exclusão com modal de confirmação.
- **Detalhe do Orçamento**: visualização completa de todos os cálculos e materiais, exportar
  CSV, imprimir/exportar PDF (via impressão do navegador — Ctrl+P → Salvar como PDF).
- **Parâmetros Técnicos**: CRUD completo dos rendimentos usados nas fórmulas — editar, criar
  novo parâmetro, excluir (com confirmação), restaurar valores originais da planilha.
- **Responsivo**: menu lateral recolhível em telas de celular/tablet, cards e tabelas se
  adaptam à largura da tela, tabelas com rolagem horizontal quando necessário.

## Regras de negócio convertidas (fórmulas da planilha)

Todas as fórmulas das 3 abas foram implementadas em `js/calculos.js`, com **duas correções
aprovadas** em relação à planilha original:

1. **Pintura/Texturas — "BioRevest Pedras Naturais"**: a planilha original dividia pela
   célula `C9` (vazia), sempre retornando 0. O app usa a área Externa (`C8`), igual às
   demais linhas do mesmo grupo.
2. **Metragem de painéis (Assentamento e Verniz PU)**: a planilha usava a constante fixa
   `1,83` (3 × 0,61) em vez de recalcular com a altura/largura reais informadas. O app
   calcula dinamicamente (`quantidade × altura × largura`), refletindo corretamente qualquer
   painel de tamanho diferente do padrão.

Todas as demais fórmulas (percentuais de tratamento de juntas, rendimentos de cada produto,
regras de arredondamento ROUND/ROUNDUP, conversão de embalagens em caixas, opções de garantia
do verniz PU etc.) foram mantidas fielmente — ver comentários em `js/calculos.js` e `js/db.js`
para o mapeamento completo de cada constante.

### Itens da planilha que não foram implementados (por decisão do usuário)

- Colunas de preço (R$): estavam vazias na planilha original em todas as abas; por decisão,
  o app calcula apenas quantitativo de materiais, sem custos.
- Login/usuários/permissões: não implementado nesta primeira versão (uso interno, sem
  necessidade de autenticação por ora).

## Limitações conhecidas / ambiente de teste

- Testado nesta máquina via automação de navegador (sem captura visual de tela disponível no
  momento do desenvolvimento) — todo o fluxo funcional foi validado por inspeção de DOM/estado
  (cálculos, salvar/editar/excluir, filtros, exportação, CRUD de parâmetros, persistência após
  reload). Recomenda-se uma conferência visual rápida ao abrir por conta própria, especialmente
  em celular.
- Os dados ficam no navegador local (IndexedDB) — **não são compartilhados entre
  computadores ou usuários diferentes**. Veja "Publicar para múltiplos usuários" abaixo.

## Publicar para múltiplos usuários (multiusuário, na internet)

A versão atual guarda dados no navegador de cada pessoa (sem servidor). Para que várias
pessoas acessem os **mesmos** orçamentos ao mesmo tempo pela internet, é necessário migrar
para uma arquitetura com backend + banco de dados compartilhado. Caminho recomendado, quando
houver Node.js disponível:

1. **Backend**: Next.js (API Routes ou Server Actions) ou um serviço simples em Express.
2. **Banco de dados**: PostgreSQL (ex.: Neon, Supabase, Railway) via Prisma ORM — o schema já
   está desenhado neste app (`orcamentos` e `parametros`), bastando traduzir as mesmas
   entidades de IndexedDB para tabelas SQL.
3. **Login** (se necessário no futuro): NextAuth.js ou Auth.js, com 2 perfis (administrador e
   usuário comum) controlando quem pode editar Parâmetros Técnicos.
4. **Deploy**: Vercel, Railway ou qualquer host com suporte a Node.js.

Como esta máquina não possui Node.js instalado, essa migração não foi feita nesta entrega —
mas a lógica de cálculo (`js/calculos.js`) e o modelo de dados já estão isolados e prontos
para serem reaproveitados quase sem alteração num backend real.

## Melhorias futuras sugeridas

- Cadastro de preços por produto, com cálculo automático do valor total do orçamento.
- Geração de PDF com identidade visual da empresa (logo, cabeçalho) em vez do PDF de
  impressão genérico do navegador.
- Sincronização entre dispositivos (exigiria o backend descrito acima).
- Histórico de alterações de parâmetros técnicos (auditoria de quem mudou o quê e quando).
- Gráfico de evolução de orçamentos por período (linha do tempo mensal).
