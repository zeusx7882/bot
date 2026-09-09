# Site do bot

Portal Node.js + Express 5 + SQLite para:

- login com Discord via OAuth2 (`identify`)
- catálogo de estoque baseado em `contas1/*.txt`
- geração privada com cooldown global por usuário
- histórico privado agrupado por serviço
- visualização privada de transcripts enviados pelo bot

## Instalação

```bash
cd site
npm ci
cp .env.example .env
```

## Start

```bash
npm start
npm run check
npm test
```

## OAuth e domínio

- Callback do site: `PUBLIC_URL/auth/discord/callback`
- Callback do RestoreCord continua separado: `https://restorecord.com/api/callback`
- `PUBLIC_URL` só pode usar `http://localhost...` em desenvolvimento local.
- Em ambiente público, use HTTPS e registre exatamente o callback do site no Discord Developer Portal.

## Estoque em TXT

- Cada arquivo em `contas1/` vira um serviço.
- Uma linha = um item.
- O TXT é fonte de importação; o banco é autoritativo.
- Remover a linha do TXT **não** apaga histórico nem repõe item já consumido.
- Remover o arquivo oculta o catálogo novo, mas preserva histórico já gerado.
- Limites: 100 serviços, 2 MB por arquivo, 10 MB total, 4096 caracteres por linha.
- Symlink/traversal são rejeitados.

## Transcripts

- O bot envia apenas tickets normais.
- `STAFF_BY_GUILD_JSON` usa **IDs de usuários**, não cargos.
- Não há sincronização automática por cargos.
- Qualquer transcript exige sessão autenticada; UUID não concede acesso sozinho.
- Retenção padrão: 30 dias (`TRANSCRIPT_RETENTION_DAYS`). Faça backup do banco **e** da `DATA_KEY`.
- Links de anexos externos podem expirar; o site mostra hyperlinks seguros e não faz embed automático.

## Segurança

- Sessão opaca com hash em SQLite, expiração e invalidação no logout/login.
- `csrf` + `Origin` em POSTs do navegador.
- Cookies `HttpOnly`, `SameSite=Lax` e `Secure` fora de localhost.
- CSP estrita `self`, `no-store`, `nosniff`, `no-referrer`, `frame-ancestors 'none'`.
- Rate limit em memória por origem/sessão/guild; por padrão **não** confia em `X-Forwarded-For` arbitrário.

## Limitações explícitas

- Sem gate de membresia/RestoreCord/cargos automáticos nesta versão.
- Sem testes ao vivo com Discord, provedores externos ou contas reais.
- Uma única instância SQLite persistente local por app.
