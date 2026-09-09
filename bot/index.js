'use strict';

const { main } = require('./src/index');
const { logger } = require('./src/utils/logger');

if (require.main === module) {
  main().catch((error) => {
    logger.error('Falha ao iniciar o bot', error);
    process.exit(1);
  });
}

module.exports = require('./src/index');
