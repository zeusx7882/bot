# 🎫 Bot de Tickets para Discord

Bot de tickets em JavaScript (Node.js) com **Discord Components V2** e persistência em SQLite.

## Recursos

- `/ticket_painel` para configurar painel por servidor (isolamento por guild).
- Opções normais de ticket (até 25) com categoria/cargo de suporte.
- Opção especial configurável **Verificar e-mail** (habilitar/desabilitar, editar título/descrição e categoria exclusiva).
- Fluxo de verificação de e-mail via modal (`email:senha` ou `email:senha:extra`) com autenticação inicial sem fetch automático.
- Acesso IMAP TLS (Mailcow) com host/porta fixos via ambiente e allowlist de domínios.
- Ticket de e-mail privado (autor + bot), botões **Verificar**, **Mostrar conta para copiar**, **Apagar esta mensagem** (nos resultados) e **Encerrar**.
- Logs/transcripts HTML para tickets normais com canal configurável por guild e fechamento com confirmação.
- Tickets normais com botão **Avisar autor** (DM com fallback controlado no próprio ticket).
- Comando `/link_pagamento` (Sharpify) para administradores, com cartão público V2, cópia compatível com mobile e verificação de status sob demanda.
- Fechamento automático: 30s após encerrar manualmente e 6 minutos sem atividade válida do autor.
- Deadlines persistidas no SQLite para recuperar após reinício (sem estender prazo).

## Requisitos

- Node.js **22.23.2** (versão validada neste repositório) ou superior compatível com `node:sqlite` e `discord.js@14.27.0`.
- Bot no Discord com permissões mínimas de criar/gerenciar canais e enviar mensagens.

## Instalação inicial (hospedagem Node genérica)

```bash
git clone https://github.com/zeusx7882/bot.git
cd bot
npm ci
cp .env.example .env
```

Preencha o `.env` com seus dados reais (token, IDs e IMAP).  
**Nunca** commite `.env` nem segredos.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DISCORD_TOKEN` | sim | Token do bot |
| `DISCORD_CLIENT_ID` | sim | Application ID |
| `DISCORD_GUILD_ID` | não | Registro local de comandos em uma guild |
| `DATA_DIR` | não | Diretório persistente do SQLite (relativo à raiz do projeto ou absoluto). Padrão: `./data` |
| `MAILCOW_IMAP_HOST` | sim para recurso e-mail | Host IMAP do operador |
| `MAILCOW_IMAP_PORT` | não | Porta IMAPS (padrão 993) |
| `MAILCOW_ALLOWED_DOMAINS` | sim para recurso e-mail | Domínios permitidos separados por vírgula |
| `MESSAGE_CONTENT_INTENT` | não | `1` para habilitar captura de conteúdo em transcripts de tickets normais |
| `SHARPIFY_BASE_URL` | sim para `/link_pagamento` | Base da API (ex.: `https://api.sharpify.com.br`) |
| `SHARPIFY_CLIENT_ID` | sim para `/link_pagamento` | Credencial client id |
| `SHARPIFY_CLIENT_SECRET` | sim para `/link_pagamento` | Credencial client secret |
| `SHARPIFY_AMOUNT_UNIT` | sim para `/link_pagamento` | Unidade explícita: `major` ou `minor` |
| `SHARPIFY_MAJOR_DECIMALS` | quando `major` | Casas decimais aceitas no input |
| `SHARPIFY_CURRENCY` | sim para `/link_pagamento` | Moeda operacional configurada pelo operador |

> O recurso de e-mail falha em modo seguro (fail-closed) se `MAILCOW_IMAP_HOST`/`MAILCOW_ALLOWED_DOMAINS` não estiverem configurados.

## Segurança do recurso de e-mail

- O modal do Discord **não mascara senha**.
- Use senha de aplicativo (Mailcow) e apenas conta autorizada.
- Entrada suportada: `email:senha` ou `email:senha:extra`.
  - O primeiro token é e-mail.
  - O segundo token é senha.
  - O terceiro e demais tokens são descartados.
  - Senha contendo `:` **não é suportada** nesse formato.
- Credenciais ficam somente em memória durante a sessão ativa e são descartadas no encerramento/restart.
- Sem API administrativa Mailcow, sem bypass/master, sem host/porta vindos do usuário.

## Fluxo da opção "Verificar e-mail"

1. Usuário seleciona a opção no painel público.
2. Bot abre modal para credenciais.
3. Bot autentica no IMAP (TLS, timeout, domínio permitido) e só então cria o canal da categoria exclusiva.
4. Ticket inicia com “Conectado à caixa de correio com sucesso” e mini tutorial configurável por guild.
5. Primeiro botão **Verificar** busca o último e-mail atual da INBOX (inclusive pré-existente); cliques seguintes buscam novidades por `UID`/`UIDVALIDITY`.
6. Botão **Mostrar conta para copiar** responde **no chat** em mensagem efêmera visível só ao solicitante, no formato bruto `email:senha`, para facilitar copiar no celular.
7. Cada mensagem de resultado publicada por **Verificar** recebe botão **Apagar esta mensagem**; ele remove somente aquela mensagem do bot, nunca e-mails da INBOX.
8. Após reinício/perda da sessão, as credenciais não são reidratadas do banco; o usuário precisa se reautenticar via modal antes de verificar/copiar novamente.
9. Botão **Encerrar** agenda exclusão do canal em 30 segundos.
10. Sem atividade válida do autor por 6 minutos, encerra automaticamente.

> Administradores do Discord ainda podem acessar canais privados.

## Registro de comandos (separado do start)

```bash
npm run register:commands
```

- Com `DISCORD_GUILD_ID` definido: registra só na guild de desenvolvimento (rápido).
- Sem `DISCORD_GUILD_ID`: registra globalmente (propagação pode levar até ~1 hora).
- Para dois servidores, use registro global **ou** rode novamente mudando `DISCORD_GUILD_ID` para cada servidor.

## Start e validação local

```bash
npm start
# também funciona: node src/index.js (na raiz) ou node index.js (na pasta src)
npm run check
npm test
```

## Atualização segura

1. Pare o processo do bot.
2. Faça backup consistente do banco em `DATA_DIR` (ex.: `ticket-bot.sqlite`).
3. Atualize o código e rode `npm ci`.
4. Preserve seu `.env` e o volume/pasta de `DATA_DIR`.
5. Rode `npm run register:commands` apenas quando mudar comandos.
6. Inicie com `npm start`.
7. Em desligamento, envie `SIGINT`/`SIGTERM` para shutdown limpo.

> Este projeto **não** faz deploy automático nem inclui endpoint HTTP por padrão.  
> Ainda requer token/ambiente/IMAP reais para funcionar e os testes ao vivo em servidor Discord/IMAP não foram executados aqui.

## Checklist manual (Discord/Mobile/Mailcow)

- [ ] `/ticket_painel` abre e salva configuração isolada por guild.
- [ ] Opção "Verificar e-mail" habilita/desabilita e reflete no painel público.
- [ ] Categoria exclusiva de e-mail diferente da categoria normal.
- [ ] Modal aceita `email:senha:extra` e ignora token extra.
- [ ] Ticket de e-mail não inclui cargo de suporte normal.
- [ ] **Verificar** publica novo e-mail quando houver UID novo.
- [ ] **Mostrar para copiar** entrega texto efêmero selecionável no mobile.
- [ ] **Encerrar** remove canal em 30s.
- [ ] Inatividade de 6 minutos encerra ticket de e-mail.
- [ ] Reinício do bot mantém deadlines remanescentes.
## Tickets normais: fechamento, logs e transcripts

- A mensagem inicial do ticket normal inclui botão **Encerrar ticket**.
- A mensagem inicial do ticket normal também inclui **Avisar autor**.
- Encerramento permitido para autor do ticket, equipe de suporte configurada ou administrador.
- **Avisar autor** é permitido apenas para equipe de suporte configurada ou administrador.
- O aviso tenta enviar DM `Seu ticket foi respondido` com link do canal; se a DM falhar, o bot faz fallback com uma única menção controlada ao dono dentro do ticket.
- Há cooldown de 60s por ticket para evitar spam no botão de aviso.
- Canal de logs é configurável em **/ticket_painel → Tickets normais** (opcional).
- Quando logs estão ativos, o bot arquiva transcript HTML estático antes de excluir o canal.
- Tickets de e-mail ficam fora de logs/transcripts.
- Sem `MESSAGE_CONTENT_INTENT=1` + intent habilitado no Developer Portal, transcripts com logs falham em modo claro (fail-closed).

## `/link_pagamento` (Sharpify)

- Comando guild-only e administrador por padrão.
- Publica cartão Components V2 **não efêmero** no canal com status/método/valor.
- Quando a API retorna código PIX, o cartão inclui **Copiar código**; quando retorna URL `https`, inclui **Copiar link** e **Abrir pagamento**.
- Os botões de cópia respondem em mensagem efêmera simples no chat, sem clipboard nativo e sem misturar Components V2 com o texto copiável.
- Botão **Abrir pagamento** aparece apenas com URL `https` retornada pela API.
- Botão **Verificar pagamento** consulta endpoint GET, faz ack antes da rede e atualiza o cartão; não marca pago por clique.
- Por ambiguidade de unidade monetária em docs indisponíveis no ambiente, a configuração explícita de unidade/moeda é obrigatória (fail-closed).

## Atualizando sem perder `.env` e `data`

1. Pare o processo atual.
2. Substitua apenas os arquivos do código/`package*.json` necessários.
3. Preserve sua pasta `data`/`DATA_DIR` e o arquivo `.env`.
4. Rode `npm ci`.
5. Rode `npm run register:commands` se você atualizou comandos/botões.
6. Rode `npm run check`, `npm test` e depois `npm start`.

## Checklist manual sugerido (desktop/Android/iOS)

- [ ] Desktop: `/link_pagamento` publica cartão com **Copiar código**/**Copiar link** quando aplicável.
- [ ] Android: a resposta efêmera de cópia do pagamento permite usar a ação nativa de copiar texto da mensagem.
- [ ] iOS: a resposta efêmera de **Mostrar conta para copiar** permite copiar `email:senha` sem markdown extra.
- [ ] Desktop/mobile: **Apagar esta mensagem** remove apenas o resultado de e-mail clicado.
- [ ] Desktop/mobile: **Avisar autor** envia DM ou faz fallback com uma única menção no ticket.
