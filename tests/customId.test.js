'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const customId = require('../src/ui/customId');

test('build/parse roundtrip preserva escopo, ação, guildId e argumentos', () => {
  const id = customId.build('cfg', 'opt_edit', '111222333', 'abc-def');
  assert.equal(id, 'tp:cfg:opt_edit:111222333:abc-def');

  const parsed = customId.parse(id);
  assert.deepEqual(parsed, { scope: 'cfg', action: 'opt_edit', guildId: '111222333', args: ['abc-def'] });
});

test('parse retorna null para customId de outro namespace ou inválido', () => {
  assert.equal(customId.parse('outro:cfg:x:1'), null);
  assert.equal(customId.parse(''), null);
  assert.equal(customId.parse(undefined), null);
  assert.equal(customId.parse('tp:cfg'), null);
});

test('build lança erro se exceder 100 caracteres (limite do Discord)', () => {
  assert.throws(() => customId.build('cfg', 'x'.repeat(90), '111222333'));
});
