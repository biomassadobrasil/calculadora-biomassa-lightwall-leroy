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
      ├─ parametros.js             CRUD dos rendimentos técnicos (leitura livre, escrita só Master) + auditoria
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
| Parâmetros Técnicos | Ver, criar, editar, excluir, restaurar padrões | Somente visualizar (campos e ações de edição não aparecem) |
| Histórico de Alterações (Parâmetros) | Ver (quem, o quê, antes/depois, quando) | Sem acesso |
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

## Auditoria dos Parâmetros Técnicos

Toda inclusão, alteração ou exclusão de um parâmetro técnico grava automaticamente um registro
permanente na tabela `parametros_auditoria` — o usuário nunca precisa (nem consegue) preencher
isso manualmente:

- Cada alteração de um parâmetro existente gera **uma linha por campo realmente modificado**
  (ex.: se você mudar só o "Rendimento", só o Rendimento aparece no histórico — com o valor de
  antes e o de depois). Se nada mudou de fato, nenhuma linha é criada.
- Inclusão e exclusão geram um registro com o retrato completo do parâmetro (antes/depois).
- "Restaurar padrões da planilha" também é auditado: uma exclusão para cada parâmetro antigo e
  uma inclusão para cada valor padrão restaurado.
- Cada linha traz: ID e nome do usuário, perfil, data/hora exata, produto/regra afetado, campo,
  valor anterior e novo valor, e o tipo de ação (Inclusão / Alteração / Exclusão).
- A gravação do parâmetro e do registro de auditoria acontecem **na mesma transação de banco**
  (`server/db.js: withTransaction`) — ou os dois são salvos juntos, ou a alteração inteira é
  desfeita. Nunca existe uma alteração "sem rastro".
- **Não existe nenhuma rota de API para editar ou apagar registros de auditoria** — nem para
  Master, nem para ninguém. É uma tabela somente-inserção; a única forma de "limpar" seria
  acessando o banco de dados diretamente, fora da aplicação.
- Tela **Histórico de Alterações** (dentro de Parâmetros Técnicos, acesso exclusivo Master):
  lista tudo do mais recente para o mais antigo, com busca por usuário/produto/campo e filtro
  por tipo de ação.

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
| `RESEND_API_KEY` | chave de API do [resend.com](https://resend.com) (conta gratuita), usada para enviar os e-mails de convite/ativação de conta |
| `RESEND_FROM` *(opcional)* | remetente dos e-mails, formato `Nome <email>`. Se não definir, usa `Calculadora Biomassa & Lightwall <onboarding@resend.dev>` (domínio de testes do Resend — funciona, mas para produção considere verificar `biomassadobrasil.com.br` no Resend e usar um endereço próprio) |

`MASTER_EMAIL`/`MASTER_PASSWORD` só têm efeito **uma vez**: na primeira inicialização, se a
tabela de usuários estiver vazia, o servidor cria automaticamente esse usuário Master (já
ativo, sem precisar de convite por e-mail). Todos os demais usuários são criados pela tela
**Usuários**, por convite (ver seção abaixo).

### 3. Deploy
Basta um `git push` para o branch `main` — o Railway reconstrói e reinicia o serviço
automaticamente (ele agora executa `node server/index.js`, em vez do antigo servidor estático).

## Primeiro acesso

1. Acesse a URL do app — você verá a tela de login.
2. Entre com o `MASTER_EMAIL` / `MASTER_PASSWORD` configurados no passo anterior.
3. Vá em **Usuários** → **Novo Usuário** para cadastrar os colaboradores (perfil "Básico").
4. Cada colaborador recebe um e-mail de ativação e cria a própria senha (ver seção abaixo) —
   o Master nunca define nem vê a senha de ninguém.

## Cadastro de usuários por convite (ativação por e-mail)

Ao criar um usuário na tela **Usuários**, o Master informa só **nome, e-mail e perfil** —
nenhuma senha. O fluxo é:

1. O sistema cria o usuário com status **"Pendente de ativação"** e gera um token de
   ativação aleatório (32 bytes). Só a **hash SHA-256** do token é salva no banco
   (`activation_tokens.token_hash`) — o token em si só existe no e-mail enviado, exatamente
   como uma senha nunca é guardada em texto puro.
2. Um e-mail é enviado (via Resend) para o endereço cadastrado, com um botão **"Criar minha
   senha / Ativar minha conta"** apontando para `.../#/ativar-conta/<token>`.
3. O link é válido por **48 horas** e só pode ser usado **uma vez** — ao criar a senha, o
   token é marcado como usado (`used_at`) e não funciona novamente.
4. Na página de ativação, o usuário cria e confirma a senha (mínimo 6 caracteres, com botão
   de mostrar/ocultar 👁️ nos dois campos) e já é autenticado automaticamente ao concluir.
5. Se o link expirar, a própria página de ativação oferece **"Solicitar novo link"** —
   basta informar o e-mail; a resposta é sempre a mesma frase, tenha o e-mail conta ou não,
   para não revelar quais e-mails estão cadastrados.
6. Na lista de **Usuários**, o Master pode clicar em **"Reenviar convite"** para qualquer
   usuário "Pendente de ativação" — isso invalida o link anterior e gera um novo.
7. Se o envio do e-mail falhar (ex.: Resend fora do ar), o usuário **ainda é criado** com
   status pendente — o Master só precisa usar "Reenviar convite" depois; a criação do
   registro no banco nunca depende do envio do e-mail ter funcionado.

**Status possíveis:** Pendente de ativação (criado, sem senha) → Ativo (senha criada, pode
logar) → Inativo (desativado pelo Master; qualquer convite pendente é invalidado no mesmo
momento). O Master pode alternar entre Ativo/Inativo pela lista de Usuários; "Pendente" só
é alcançado na criação e só é encerrado pela própria ativação.

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
