'use strict';

const { main } = require('./src/index');

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao iniciar o site:', error.message);
    process.exit(1);
  });
}

module.exports = require('./src/index');
