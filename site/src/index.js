'use strict';

const { createApp } = require('./server');

async function main() {
  const { app, config } = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Site iniciado em ${config.publicUrl}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao iniciar o site:', error.message);
    process.exit(1);
  });
}

module.exports = { main };
