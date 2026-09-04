// Fase 2.9, item 1B (achado #20 — vazamento de arquivos de backup).
//
// A correção da rotação (BackupManager.js/GameStorage.js, ver
// test-backup-rotation-fase29.mjs) só evita acúmulo NOVO — quem já jogou
// (ou testou) versões anteriores tem centenas/milhares de arquivos de
// backup PERMANENTES no disco, que a rotação sozinha nunca remove. Este
// teste simula exatamente essa situação — uma carreira com acúmulo prévio
// nos DOIS armazéns de backup existentes (ver comentário em
// CareerRepository.pruneAllBackups) — e prova que:
//   (a) a varredura automática dispara sozinha em CareerManager.loadCareer
//       (o ponto de entrada real de qualquer sessão do jogo abrindo uma
//       carreira), sem que nada explícito precise ser chamado;
//   (b) o resultado reduz os dois armazéns ao limite (3 cada);
//   (c) reporta quantos arquivos e quantos MB foram liberados.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  // Um diretório "existe" também quando qualquer arquivo vive dentro dele
  // (mesmo sem `ensureDirectory` explícito) — um sistema de arquivos real
  // nunca deixaria isso divergir; sem este fallback, injetar arquivos
  // diretamente (como este teste faz pra simular uma instalação já
  // afetada) deixaria `exists(pasta)` falso mesmo com centenas de arquivos
  // lá dentro.
  async exists(p) {
    if (this.files.has(p) || this.directories.has(p)) return true;
    const prefix = `${p}/`;
    for (const key of this.files.keys()) { if (key.startsWith(prefix)) return true; }
    return false;
  }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) {
    if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; }
    return this.files.get(p);
  }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') {
    const normalizedDir = dir.replace(/\/+$/, '');
    const prefix = normalizedDir === '' || normalizedDir === '.' ? '' : `${normalizedDir}/`;
    const entries = new Map();
    for (const filePath of this.files.keys()) {
      if (prefix && !filePath.startsWith(prefix)) continue;
      const rest = prefix ? filePath.slice(prefix.length) : filePath;
      if (!rest || rest.includes('/')) continue;
      entries.set(rest, { name: rest, isDirectory: false });
    }
    for (const dirPath of this.directories) {
      if (prefix && !dirPath.startsWith(prefix)) continue;
      const rest = prefix ? dirPath.slice(prefix.length) : dirPath;
      if (!rest || rest.includes('/')) continue;
      if (!entries.has(rest)) entries.set(rest, { name: rest, isDirectory: true });
    }
    return [...entries.values()];
  }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }

  totalBytesUnder(dir) {
    const prefix = `${dir}/`;
    let bytes = 0; let count = 0;
    for (const [key, value] of this.files.entries()) {
      if (key.startsWith(prefix)) { bytes += value.length; count += 1; }
    }
    return { bytes, count };
  }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');

  const rawStorage = new MemoryStorage();
  const repository = new CareerRepository(new GameStorage(rawStorage));
  const manager = new CareerManager(repository);

  const { summary } = await manager.createCareer({ playerName: 'Teste Fase 2.9', saveName: 'Instalação já afetada' });
  const careerId = summary.id;

  // Simula uma instalação que já rodou por MESES sob a rotação antiga
  // (achado #20): centenas de backups órfãos nos TRÊS armazéns que
  // compartilham o mesmo formato "criar, nunca remover" — os dois por
  // carreira (A, B) e o do índice de carreiras (C), que é global à
  // instalação (gravado a cada criar/carregar/salvar/excluir QUALQUER
  // carreira, não só esta).
  const ORPHAN_COUNT_STORE_A = 400; // GameStorage: backups/<id>.json-<ts>-backup.json
  const ORPHAN_COUNT_STORE_B = 250; // CareerRepository: backups/career-<id>/backup-<ts>.json
  const ORPHAN_COUNT_STORE_C = 150; // GameStorage (índice): backups/careers-index.json-<ts>-backup.json
  const fakeCareerPayload = JSON.stringify({ id: careerId, database: { seeded: true, padding: 'x'.repeat(2000) } });

  for (let i = 0; i < ORPHAN_COUNT_STORE_A; i += 1) {
    const ts = `2025-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}-00-${String(i % 60).padStart(2, '0')}-000Z`;
    await rawStorage.writeText(`backups/${careerId}.json-${ts}-${i}-backup.json`, fakeCareerPayload);
  }
  for (let i = 0; i < ORPHAN_COUNT_STORE_B; i += 1) {
    const ts = `2025-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}-00-${String(i % 60).padStart(2, '0')}-000Z-${i}`;
    await rawStorage.writeText(`backups/career-${careerId}/backup-${ts}.json`, fakeCareerPayload);
  }
  for (let i = 0; i < ORPHAN_COUNT_STORE_C; i += 1) {
    const ts = `2025-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}-00-${String(i % 60).padStart(2, '0')}-000Z-${i}`;
    await rawStorage.writeText(`backups/careers-index.json-${ts}-backup.json`, JSON.stringify({ careers: [], padding: 'x'.repeat(500) }));
  }

  const before = rawStorage.totalBytesUnder('backups');
  console.log(`[antes] ${before.count} arquivos de backup, ${(before.bytes / (1024 * 1024)).toFixed(1)} MB`);
  // >= (não ==): createCareer/writeIndex podem legitimamente ter gerado 1-2
  // backups próprios além dos órfãos injetados — não é o que este teste
  // mede, só confirma que o cenário simulado é pelo menos tão grande quanto
  // pedido.
  const orphanTotal = ORPHAN_COUNT_STORE_A + ORPHAN_COUNT_STORE_B + ORPHAN_COUNT_STORE_C;
  gate(`estado inicial simulado tem pelo menos ${orphanTotal} arquivos de backup (encontrado: ${before.count})`, before.count >= orphanTotal);

  // Ponto de entrada REAL: nenhuma chamada explícita de limpeza — só
  // carregar a carreira, como qualquer sessão de jogo faz ao abrir um save.
  await manager.loadCareer(careerId);

  // A varredura roda "fire-and-forget" dentro de loadCareer (não pode
  // atrasar a carreira abrindo) — dá uma janela pra ela terminar antes de
  // medir. MemoryStorage não tem I/O real, então isso é generoso.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const after = rawStorage.totalBytesUnder('backups');
  const removedFiles = before.count - after.count;
  const removedMb = (before.bytes - after.bytes) / (1024 * 1024);
  console.log(`[depois de loadCareer] ${after.count} arquivos de backup, ${(after.bytes / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`[varredura automática removeu] ${removedFiles} arquivos, ${removedMb.toFixed(1)} MB`);

  const flatBackupEntries = (await repository.storage.list('backups')).filter((e) => !e.isDirectory);
  gate('a varredura automática do loadCareer reduz Store A (GameStorage, arquivo da carreira) a 3 arquivos', flatBackupEntries.filter((e) => e.name.startsWith(`${careerId}.json-`)).length === 3);
  gate('a varredura automática do loadCareer reduz Store B (CareerRepository, pasta manual) a 3 arquivos', (await repository.listBackupFiles(careerId)).length === 3);
  gate('a varredura automática do loadCareer reduz Store C (GameStorage, índice de carreiras) a 3 arquivos', flatBackupEntries.filter((e) => e.name.startsWith('careers-index.json-')).length === 3);
  gate(`total de backups após o load cai para 9 (3+3+3) — encontrado: ${after.count}`, after.count === 9);
  gate(`varredura removeu ${removedFiles} arquivo(s) (esperado: ${before.count - 9}, a partir do estado real antes do load)`, removedFiles === before.count - 9);

  console.log(`\n${gates} checagens, todas PASS.`);
  console.log(`\nResumo pro relatório: carreira de teste com ${before.count} backups acumulados (${(before.bytes / (1024 * 1024)).toFixed(1)} MB) → ${after.count} após um único carregamento (${(after.bytes / (1024 * 1024)).toFixed(1)} MB). Removidos: ${removedFiles} arquivos / ${removedMb.toFixed(1)} MB.`);
} finally {
  await vite.close();
}
