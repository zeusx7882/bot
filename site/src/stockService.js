'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_SERVICE_FILES = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_LINE_CHARS = 4096;

class StockService {
  constructor({ db, cryptoService, config, now = () => Date.now() }) {
    this.db = db;
    this.cryptoService = cryptoService;
    this.config = config;
    this.now = now;
  }

  importFromDirectory() {
    fs.mkdirSync(this.config.stockDir, { recursive: true });
    const baseDir = path.resolve(this.config.stockDir);
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    if (entries.length > MAX_SERVICE_FILES) {
      throw new Error('Limite de 100 serviços TXT excedido em contas1/.');
    }

    const visibleKeys = [];
    let totalBytes = 0;

    for (const entry of entries) {
      const fullPath = path.resolve(baseDir, entry.name);
      if (!fullPath.startsWith(baseDir + path.sep)) {
        throw new Error('Caminho inválido em contas1/.');
      }
      const stats = fs.lstatSync(fullPath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`Arquivo inválido em contas1/: ${entry.name}`);
      }
      if (stats.size > MAX_FILE_BYTES) {
        throw new Error(`Arquivo maior que 2 MB em contas1/: ${entry.name}`);
      }
      totalBytes += stats.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error('Tamanho total dos TXTs excede 10 MB.');
      }

      const displayName = path.basename(entry.name, path.extname(entry.name)).trim();
      const serviceKey = slugifyService(displayName);
      if (!serviceKey || visibleKeys.includes(serviceKey)) {
        throw new Error(`Nome de serviço duplicado ou inválido: ${entry.name}`);
      }
      visibleKeys.push(serviceKey);

      const text = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
      const sourceHash = this.cryptoService.hash(text);
      const current = this.db.prepare('SELECT source_hash FROM stock_service WHERE service_key = ?').get(serviceKey) || null;
      this.db.prepare(
        `INSERT INTO stock_service (service_key, display_name, visible, source_hash, source_mtime_ms, source_size, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, datetime('now'))
         ON CONFLICT(service_key) DO UPDATE SET display_name = excluded.display_name, visible = 1, source_hash = excluded.source_hash, source_mtime_ms = excluded.source_mtime_ms, source_size = excluded.source_size, updated_at = datetime('now')`
      ).run(serviceKey, displayName, sourceHash, Math.floor(stats.mtimeMs), stats.size);
      if (current && current.source_hash === sourceHash) {
        continue;
      }
      const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
      for (const line of lines) {
        if (line.length > MAX_LINE_CHARS) {
          throw new Error(`Linha acima de 4096 caracteres em ${entry.name}.`);
        }
        const stockId = this.cryptoService.hmac(`stock:${line}`);
        const encrypted = this.cryptoService.encryptText(line, `stock:${stockId}`);
        this.db.prepare(
          `INSERT INTO stock_item (stock_id, service_key, ciphertext, iv, auth_tag, imported_at, source_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(stock_id) DO NOTHING`
        ).run(stockId, serviceKey, encrypted.ciphertext, encrypted.iv, encrypted.authTag, this.now(), sourceHash);
      }
    }

    if (visibleKeys.length > 0) {
      const placeholders = visibleKeys.map(() => '?').join(',');
      this.db.prepare(`UPDATE stock_service SET visible = 0, updated_at = datetime('now') WHERE service_key NOT IN (${placeholders})`).run(...visibleKeys);
    } else {
      this.db.prepare('UPDATE stock_service SET visible = 0, updated_at = datetime(\'now\')').run();
    }
  }

  listCatalog({ page = 1, pageSize = 12 } = {}) {
    const offset = Math.max(0, (page - 1) * pageSize);
    const rows = this.db.prepare(
      `SELECT s.service_key, s.display_name,
              COUNT(i.stock_id) FILTER (WHERE i.used_at IS NULL) AS available_count
       FROM stock_service s
       LEFT JOIN stock_item i ON i.service_key = s.service_key
       WHERE s.visible = 1
       GROUP BY s.service_key, s.display_name
       ORDER BY s.display_name COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`
    ).all(pageSize, offset);
    const total = this.db.prepare('SELECT COUNT(*) AS count FROM stock_service WHERE visible = 1').get().count;
    return {
      items: rows.map((row) => ({
        serviceKey: row.service_key,
        displayName: row.display_name,
        availableCount: Number(row.available_count || 0),
      })),
      page,
      pageSize,
      total,
    };
  }

  getCooldownRemainingMs(userId) {
    const row = this.db.prepare('SELECT next_allowed_at FROM user_cooldown WHERE user_id = ?').get(userId) || null;
    return row ? Math.max(0, row.next_allowed_at - this.now()) : 0;
  }

  generateForUser({ userId, serviceKey, requestId }) {
    if (!/^\d{5,30}$/.test(String(userId || ''))) throw new Error('Usuário inválido.');
    if (!/^[a-z0-9-]{1,80}$/.test(String(serviceKey || ''))) throw new Error('Serviço inválido.');
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(String(requestId || ''))) throw new Error('requestId inválido.');

    const payloadHash = this.cryptoService.hash(JSON.stringify({ serviceKey }));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare(
        `SELECT r.payload_hash, r.service_key, r.stock_id, r.generated_at, i.ciphertext, i.iv, i.auth_tag
         FROM user_generation_request r
         JOIN stock_item i ON i.stock_id = r.stock_id
         WHERE r.user_id = ? AND r.request_id = ?`
      ).get(userId, requestId) || null;
      if (existing) {
        if (existing.service_key !== serviceKey || existing.payload_hash !== payloadHash) {
          throw new Error('requestId já usado com payload diferente.');
        }
        const item = this.cryptoService.decryptText({
          ciphertext: existing.ciphertext,
          iv: existing.iv,
          authTag: existing.auth_tag,
        }, `stock:${existing.stock_id}`);
        this.db.exec('COMMIT');
        return { item, reused: true, generatedAt: existing.generated_at };
      }

      const service = this.db.prepare('SELECT visible FROM stock_service WHERE service_key = ?').get(serviceKey) || null;
      if (!service || !service.visible) throw new Error('Serviço indisponível no catálogo.');

      const cooldown = this.db.prepare('SELECT next_allowed_at FROM user_cooldown WHERE user_id = ?').get(userId) || null;
      if (cooldown && cooldown.next_allowed_at > this.now()) {
        throw new Error(`Aguarde ${Math.ceil((cooldown.next_allowed_at - this.now()) / 1000)}s para gerar novamente.`);
      }

      const stock = this.db.prepare(
        `SELECT stock_id, ciphertext, iv, auth_tag
         FROM stock_item
         WHERE service_key = ? AND used_at IS NULL
         ORDER BY imported_at ASC, stock_id ASC
         LIMIT 1`
      ).get(serviceKey) || null;
      if (!stock) throw new Error('Estoque esgotado para este serviço.');

      const usedAt = this.now();
      const update = this.db.prepare(
        `UPDATE stock_item
         SET used_at = ?, used_by_user_id = ?, used_request_id = ?
         WHERE stock_id = ? AND used_at IS NULL`
      ).run(usedAt, userId, requestId, stock.stock_id);
      if (update.changes !== 1) {
        throw new Error('Concorrência detectada ao consumir o estoque. Tente novamente.');
      }

      this.db.prepare(
        `INSERT INTO user_generation_request (user_id, request_id, payload_hash, service_key, stock_id, generated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(userId, requestId, payloadHash, serviceKey, stock.stock_id, usedAt);
      this.db.prepare(
        `INSERT INTO user_cooldown (user_id, next_allowed_at)
         VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET next_allowed_at = excluded.next_allowed_at`
      ).run(userId, usedAt + this.config.cooldownSeconds * 1000);

      const item = this.cryptoService.decryptText({
        ciphertext: stock.ciphertext,
        iv: stock.iv,
        authTag: stock.auth_tag,
      }, `stock:${stock.stock_id}`);
      this.db.exec('COMMIT');
      return { item, reused: false, generatedAt: usedAt };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listHistory({ userId, page = 1, pageSize = 20 }) {
    const offset = Math.max(0, (page - 1) * pageSize);
    const rows = this.db.prepare(
      `SELECT r.request_id, r.service_key, s.display_name, r.generated_at,
              i.stock_id, i.ciphertext, i.iv, i.auth_tag
       FROM user_generation_request r
       JOIN stock_item i ON i.stock_id = r.stock_id
       JOIN stock_service s ON s.service_key = r.service_key
       WHERE r.user_id = ?
       ORDER BY r.generated_at DESC
       LIMIT ? OFFSET ?`
    ).all(userId, pageSize, offset);
    const total = this.db.prepare('SELECT COUNT(*) AS count FROM user_generation_request WHERE user_id = ?').get(userId).count;
    return {
      items: rows.map((row) => ({
        requestId: row.request_id,
        serviceKey: row.service_key,
        displayName: row.display_name,
        generatedAt: row.generated_at,
        item: this.cryptoService.decryptText({
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
        }, `stock:${row.stock_id}`),
      })),
      page,
      pageSize,
      total,
    };
  }
}

function slugifyService(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = { StockService, slugifyService, MAX_SERVICE_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_LINE_CHARS };
