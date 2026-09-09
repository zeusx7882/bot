# zeusx7882/bot

Repositório com **dois apps Node.js independentes**:

- `bot/`: bot Discord de tickets existente, preservado e migrado para subpasta.
- `site/`: portal web em pt-BR para login Discord, geração de estoque e visualização privada de transcripts.

## Estrutura

- `bot/` tem `package.json`, `package-lock.json`, `src/`, `scripts/`, `tests/` e `.env.example` próprios.
- `site/` tem `package.json`, `package-lock.json`, `src/`, `public/`, `tests/`, `contas1/` e `.env.example` próprios.
- As instalações são separadas: rode `npm ci` dentro de cada pasta.

## Instalação

```bash
cd bot
npm ci

cd ../site
npm ci
```

## Execução

```bash
cd bot
npm start

cd ../site
npm start
```

Wrappers opcionais na raiz:

```bash
npm run start:bot
npm run start:site
npm run test:bot
npm run test:site
npm run check:bot
npm run check:site
```

## Domínio, HTTPS e callback do site

- O callback OAuth do site é **`/auth/discord/callback` no domínio do próprio site**.
- O callback do RestoreCord **permanece `https://restorecord.com/api/callback`** e **não** faz login no site.
- `PUBLIC_URL` do `site/` pode ser `http://localhost:PORT` só em desenvolvimento local.
- Em ambiente público, `PUBLIC_URL` precisa usar **HTTPS**.
- O `redirect_uri` aceito é estrito e precisa estar na allowlist do `.env` do site.

## Semântica de permissões dos transcripts

- Usuário autenticado vê apenas os próprios transcripts.
- Staff adicional por servidor é configurado por **IDs de usuários** em `STAFF_BY_GUILD_JSON`.
- **Não** há sincronização automática por cargo.
- **Não** há gate de membresia/RestoreCord nesta versão: qualquer usuário autenticado no site pode gerar estoque e consultar apenas os recursos permitidos a ele.

## Limitações explícitas

- Sem deploy automático neste repositório.
- Sem merge automático de PR.
- Sem gate de membresia/pagamento/role sync adicional no site.
- Cada app usa uma única instância SQLite persistente local.
- Importação de TXT para estoque é **não destrutiva**: remover a linha do TXT não apaga histórico nem “repõe” item já consumido.
- Retenção de transcripts é local e configurável; anexos externos podem expirar.
- Não foram executados testes ao vivo com Discord, IMAP, pagamentos nem provedores externos.
