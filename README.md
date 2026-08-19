# Calculadora Biomassa & Lightwall

Aplicativo web para cálculo de quantitativo de materiais das linhas **Biomassa & Lightwall**
(painéis, tratamento de juntas, pintura/texturas e verniz PU), com **login e controle de
acesso por perfil de usuário** (Master / Colaborador).

> Esta é a versão 2 do projeto. A versão 1 era um app estático sem login, com dados salvos no
> navegador de cada pessoa. Esta versão adiciona um backend real (Node.js + Express) e um
> banco de dados compartilhado (PostgreSQL), necessários para que o gestor (Master) veja os
> orçamentos de todos os colaboradores e para que as permissões sejam aplicadas de forma segura
> no servidor — não apenas na tela.

## Arquitetura

```
calculadora-biomassa-app/
├─ index.html, css/, js/        # Frontend (SPA com roteamento por hash) — inalterado na
│                                  aparência; agora consome uma API em vez do IndexedDB.
│  ├─ js/db.js                    Cliente HTTP da API (login, orçamentos, parâmetros, usuários)
│  ├─ js/calculos.js              Motor de cálculo — SEM ALTERAÇÃO nenhuma nesta atualização
│  ├─ js/views.js                 Páginas: login, dashboard, calculadora, orçamentos, parâmetros, usuários
│  └─ js/router.js                Roteador com guarda de autenticação e de perfil
└─ server/                      # Backend Node.js + Express (novo)
   ├─ index.js                    Servidor HTTP: API + arquivos estáticos
   ├─ db.js                       Conexão PostgreSQL, migrações e seed inicial
   ├─ auth.js                     Login (JWT em cookie httpOnly), hashing de senha, middlewares
   └─ routes/
      ├─ auth.js                  POST /login, POST /logout, GET /me
      ├─ orcamentos.js             CRUD de orçamentos com controle de acesso por perfil
      ├─ parametros.js             CRUD dos rendimentos técnicos (leitura livre, escrita só Master)
      └─ usuarios.js                CRUD de usuários (somente Master)
```

**O que foi preservado sem alteração:** o motor de cálculo (`js/calculos.js`), os gráficos
(`js/charts.js`), os helpers de UI (`js/utils.js`) e todo o design visual (`css/style.css`,
paleta de cores, layout, sidebar, cards, tabelas). As fórmulas e a lógica de negócio das 3
abas da planilha continuam exatamente as mesmas.

## Perfis de acesso

| | **Master** (gestor) | **Básico** (colaborador) |
|---|---|---|
| Dashboard geral | ✅ | ❌ (redirecionado para "Meus Orçamentos") |
| Ver orçamentos | Todos, de todos os colaboradores | Somente os que ele mesmo criou |
| Criar orçamento | ✅ | ✅ |
| Editar/excluir orçamento | Qualquer um | Somente os próprios |
| Parâmetros Técnicos | Ver e editar | Sem acesso (menu oculto) |
| Usuários (cadastro) | Ver, criar, editar, ativar/desativar | Sem acesso |

**A regra é aplicada no servidor, não só na tela.** Cada rota da API (`server/routes/*.js`)
confere o usuário autenticado (via cookie de sessão) e o perfil dele antes de responder:
- `GET /api/orcamentos` — Master recebe todos os registros; Colaborador recebe **apenas** os
  que têm `created_by_id` igual ao próprio ID (filtrado na consulta SQL, não no frontend).
- `GET/PUT/DELETE /api/orcamentos/:id` — se o orçamento não pertence ao usuário e ele não é
  Master, a API responde **403 (Forbidden)** — inclusive se o ID for digitado direto na URL.
- Escrita em `/api/parametros` e qualquer rota em `/api/usuarios` exigem perfil Master
  (`requireRole("master")`); um Colaborador que tentar chamar essas rotas diretamente recebe 403.
- O campo "responsável" de um orçamento é sempre preenchido pelo servidor com os dados de
  quem está logado (`req.user`) — nunca é aceito um valor enviado pelo cliente.

## Fluxo de novo orçamento

1. Colaborador clica em **Novo Orçamento**.
2. O sistema exige **Nome, Telefone e E-mail** do cliente antes de liberar o restante do
   formulário (tela "Dados do Cliente").
3. Ele monta o orçamento normalmente (Assentamento, Pintura e/ou Verniz PU).
4. Ao salvar, o backend grava: ID e nome do usuário, perfil, data/hora de criação, cliente
   vinculado e status — tudo isso fica preso ao registro para sempre.
5. **Nenhuma ação extra é necessária**: como o Master vê todos os registros da tabela, o
   orçamento aparece para ele imediatamente após salvar.

## Status do orçamento

`Rascunho → Em elaboração → Enviado → Em negociação → Aprovado / Recusado / Cancelado`

## Configuração para rodar (Railway)

O app precisa de três coisas configuradas no Railway antes de funcionar:

### 1. Banco de dados PostgreSQL
No seu projeto Railway: **New** → **Database** → **Add PostgreSQL**. O Railway injeta
automaticamente a variável `DATABASE_URL` no serviço — não precisa copiar nada manualmente
(desde que o banco esteja no mesmo projeto).

### 2. Variáveis de ambiente
Em **Settings → Variables** do serviço da aplicação, adicione:

| Variável | Valor |
|---|---|
| `JWT_SECRET` | uma string aleatória longa e secreta (gerada para este projeto — ver mensagem separada) |
| `MASTER_EMAIL` | o e-mail do primeiro usuário Master (ex.: seu e-mail) |
| `MASTER_PASSWORD` | a senha inicial desse usuário Master (troque depois de logar, se quiser) |

Essas duas últimas só têm efeito **uma vez**: na primeira inicialização, se a tabela de
usuários estiver vazia, o servidor cria automaticamente esse usuário Master. Depois disso,
todos os demais usuários (Master ou Colaborador) são criados pela tela **Usuários**, dentro
do próprio app.

### 3. Deploy
Basta um `git push` para o branch `main` — o Railway reconstrói e reinicia o serviço
automaticamente (ele agora executa `node server/index.js`, em vez do antigo servidor estático).

## Primeiro acesso

1. Acesse a URL do app — você verá a tela de login.
2. Entre com o `MASTER_EMAIL` / `MASTER_PASSWORD` configurados no passo anterior.
3. Vá em **Usuários** → **Novo Usuário** para cadastrar os colaboradores (perfil "Básico").
4. Cada colaborador recebe o e-mail/senha e faz login para começar a criar orçamentos.

## Rodar localmente (opcional, requer Node.js instalado)

```bash
npm install
# defina DATABASE_URL, JWT_SECRET, MASTER_EMAIL, MASTER_PASSWORD no seu ambiente
npm start
```

## Itens do pedido que não têm dado correspondente no sistema hoje

- **"Valor do orçamento"**: o sistema calcula apenas quantitativo de materiais (por decisão
  tomada no início do projeto) — não existe preço/valor monetário associado a um orçamento.
  As telas de Master e de listagem foram montadas sem essa coluna. Se depois quiser adicionar
  um cadastro de preços por produto, dá para calcular o valor total automaticamente a partir
  dos itens já quantificados.
- **Regra de "avançar" com botão bloqueado**: em vez de um botão desabilitado, a tela de
  "Dados do Cliente" valida ao clicar em Continuar e mostra a mensagem de erro pedida
  ("Para iniciar o orçamento, preencha Nome, Telefone e E-mail do cliente.") — funcionalmente
  equivalente, mas com melhor feedback de qual campo falta.

## Melhorias futuras sugeridas

- Adicionar cadastro de preços por produto e cálculo automático do valor total do orçamento.
- Log de auditoria (quem alterou o quê e quando) além do `updated_at` atual.
- Recuperação de senha por e-mail (hoje, só o Master pode redefinir a senha de alguém pela
  tela de Usuários).
- Exportação de PDF com identidade visual da empresa, em vez do PDF de impressão do navegador.
