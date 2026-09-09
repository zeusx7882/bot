'use strict';

const SEPARATOR = ':';
const NAMESPACE = 'tp';

/**
 * Constrói um customId estável e roteável globalmente (sobrevive a
 * reinícios, não depende de collectors em memória). Formato:
 * `tp:<escopo>:<ação>:<guildId>[:<argumentos...>]`
 */
function build(scope, action, guildId, ...args) {
  const parts = [NAMESPACE, scope, action, guildId, ...args].map(String);
  const id = parts.join(SEPARATOR);
  if (id.length > 100) {
    throw new Error(`customId excede o limite de 100 caracteres: ${id}`);
  }
  return id;
}

function parse(customId) {
  if (typeof customId !== 'string' || !customId.startsWith(`${NAMESPACE}${SEPARATOR}`)) {
    return null;
  }
  const [namespace, scope, action, guildId, ...args] = customId.split(SEPARATOR);
  if (namespace !== NAMESPACE || !scope || !action || !guildId) {
    return null;
  }
  return { scope, action, guildId, args };
}

module.exports = { build, parse };
