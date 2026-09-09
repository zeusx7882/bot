'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIRS = ['src', 'scripts', 'tests'];

function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const projectRoot = path.join(__dirname, '..');
const files = ROOT_DIRS.flatMap((dir) => collectJsFiles(path.join(projectRoot, dir)));

let hasError = false;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  } catch {
    hasError = true;
  }
}

if (hasError) {
  console.error('Falha na verificação de sintaxe.');
  process.exit(1);
}

console.log(`Sintaxe verificada com sucesso em ${files.length} arquivo(s).`);
