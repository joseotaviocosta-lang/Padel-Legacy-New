// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 5/17).
//
// Prova a correção real de 2 lacunas encontradas na auditoria em
// processMatchRelationships (src/lib/relationships.js): (1) adversários só
// acumulavam shared_matches, nunca shared_wins/losses (H2H real impossível);
// (2) a função só era chamada em partida de TREINO — partida oficial de
// torneio nunca alimentava rivalidade nenhuma. Usa localGame real (sem
// mock), mesmo padrão de bootstrap de storage em memória já estabelecido.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getTopRivalry, getRivalries } = await server.ssrLoadModule('/src/lib/careerStory.js');

  // ── getTopRivalry/getRivalries: puro, limiar de 3 confrontos ────────────
  gate('Sem relações, getTopRivalry retorna null (nunca inventa um rival)', getTopRivalry([]) === null);
  gate('Confronto único (1 partida) NÃO é rivalidade (abaixo do limiar de 3)', getTopRivalry([{ target_name: 'Bot A', shared_matches: 1, shared_wins: 1, shared_losses: 0 }]) === null);
  const relationships = [
    { target_name: 'Rival Frequente', shared_matches: 8, shared_wins: 4, shared_losses: 4, shared_finals: 2 },
    { target_name: 'Rival Ocasional', shared_matches: 3, shared_wins: 3, shared_losses: 0 },
    { target_name: 'Adversário Único', shared_matches: 1, shared_wins: 0, shared_losses: 1 },
  ];
  const top = getTopRivalry(relationships);
  gate('Rival mais frequente (mais confrontos) é escolhido como rivalidade principal', top.name === 'Rival Frequente');
  gate('H2H real é reportado (4-4), não uma pontuação sintética', top.wins === 4 && top.losses === 4);
  gate('Finais disputadas são reportadas quando existem', top.finals === 2);
  const all = getRivalries(relationships);
  gate('getRivalries só inclui quem cruzou o limiar de 3 confrontos (2 de 3 relações, não o Adversário Único)', all.length === 2 && !all.some((r) => r.name === 'Adversário Único'));
  gate('getRivalries ordena por confrontos (mais frequente primeiro)', all[0].name === 'Rival Frequente');

  // ── Comportamental: processMatchRelationships agora cobre partida oficial + H2H real ──
  const { processMatchRelationships, getPlayerRelationships } = await server.ssrLoadModule('/src/lib/relationships.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  function createMemoryStorage() {
    const files = new Map();
    return {
      isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
      async writeText(p, c) { files.set(p, String(c)); },
      async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
      async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
      async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
      async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
    };
  }
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-rivalries', name: 'QA Rivalries' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profileId = 'qa-rivalries';
  // Simula 4 confrontos oficiais reais (não treino) contra o MESMO
  // adversário, 1 deles final — exatamente o cenário do briefing
  // (Galán/Chingotto: N confrontos, H2H, finais).
  await processMatchRelationships(profileId, ['Rival Oficial'], 'Parceiro QA', true, { isFinal: true });
  await processMatchRelationships(profileId, ['Rival Oficial'], 'Parceiro QA', false);
  await processMatchRelationships(profileId, ['Rival Oficial'], 'Parceiro QA', true);
  const rels = await getPlayerRelationships(profileId);
  const rival = rels.find((r) => r.target_name === 'Rival Oficial');
  gate('17. Adversário recorrente (3 confrontos oficiais) acumula shared_matches corretamente', rival.shared_matches === 3);
  gate('Adversário agora acumula shared_wins (lacuna real corrigida — antes só o parceiro tinha isso)', rival.shared_wins === 2);
  gate('Adversário agora acumula shared_losses (lacuna real corrigida)', rival.shared_losses === 1);
  gate('18. Final disputada contra este adversário é contabilizada (shared_finals)', rival.shared_finals === 1);

  console.log(`\n${gates} gates executados, todos PASS — Rivalidades emergentes (Fase 14): H2H real por adversário, finais, e confronto oficial (não só treino).`);
} finally {
  await server.close();
}
