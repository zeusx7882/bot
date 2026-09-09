'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');

const {
  CONFIG_PAGE_IDS,
  buildConfigPanel,
  buildOptionDetailView,
  buildOptionRemoveConfirmView,
  countSerializedComponents,
} = require('../src/ui/configPanel');
const { buildPublicPanel } = require('../src/ui/publicPanel');
const { buildTicketOpenedMessage } = require('../src/ui/ticketMessage');

const sampleConfig = {
  panel_title: 'Central de Atendimento',
  panel_description: 'Selecione uma opção.',
  panel_image_url: null,
  category_id: null,
  support_role_id: null,
  publish_channel_id: null,
  panel_channel_id: null,
  panel_message_id: null,
  site_domain: null,
  email_option_enabled: 0,
  email_option_label: 'Verificar e-mail',
  email_option_description: 'Descrição e-mail',
  email_category_id: null,
};

const sampleOptions = [{ id: 'opt-1', label: 'Suporte', description: 'Ajuda geral', emoji: '🎫' }];

function assertNoLegacyContent(payload) {
  assert.equal(payload.content, undefined);
  assert.equal(payload.embeds, undefined);
}

test('buildConfigPanel usa a flag IsComponentsV2 + Ephemeral e não usa content/embeds', () => {
  const payload = buildConfigPanel({
    guildId: '123',
    guildName: 'Meu Servidor',
    config: sampleConfig,
    options: sampleOptions,
  });

  assert.ok(payload.flags & MessageFlags.IsComponentsV2);
  assert.ok(payload.flags & MessageFlags.Ephemeral);
  assertNoLegacyContent(payload);
  assert.equal(payload.components.length, 1);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.ok(countSerializedComponents(payload.components) <= 40);
});

test('buildConfigPanel desabilita publicação sem opções/categoria/cargo/canal', () => {
  const payload = buildConfigPanel({
    guildId: '123',
    guildName: 'Meu Servidor',
    config: sampleConfig,
    options: [],
    page: CONFIG_PAGE_IDS.PUBLISH,
  });
  const json = payload.components[0].toJSON();
  const flatButtons = JSON.stringify(json);
  assert.match(flatButtons, /"custom_id":"tp:cfg:publish:123:publish"/);
  const container = json;
  const publishButton = findButtonByCustomId(container, 'tp:cfg:publish:123:publish');
  assert.equal(publishButton.disabled, true);
});

test('buildConfigPanel renderiza somente componentes da página selecionada', () => {
  const appearance = buildConfigPanel({
    guildId: '123',
    guildName: 'Meu Servidor',
    config: sampleConfig,
    options: sampleOptions,
    page: CONFIG_PAGE_IDS.APPEARANCE,
  });
  const appearanceJson = JSON.stringify(appearance.components[0].toJSON());
  assert.match(appearanceJson, /tp:cfg:image:123:appearance/);
  assert.doesNotMatch(appearanceJson, /tp:cfg:email_opt:123:email/);
  assert.doesNotMatch(appearanceJson, /tp:cfg:publish:123:publish/);

  const email = buildConfigPanel({
    guildId: '123',
    guildName: 'Meu Servidor',
    config: sampleConfig,
    options: sampleOptions,
    page: CONFIG_PAGE_IDS.EMAIL,
  });
  const emailJson = JSON.stringify(email.components[0].toJSON());
  assert.match(emailJson, /tp:cfg:email_opt:123:email/);
  assert.doesNotMatch(emailJson, /tp:cfg:role:123:normals/);
});

test('buildConfigPanel mantém contagem recursiva <=40 em cenários máximos', () => {
  const options = Array.from({ length: 25 }, (_, index) => ({
    id: `opt-${index + 1}`,
    label: `Opção ${index + 1}`,
    description: 'Descrição curta',
    emoji: '🎫',
  }));
  const config = {
    ...sampleConfig,
    panel_image_url: 'https://example.test/image.png',
    site_domain: 'https://example.test',
    email_option_enabled: 1,
    email_category_id: 'cat-email',
    category_id: 'cat-normal',
    support_role_id: 'role-support',
    publish_channel_id: 'channel-publish',
  };

  for (const page of Object.values(CONFIG_PAGE_IDS)) {
    const payload = buildConfigPanel({ guildId: '123', guildName: 'Meu Servidor', config, options, page });
    const count = countSerializedComponents(payload.components);
    assert.ok(count <= 40, `Página ${page} excedeu limite: ${count}`);
  }

  const detail = buildOptionDetailView({ guildId: '123', option: options[0], page: CONFIG_PAGE_IDS.NORMALS });
  const confirm = buildOptionRemoveConfirmView({ guildId: '123', option: options[0], page: CONFIG_PAGE_IDS.NORMALS });
  assert.ok(countSerializedComponents(detail.components) <= 40);
  assert.ok(countSerializedComponents(confirm.components) <= 40);
});

test('buildConfigPanel respeita limite combinado de opções normais + e-mail', () => {
  const buildOptions = (size) =>
    Array.from({ length: size }, (_, index) => ({
      id: `opt-${index + 1}`,
      label: `Opção ${index + 1}`,
      description: null,
      emoji: null,
    }));

  const scenarios = [
    { size: 0, email: 0, disabled: false },
    { size: 1, email: 0, disabled: false },
    { size: 24, email: 1, disabled: true },
    { size: 25, email: 0, disabled: true },
  ];

  for (const scenario of scenarios) {
    const payload = buildConfigPanel({
      guildId: '123',
      guildName: 'Meu Servidor',
      config: { ...sampleConfig, email_option_enabled: scenario.email },
      options: buildOptions(scenario.size),
      page: CONFIG_PAGE_IDS.NORMALS,
    });
    const addButton = findButtonByCustomId(payload.components[0].toJSON(), 'tp:cfg:opt_add:123:normals');
    assert.equal(addButton.disabled, scenario.disabled);
  }
});

test('buildPublicPanel: título/descrição/select, sem content/embeds, até 25 opções', () => {
  const payload = buildPublicPanel({ guildId: '123', config: sampleConfig, options: sampleOptions });
  assert.ok(payload.flags & MessageFlags.IsComponentsV2);
  assert.equal(payload.flags & MessageFlags.Ephemeral, 0);
  assertNoLegacyContent(payload);

  const json = payload.components[0].toJSON();
  const select = findComponentByType(json, 3); // StringSelect
  assert.ok(select);
  assert.equal(select.options.length, 1);
  assert.equal(select.custom_id, 'tp:ticket:open:123');
});

test('buildTicketOpenedMessage: allowedMentions explícito, sem @everyone/@here', () => {
  const payload = buildTicketOpenedMessage({
    authorId: 'user1',
    supportRoleId: 'role1',
    optionLabel: 'Suporte',
    optionDescription: 'Detalhe',
  });

  assertNoLegacyContent(payload);
  assert.ok(payload.flags & MessageFlags.IsComponentsV2);
  assert.deepEqual(payload.allowedMentions, { parse: [], users: ['user1'], roles: ['role1'] });

  const text = JSON.stringify(payload.components[0].toJSON());
  assert.match(text, /<@user1>/);
  assert.match(text, /<@&role1>/);
  assert.doesNotMatch(text, /@everyone/);
  assert.doesNotMatch(text, /@here/);
});

function findButtonByCustomId(component, customId) {
  if (component.custom_id === customId && component.type === 2) return component;
  const children = component.components || (component.accessory ? [component.accessory] : []);
  for (const child of children) {
    const found = findButtonByCustomId(child, customId);
    if (found) return found;
  }
  return null;
}

function findComponentByType(component, type) {
  if (component.type === type) return component;
  const children = component.components || [];
  for (const child of children) {
    const found = findComponentByType(child, type);
    if (found) return found;
  }
  return null;
}


test('buildPublicPanel inclui opção especial de e-mail quando habilitada', () => {
  const config = { ...sampleConfig, email_option_enabled: 1, email_category_id: 'cat-email' };
  const payload = buildPublicPanel({ guildId: '123', config, options: sampleOptions });
  const json = payload.components[0].toJSON();
  const select = findComponentByType(json, 3);
  const values = select.options.map((opt) => opt.value);
  assert.ok(values.includes('__email_verify_option__'));
});
