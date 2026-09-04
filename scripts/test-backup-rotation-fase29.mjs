// Fase 2.9, item 1 (achado #20 — vazamento de arquivos de backup).
//
// A rotação antiga girava sobre sufixos numéricos (`.2`, `.3`) aplicados ao
// MESMO `backupPath`, mas `GameStorage` embute um timestamp único no nome de
// cada backup (de propósito — histórico legível por data). `backupPath`
// nunca se repetia, então a rotação nunca encontrava nada pra rotacionar e
// TODO write com `backup:true` deixava um arquivo permanente (achado #20,
// medido na Fase 2.8: 223→946 arquivos / 16.2MB→173.1MB em 6 meses,
// crescendo).
//
// A correção (src/storage/BackupManager.js + src/storage/GameStorage.js)
// troca a rotação por LISTAGEM+FILTRO+ORDENAÇÃO por padrão de nome
// (`${prefix}-*-backup.json`), preservando o timestamp no nome. Este teste
// prova que N escritas consecutivas da mesma carreira deixam exatamente
// `maxBackups` (3) arquivos de backup — e que são os 3 MAIS RECENTES, não
// um subconjunto arbitrário.
//
// Importante (aviso explícito do usuário nesta fase): "se as duas camadas
// divergirem, o teste passa e a produção continua vazando". O `MemoryStorage`
// abaixo foi corrigido (mesmo commit) pra ter o MESMO contrato do
// `TauriStorage.list()` real: entradas `{name, isDirectory}`, escopadas ao
// diretório pedido, não-recursivas — replicado aqui (não importado de
// audit-real-athletes-simulation.mjs porque cada script do harness mantém
// sua própria cópia da classe, padrão já estabelecido nas fases anteriores).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

// Mesmo padrão de relógio determinístico usado em
// audit-real-athletes-simulation.mjs: cada `new Date()`/`Date.now()` avança
// 1s, garantindo timestamps ÚNICOS e em ORDEM CRESCENTE mesmo num loop
// apertado — sem isso, escritas na mesma janela de execução podiam colidir
// no mesmo milissegundo e o teste não provaria nada sobre rotação por
// padrão de nome.
function installDeterministicClock() {
  const RealDate = Date;
  let fakeMs = new RealDate('2026-01-01T00:00:00.000Z').getTime();
  function tick() { fakeMs += 1000; return fakeMs; }
  class DeterministicDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(tick());
      else super(...args);
    }
    static now() { return tick(); }
  }
  globalThis.Date = DeterministicDate;
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) {
    if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; }
    return this.files.get(p);
  }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  // Contrato real do TauriStorage.list(): entradas {name, isDirectory},
  // escopadas ao diretório pedido, não-recursivo (readDir do Tauri).
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
}

installDeterministicClock();

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');

  const rawStorage = new MemoryStorage();
  const storage = new GameStorage(rawStorage);
  const careerId = 'career-fase29-rotation-test';

  const WRITE_COUNT = 9;
  const MAX_BACKUPS = 3;
  for (let sequence = 1; sequence <= WRITE_COUNT; sequence += 1) {
    await storage.writeCareer(careerId, { id: careerId, database: { sequence } });
  }

  const backupEntries = await storage.list('backups');
  const backupFiles = backupEntries.filter((entry) => !entry.isDirectory);

  gate(
    `${WRITE_COUNT} escritas consecutivas deixam exatamente ${MAX_BACKUPS} arquivos de backup (encontrado: ${backupFiles.length})`,
    backupFiles.length === MAX_BACKUPS,
  );

  // Backups são criados a partir da 2ª escrita (a 1ª não tem destino
  // pré-existente pra fazer backup de). Backup criado na escrita K captura
  // o conteúdo de ANTES dela, ou seja, o estado deixado pela escrita K-1.
  // Com WRITE_COUNT=9, os backups possíveis são das escritas 2..9, ou seja
  // capturam sequence=1..8. Os 3 mais recentes mantidos devem ser os de
  // sequence mais alto: 6, 7, 8.
  const expectedKeptSequences = [];
  for (let s = WRITE_COUNT - 1 - MAX_BACKUPS + 1; s <= WRITE_COUNT - 1; s += 1) expectedKeptSequences.push(s);

  const keptSequences = [];
  for (const entry of backupFiles) {
    const raw = await rawStorage.readText(`backups/${entry.name}`);
    keptSequences.push(JSON.parse(raw).database.sequence);
  }
  keptSequences.sort((a, b) => a - b);

  gate(
    `os backups mantidos são os ${MAX_BACKUPS} mais recentes (esperado sequence=[${expectedKeptSequences.join(',')}], encontrado=[${keptSequences.join(',')}])`,
    JSON.stringify(keptSequences) === JSON.stringify(expectedKeptSequences),
  );

  // Nomes devem preservar o timestamp único (não regredir pra nome
  // estável) — cada backup mantido tem um nome DIFERENTE dos outros.
  const uniqueNames = new Set(backupFiles.map((entry) => entry.name));
  gate('cada backup mantido tem nome único (timestamp preservado, não um nome fixo)', uniqueNames.size === backupFiles.length);

  // O arquivo de carreira em si continua correto (a última escrita venceu).
  const finalCareer = await storage.readCareer(careerId);
  gate(`o arquivo de carreira reflete a última escrita (sequence=${WRITE_COUNT})`, finalCareer.database.sequence === WRITE_COUNT);

  // item 1B: varredura manual/automática (pruneCareerBackups) é idempotente
  // sobre um estado já rotacionado — não deve sobrar nem faltar nada.
  const sweepResult = await storage.pruneCareerBackups(careerId, { maxBackups: MAX_BACKUPS });
  gate(`pruneCareerBackups não remove nada quando já está em ${MAX_BACKUPS} (removed=0)`, sweepResult.removed === 0 && sweepResult.kept === MAX_BACKUPS);

  // Simula uma instalação já afetada: acrescenta backups "órfãos" direto no
  // storage (como se tivessem sido criados pela lógica antiga, sem
  // rotação), depois confirma que a varredura os reduz a maxBackups.
  for (let extra = 0; extra < 12; extra += 1) {
    const fname = `career-fase29-rotation-test.json-2025-0${(extra % 9) + 1}-01T00-00-0${extra}-000Z-backup.json`;
    await rawStorage.writeText(`backups/${fname}`, JSON.stringify({ id: careerId, database: { sequence: `legacy-${extra}` } }));
  }
  const beforeSweep = (await storage.list('backups')).filter((e) => !e.isDirectory).length;
  const sweep2 = await storage.pruneCareerBackups(careerId, { maxBackups: MAX_BACKUPS });
  const afterSweep = (await storage.list('backups')).filter((e) => !e.isDirectory).length;
  gate(
    `varredura em instalação já afetada (${beforeSweep} arquivos) reduz a ${MAX_BACKUPS} (encontrado: ${afterSweep}, removidos reportados: ${sweep2.removed})`,
    afterSweep === MAX_BACKUPS && sweep2.removed === beforeSweep - MAX_BACKUPS,
  );

  console.log(`\n${gates} checagens, todas PASS.`);
} finally {
  await vite.close();
}
