# 🎫 Bot de Tickets para Discord

Bot de tickets em JavaScript para Discord, com interface construída inteiramente em **Discord Components V2** (não usa embeds nem `content` tradicionais). Permite configurar, via `/ticket_painel`, um painel público onde os membros escolhem o motivo do atendimento e o bot cria um canal de texto privado para cada ticket.

> Esta é a **primeira versão funcional**. Transcript em site próprio, fechamento/exclusão automática de tickets e geração de histórico ainda **não estão implementados** — o campo de domínio já existe apenas como preparação para essa etapa futura.

## Sumário

- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Configuração do Developer Portal](#configuração-do-developer-portal)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Registro dos comandos](#registro-dos-comandos)
- [Executando o bot](#executando-o-bot)
- [Uso do `/ticket_painel`](#uso-do-ticket_painel)
- [Como funciona a abertura de um ticket](#como-funciona-a-abertura-de-um-ticket)
- [Persistência de dados e backup](#persistência-de-dados-e-backup)
- [Hospedagem (processo contínuo)](#hospedagem-processo-contínuo)
- [Arquitetura do projeto](#arquitetura-do-projeto)
- [Testes automatizados](#testes-automatizados)
- [Checklist de validação manual no Discord](#checklist-de-validação-manual-no-discord)
- [Limitações desta versão](#limitações-desta-versão)

## Requisitos

- **Node.js 22.5 ou superior** (o projeto usa o módulo nativo `node:sqlite`, disponível a partir dessa versão, então **não há dependências nativas para compilar**).
- Uma aplicação/bot criada no [Discord Developer Portal](https://discord.com/developers/applications).

## Instalação

```bash
git clone https://github.com/zeusx7882/bot.git
cd bot
npm install
cp .env.example .env
# edite o .env com o token e o client id da sua aplicação
```

## Configuração do Developer Portal

1. Crie uma aplicação em <https://discord.com/developers/applications> e adicione um Bot.
2. Copie o **Token** do bot para `DISCORD_TOKEN` e o **Application ID** para `DISCORD_CLIENT_ID` no `.env`.
3. **Nenhuma intent privilegiada é necessária nesta versão** — o bot não lê o Message Content Intent nem o Server Members Intent, pois não processa histórico de mensagens (o site de transcript é uma etapa futura) e busca informações de membros individualmente sob demanda via API.
4. Em **OAuth2 → URL Generator**, marque os scopes `bot` e `applications.commands`.
5. Permissões mínimas recomendadas para o convite (podem ser marcadas na mesma tela):
   - `View Channels`
   - `Send Messages`
   - `Manage Channels` (necessária para criar os canais de ticket dentro da categoria configurada)
   - `Read Message History`
   - `Attach Files` (opcional, usado nas permissões concedidas ao canal do ticket)
6. Use a URL gerada para convidar o bot ao seu servidor.

> ⚠️ **Atenção:** administradores do Discord (com permissão "Administrador" no servidor) sempre podem visualizar canais privados, mesmo que o overwrite do canal negue `ViewChannel` para `@everyone` — essa é uma característica do próprio Discord e não pode ser desativada pelo bot.

## Variáveis de ambiente

Veja `.env.example`:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DISCORD_TOKEN` | sim | Token do bot. **Nunca compartilhe ou cole em conversas.** |
| `DISCORD_CLIENT_ID` | sim | Application ID, usado para registrar os comandos de barra. |
| `DISCORD_GUILD_ID` | não | Se definido, os comandos são registrados apenas nessa guild (propagação instantânea, ideal para desenvolvimento). Se vazio/ausente, os comandos são registrados **globalmente** (pode levar até 1 hora para propagar). |
| `DATA_DIR` | não (padrão `./data`) | Diretório onde o banco SQLite é gravado. Criado automaticamente se não existir. |

## Registro dos comandos

```bash
npm run register:commands
```

Rode novamente sempre que adicionar/alterar comandos de barra.

## Executando o bot

```bash
npm start
```

## Uso do `/ticket_painel`

O comando `/ticket_painel`:

- Só pode ser usado **dentro de um servidor** (guild-only).
- Só pode ser executado por membros com permissão de **Administrador**, revalidada em **toda** interação subsequente (botões, seletores e modais), não apenas no comando inicial.
- Abre uma **resposta efêmera** (visível só para quem executou o comando) com o painel de configuração em Components V2, permitindo:
  - Editar **título**, **descrição** e **imagem** (com opção de remover a imagem) do painel público.
  - Definir/remover o **domínio ou URL do site** (validado como http(s), sem credenciais na URL; usado apenas como preparação para uma função futura — nenhuma requisição é feita a esse endereço).
  - **Adicionar, editar e remover** opções do menu seletor de tickets (nome, descrição opcional, emoji opcional), até **25 opções**, com validação de tamanho e mensagens de erro amigáveis.
  - Selecionar a **categoria** onde os canais de ticket serão criados, o **cargo da equipe de suporte** e o **canal de texto** onde o painel público será publicado (configuração global por servidor nesta versão).
  - **Pré-visualizar** o painel público antes de publicar.
  - **Publicar/atualizar** o painel público — só é permitido quando existe ao menos uma opção válida e a categoria, o cargo e o canal estiverem configurados.

Cada administrador que abrir `/ticket_painel` recebe sua própria mensagem efêmera; edições em campos diferentes por administradores diferentes não se sobrescrevem, e cada sessão só enxerga/edita a configuração do próprio servidor.

## Como funciona a abertura de um ticket

1. O usuário seleciona uma opção no menu do painel público.
2. O bot confirma que a configuração (categoria, cargo, opção) ainda é válida.
3. É criado um canal de texto privado dentro da categoria configurada, com overwrites de permissão **explícitos e mínimos** (o canal **não herda** overwrites da categoria automaticamente):
   - `@everyone`: `ViewChannel` negado.
   - Autor do ticket: `ViewChannel`, `SendMessages`, `ReadMessageHistory`, `AttachFiles`.
   - Cargo de suporte: mesmas permissões do autor.
   - O próprio bot: permissões mínimas para operar o canal.
4. O bot envia uma mensagem inicial (Components V2) com os dados do ticket, mencionando **apenas** o autor e o cargo de suporte configurado (`allowedMentions` explícito — nunca `@everyone`/`@here` ou menções arbitrárias).
5. Cliques concorrentes ou tentativas repetidas do mesmo usuário **não criam tickets duplicados**: existe uma trava (`lock`) transacional por servidor+usuário no banco de dados.
6. Se a criação do canal ou o envio da mensagem falhar, a trava é liberada e qualquer canal criado é removido automaticamente — o usuário pode tentar novamente sem ficar bloqueado e sem deixar canais órfãos.
7. Se o canal de um ticket em aberto for apagado manualmente, o próximo clique do mesmo usuário detecta isso e permite abrir um novo ticket.

## Persistência de dados e backup

- Os dados (configuração por servidor, opções do menu e metadados de tickets) são gravados em **SQLite** local, usando o módulo nativo `node:sqlite` do Node.js — sem dependências nativas externas para compilar.
- O arquivo do banco fica em `DATA_DIR/ticket-bot.sqlite` (padrão: `./data/ticket-bot.sqlite`). Esse diretório é ignorado pelo Git (`.gitignore`) e **deve ser tratado como um volume persistente** ao hospedar o bot (ex.: volume Docker, disco persistente do provedor) — se ele for apagado, a configuração e os registros de tickets em aberto se perdem.
- Para backup, basta copiar o arquivo `.sqlite` (idealmente com o processo do bot parado, ou usando uma cópia consistente/instantâneo do volume).

## Hospedagem (processo contínuo)

O bot precisa rodar como um **processo de longa duração** (ele mantém uma conexão via WebSocket com o Discord). Algumas opções:

- Um VPS/serviço com suporte a Node.js, usando um gerenciador de processos como [`pm2`](https://pm2.keymetrics.io/) ou um serviço systemd, com `npm start`.
- Um container Docker com o volume de `DATA_DIR` persistido.
- Qualquer provedor com suporte a "workers"/processos em segundo plano contínuos (não serverless/functions de execução curta, pois a conexão com o Discord precisa ficar sempre ativa).

## Arquitetura do projeto

```
src/
  config/env.js              # Carrega e valida variáveis de ambiente
  storage/                   # Camada de persistência (SQLite via node:sqlite)
    database.js               # Abertura do banco + migrações idempotentes
    guildConfigRepository.js   # CRUD da configuração por guild (updates por campo)
    panelOptionRepository.js   # CRUD das opções do menu (limite de 25)
    ticketRepository.js        # Registro de tickets + trava anti-duplicidade
  domain/validation.js       # Validações de negócio (strings, URL, emoji)
  ui/                         # Construção dos payloads Components V2 e modais
    customId.js                # Codificação/decodificação de customId persistente
    configPanel.js              # Painel administrativo (efêmero)
    publicPanel.js               # Painel público de abertura de tickets
    ticketMessage.js             # Mensagem inicial do canal do ticket
    modals.js                     # Modais de edição
  services/                  # Regras de negócio
    configService.js           # Validação + persistência de configuração
    ticketService.js            # Criação de canal, overwrites, dedupe, rollback
    panelPublisher.js           # Publicação/atualização do painel público
  commands/ticketPainel.js   # Definição e execução do comando `/ticket_painel`
  interactions/               # Roteamento global de interações (sobrevive a reinícios)
    router.js                   # Ponto único de entrada de toda interação
    configHandlers.js            # Botões/seletores/modais do painel administrativo
    publicPanelHandlers.js        # Seleção no painel público → abertura de ticket
  utils/
    permissions.js             # Revalidação de guild + administrador em toda interação
    logger.js                  # Log simples, nunca imprime tokens
  index.js                    # Bootstrap do client Discord
scripts/registerCommands.js  # Registro dos comandos de barra (guild/global)
tests/                       # Testes automatizados (node --test), sem token real
```

Toda interação (botão, seletor ou modal) é roteada por um **customId persistente** (formato `tp:<escopo>:<ação>:<guildId>:<argumentos...>`), nunca por *collectors* em memória — por isso o painel continua funcionando normalmente após reinícios do bot.

## Testes automatizados

```bash
npm test
```

Os testes usam apenas o executor nativo (`node --test`) e **mocks** — nenhum token real ou conexão com o Discord é necessária. Cobrem:

- ✅ Persistência e isolamento de configuração por guild, inclusive após reabrir o banco (simulando reinício do processo).
- ✅ Que uma atualização de um campo não sobrescreve edições concorrentes de outro campo/administrador.
- ✅ Validação de título/descrição/opções/emoji/URL de imagem/domínio (rejeição de credenciais e protocolos inválidos).
- ✅ Limite de 25 opções por servidor.
- ✅ Autorização: revalidação de guild-only, administrador "fresco" e correspondência do guildId do customId com o da interação (evita vazamento entre servidores) em botões, seletores e no roteador global.
- ✅ Payloads Components V2: presença da flag `IsComponentsV2`, ausência de `content`/`embeds`, `allowedMentions` explícito (sem `@everyone`/`@here`).
- ✅ Overwrites de permissão do canal de ticket (nega `@everyone`, concede ao autor/cargo/bot, não herda da categoria).
- ✅ Prevenção de tickets duplicados em cliques concorrentes e recuperação após falha de criação/envio (sem canais órfãos nem registros travados) e após exclusão manual do canal.

**O que depende de teste manual no Discord** (não é possível automatizar sem um token/servidor reais — veja o checklist abaixo): publicação do painel em um canal real, aparência visual dos Components V2 no cliente Discord, permissões efetivas de convite/OAuth2, e o comportamento do bot após reinício em produção.

## Checklist de validação manual no Discord

Após configurar `DISCORD_TOKEN`/`DISCORD_CLIENT_ID` reais e convidar o bot a um servidor de testes:

- [ ] `npm run register:commands` registra `/ticket_painel` sem erros.
- [ ] `/ticket_painel` só aparece/funciona para administradores e dentro do servidor.
- [ ] Editar título, descrição e imagem (definir e remover) refletem corretamente no painel.
- [ ] Definir e remover o domínio funciona e rejeita URLs inválidas/com credenciais.
- [ ] Adicionar, editar e remover opções do menu funciona, respeita o limite de 25 e valida campos vazios/inválidos.
- [ ] Selecionar categoria, cargo de suporte e canal de publicação persiste e aparece pré-selecionado ao reabrir o painel.
- [ ] "Pré-visualizar" mostra o painel público sem publicá-lo.
- [ ] "Publicar painel" fica desabilitado sem opções/categoria/cargo/canal, e envia a mensagem no canal escolhido quando tudo está configurado.
- [ ] Publicar novamente **atualiza** a mesma mensagem (não duplica) quando o canal não muda.
- [ ] Selecionar uma opção no painel público cria um canal privado visível apenas para o autor, o cargo de suporte e administradores.
- [ ] A mensagem inicial do ticket menciona apenas o autor e o cargo de suporte (sem @everyone/@here).
- [ ] Clicar duas vezes rapidamente (ou por dois usuários diferentes) não cria tickets duplicados para o mesmo usuário.
- [ ] Apagar manualmente o canal de um ticket permite ao usuário abrir um novo depois.
- [ ] Reiniciar o processo do bot e clicar em um botão/seletor de uma mensagem antiga continua funcionando (sem depender de o bot ter ficado rodando o tempo todo).
- [ ] Apagar uma opção do menu e depois abrir o painel público antigo mostra mensagem de erro amigável ao tentar usá-la.

## Limitações desta versão

- Não há **transcript**, geração de HTML ou publicação em site — o campo de domínio é apenas preparação para essa função futura.
- Não há **fechamento automático/destrutivo** de tickets nem exclusão programada de canais.
- A configuração de categoria/cargo/canal é **global por servidor** (não há configuração individual por opção do menu nesta versão).
