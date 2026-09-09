# 🎫 Bot de Tickets para Discord

Bot de tickets em JavaScript (Node.js) com **Discord Components V2** e persistência em SQLite.

## Recursos

- `/ticket_painel` para configurar painel por servidor (isolamento por guild).
- Opções normais de ticket (até 25) com categoria/cargo de suporte.
- Opção especial configurável **Verificar e-mail** (habilitar/desabilitar, editar título/descrição e categoria exclusiva).
- Fluxo de verificação de e-mail via modal (`email:senha` ou `email:senha:extra`) sem criar canal antes do envio.
- Acesso IMAP TLS (Mailcow) com host/porta fixos via ambiente e allowlist de domínios.
- Ticket de e-mail privado (autor + bot), botões **Verificar**, **Mostrar para copiar** e **Encerrar**.
- Fechamento automático: 30s após encerrar manualmente e 6 minutos sem atividade válida do autor.
- Deadlines persistidas no SQLite para recuperar após reinício (sem estender prazo).

## Requisitos

- Node.js >= 22.5
- Bot no Discord com permissões mínimas de criar/gerenciar canais e enviar mensagens.

## Instalação

```bash
git clone https://github.com/zeusx7882/bot.git
cd bot
npm install
cp .env.example .env
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DISCORD_TOKEN` | sim | Token do bot |
| `DISCORD_CLIENT_ID` | sim | Application ID |
| `DISCORD_GUILD_ID` | não | Registro local de comandos em uma guild |
| `DATA_DIR` | não | Diretório do SQLite (`./data`) |
| `MAILCOW_IMAP_HOST` | sim para recurso e-mail | Host IMAP do operador |
| `MAILCOW_IMAP_PORT` | não | Porta IMAPS (padrão 993) |
| `MAILCOW_ALLOWED_DOMAINS` | sim para recurso e-mail | Domínios permitidos separados por vírgula |

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
4. Publica no ticket o último e-mail da INBOX em texto sanitizado e links `http(s)` detectados.
5. Botão **Verificar** busca mensagens novas por `UID`/`UIDVALIDITY`.
6. Botão **Mostrar para copiar** retorna texto efêmero selecionável (sem clipboard automático).
7. Botão **Encerrar** agenda exclusão do canal em 30 segundos.
8. Sem atividade válida do autor por 6 minutos, encerra automaticamente.

> Administradores do Discord ainda podem acessar canais privados.

## Comandos e execução

```bash
npm run register:commands
npm start
npm run check
npm test
```

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

