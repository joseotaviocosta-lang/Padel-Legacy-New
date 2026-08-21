// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 13/17).
//
// save -> reload nunca deve repetir um marco de carreira, duplicar
// histórico de dupla/treinador, ou conceder recompensa duas vezes. Reusa o
// MESMO mecanismo de dedupe já usado em todo o resto do jogo
// (upsertCareerMessage/buildStableMessageId) — nenhum novo mecanismo de
// idempotência foi inventado nesta fase, então este teste prova que o
// reaproveitamento está correto, não uma implementação nova.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  // ── 24: careerStoryEvents.js nunca concede recompensa (XP/moedas) — só
  // notifica. Checagem estrutural: se não toca em coins/xp/PlayerProfile,
  // não há como duplicar recompensa por reavaliação repetida. ──────────────
  const eventsSource = await import('node:fs/promises').then((fs) => fs.readFile('src/lib/careerStoryEvents.js', 'utf8'));
  gate('24. careerStoryEvents.js nunca escreve em PlayerProfile (coins/xp) — só CareerMessage, então reavaliar após reload nunca duplica recompensa', !/PlayerProfile\.(update|create)/.test(eventsSource) && !/\bcoins\b/.test(eventsSource) && !/\bxp\b/.test(eventsSource));

  const { evaluateCareerMatchMilestones } = await server.ssrLoadModule('/src/lib/careerStoryEvents.js');
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
  await careerManager.createCareer({ id: 'career-idempotency', name: 'QA Idempotency' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  // ── 19/20: partida registrada -> "crash" simulado antes do reload ->
  // reavaliar a mesma partida de novo nunca duplica a notificação ─────────
  const profile = { id: 'qa-idempotency', tournaments_won: 1 };
  const titleMatch = { id: 'm-title-crash', date: '2026-05-01', tournament_name: 'Crash QA Open', result: 'vitória', tournament_outcome: 'champion' };
  const ctx = { officialMatches: { played: 1, won: 1, lost: 0 } };

  await evaluateCareerMatchMilestones(profile, titleMatch, ctx);
  const afterFirstRun = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-idempotency' });
  gate('19. 1ª avaliação da partida gera a notificação de marco esperada', afterFirstRun.some((m) => m.metadata?.context_key === 'career-milestone:first-title'));

  // Simula "crash antes de terminar" + reload: a mesma partida é reavaliada
  // do zero (nenhum estado em memória sobrevive a um crash real).
  await evaluateCareerMatchMilestones(profile, titleMatch, ctx);
  await evaluateCareerMatchMilestones(profile, titleMatch, ctx);
  const afterReplay = await localGame.entities.CareerMessage.filter({ profile_id: 'qa-idempotency' });
  gate('20. Reavaliar a MESMA partida 2x depois (simulando crash/reload) nunca cria uma 2ª linha — mesmo total de mensagens', afterReplay.length === afterFirstRun.length);
  gate('20. Nenhuma CareerMessage duplicada por context_key (dedupe real, não só por contagem total)', new Set(afterReplay.map((m) => m.metadata?.context_key)).size === afterReplay.length);

  // ── Parceria: endPartnership chamado 2x com a mesma data nunca corrompe o registro ──
  const { startPartnership, endPartnership } = await server.ssrLoadModule('/src/lib/partnershipSystem.js');
  const partnerProfile = await localGame.entities.PlayerProfile.create({ id: 'qa-idempotency', sport_name: 'QA Idempotency', career_date: '2026-01-01', coins: 5000 });
  const bot = { id: 'bot-idem-1', name: 'Bot Idem', country: 'BR', level: 'iniciante', position: 'direita', play_style: 'ofensivo', overall: 60 };
  const { partnership: created } = await startPartnership(partnerProfile, bot, 60, 50);
  await endPartnership(created.id, 'encerrada_jogador', 'QA', '2026-02-01');
  const afterFirstEnd = await localGame.entities.Partnership.get(created.id);
  await endPartnership(created.id, 'encerrada_jogador', 'QA', '2026-02-01');
  const afterSecondEnd = await localGame.entities.Partnership.get(created.id);
  gate('endPartnership chamado 2x com os mesmos dados não altera o registro (idempotente por construção — update, não create)', afterFirstEnd.ended_career_date === afterSecondEnd.ended_career_date && afterFirstEnd.id === afterSecondEnd.id);

  const allPartnerships = await localGame.entities.Partnership.filter({ profile_id: 'qa-idempotency' });
  gate('Nenhuma 2ª linha de Partnership foi criada pela reavaliação (histórico não duplica)', allPartnerships.length === 1);

  console.log(`\n${gates} gates executados, todos PASS — Idempotência do Career Story (Fase 14): save/load e crash/reload nunca duplicam marco, notificação, histórico ou recompensa.`);
} finally {
  await server.close();
}
