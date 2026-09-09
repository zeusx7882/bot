'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommandPayloads } = require('../scripts/commandDefinitions');

function assertRequiredOptionsFirst(options, path) {
  let sawOptional = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option.required === true && sawOptional) {
      throw new Error(`Opção obrigatória após opcional em ${path}[${index}] (${option.name})`);
    }
    if (option.required !== true) {
      sawOptional = true;
    }
    if (Array.isArray(option.options) && option.options.length > 0) {
      assertRequiredOptionsFirst(option.options, `${path}[${index}].options`);
    }
  }
}

test('/link_pagamento mantém obrigatórias antes da opcional descricao', () => {
  const commands = getCommandPayloads();
  const command = commands.find((entry) => entry.name === 'link_pagamento');
  assert.ok(command, 'Comando /link_pagamento não encontrado');
  assert.deepEqual(
    command.options.map((option) => option.name),
    ['nome', 'valor', 'metodo', 'descricao']
  );
  assert.equal(command.options[0].required, true);
  assert.equal(command.options[1].required, true);
  assert.equal(command.options[2].required, true);
  assert.equal(command.options[3].required, false);
});

test('todos os comandos registrados respeitam required antes de opcionais (recursivo)', () => {
  const commands = getCommandPayloads();
  for (const command of commands) {
    if (Array.isArray(command.options) && command.options.length > 0) {
      assert.doesNotThrow(() => assertRequiredOptionsFirst(command.options, `/${command.name}.options`));
    }
  }
});

test('validador falha quando há obrigatória após opcional, inclusive em nível aninhado', () => {
  const invalidOptions = [
    { name: 'obrigatoria-topo', required: true },
    { name: 'opcional-topo', required: false },
    {
      name: 'sub',
      required: false,
      options: [{ name: 'filha-opcional', required: false }, { name: 'filha-obrigatoria', required: true }],
    },
  ];

  assert.throws(() => assertRequiredOptionsFirst(invalidOptions, '/exemplo.options'));
});

test('validador aceita opções opcionais com required false ou omitido', () => {
  const validOptions = [
    { name: 'obrigatoria', required: true },
    { name: 'opcional-false', required: false },
    { name: 'opcional-omitido' },
    {
      name: 'grupo',
      options: [{ name: 'filha-obrigatoria', required: true }, { name: 'filha-opcional' }],
    },
  ];

  assert.doesNotThrow(() => assertRequiredOptionsFirst(validOptions, '/exemplo.options'));
});
