'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptService } = require('../src/services/transcriptService');

test('TranscriptService escapa HTML/script e preserva links https de anexos', () => {
  const service = new TranscriptService();
  const html = service.buildHtml({
    guildName: 'Guild',
    channelName: 'ticket',
    ticket: { id: 1, ticket_type: 'normal' },
    messages: [
      {
        id: 'm1',
        content: '<script>alert(1)</script>oi',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        author: { tag: 'user#1', id: 'u1' },
        attachments: new Map([
          ['a', { id: 'a', name: 'arquivo.png', url: 'https://cdn.example/arquivo.png' }],
        ]),
      },
    ],
  });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;oi/);
  assert.match(html, /https:\/\/cdn\.example\/arquivo\.png/);
  assert.equal(html.toLowerCase().includes('<script>'), false);
});
