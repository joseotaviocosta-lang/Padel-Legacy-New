// Fase 3, item 3E.1/3E.2 — migração de carreiras salvas de ANTES da escada
// de 9 tiers (era 6, `main_draw_size` até 64) pra depois dela.
//
// Não existe uma "migração" escrita nesta fase porque o mecanismo já
// existia: ensureFutureTournamentsInternal (career.js) já reconcilia o
// calendário a cada chamada, comparando o `circuit_code` desejado (gerado
// pela config ATUAL) contra o que já existe. Como o `circuit_code` embute
// a semana do WEEK_PROGRAM (achado: a nova distribuição de 80 eventos usa
// semanas DIFERENTES da antiga de 24), nenhum torneio PENDENTE antigo bate
// com o novo calendário — e a mesma lógica que já existia pra podar
// "torneios obsoletos que não fazem mais parte da temporada enxuta" cuida
// de removê-los, com a MESMA proteção que sempre teve: nunca remove um
// torneio com resultado (`status:'finalizado'`) ou com inscrição do
// jogador (`participants.length>0`).
//
// Este teste prova que essa proteção realmente segura a migração
// específica desta fase (tiers antigos com `main_draw_size:64`, sem os
// campos novos como `champion_athlete_ids`/`is_exhibition`).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

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

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { ensureFutureTournaments } = await server.ssrLoadModule('/src/lib/career.js');
  const { TOURNAMENT_TIER_CONFIG } = await server.ssrLoadModule('/src/lib/circuitCatalog.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-migration-fase3', name: 'QA Migration Fase 3' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const careerDate = '2026-01-01';

  // (a) Torneio antigo JÁ JOGADO (fato histórico — tier antigo, chave de
  // 64 que não existe mais na escada nova, sem champion_athlete_ids).
  await localGame.entities.Tournament.create({
    id: 'old-finished-masters', circuit_code: 'IST-MAS-W12-1', name: 'Istambul Masters 2025',
    tier: 'Masters', main_draw_size: 64, status: 'finalizado', champion: 'Duo Antigo',
    start_date: '2025-03-20', year: 2025, world_tour_event: true, participants: [],
  });

  // (b) Torneio antigo PENDENTE, sem inscrição do jogador — deve ser
  // limpo e substituído pelo calendário novo (não faz sentido um jogador
  // ver uma chave de 64 que a config atual não produz mais).
  await localGame.entities.Tournament.create({
    id: 'old-pending-unregistered', circuit_code: 'MAD-MAS-W08-1', name: 'Madri Masters (antigo)',
    tier: 'Masters', main_draw_size: 64, status: 'inscricoes', champion: null,
    start_date: '2026-02-20', year: 2026, world_tour_event: true, participants: [],
  });

  // (c) Torneio antigo PENDENTE, COM inscrição do jogador — carreira em
  // andamento, já comprometida com esse torneio específico. Não pode
  // sumir nem mudar de regra no meio da campanha.
  await localGame.entities.Tournament.create({
    id: 'old-pending-registered', circuit_code: 'BCN-MAS-W10-1', name: 'Barcelona Masters (antigo)',
    tier: 'Masters', main_draw_size: 64, status: 'inscricoes', champion: null,
    start_date: '2026-03-05', year: 2026, world_tour_event: true,
    participants: [{ profile_id: 'qa-player', partner_id: 'bot-1' }],
  });

  const result = await ensureFutureTournaments(careerDate);
  gate('ensureFutureTournaments não lança erro processando um save com tiers/campos antigos', !result.error);

  const finished = await localGame.entities.Tournament.get('old-finished-masters');
  gate('(a) Torneio já finalizado sobrevive intacto (história permanente, main_draw_size antigo preservado)', finished && finished.status === 'finalizado' && finished.main_draw_size === 64 && finished.champion === 'Duo Antigo');

  const unregistered = await localGame.entities.Tournament.get('old-pending-unregistered').catch(() => null);
  gate('(b) Torneio pendente SEM inscrição do jogador é removido (calendário antigo não existe mais)', !unregistered);

  const registered = await localGame.entities.Tournament.get('old-pending-registered');
  gate('(c) Torneio pendente COM inscrição do jogador sobrevive intacto (carreira em andamento não quebra)', registered && registered.status === 'inscricoes' && registered.main_draw_size === 64 && registered.participants.length === 1);

  const allTournaments = (await localGame.entities.Tournament.list(null, 500)) || [];
  const newTournaments = allTournaments.filter((t) => !['old-finished-masters', 'old-pending-unregistered', 'old-pending-registered'].includes(t.id));
  gate('Calendário novo (9 tiers) foi gerado normalmente ao lado dos torneios antigos preservados', newTournaments.length > 0);
  gate('Pelo menos um torneio Bronze (tier novo) existe no calendário gerado', newTournaments.some((t) => t.tier === 'Bronze'));
  gate('Todo torneio novo tem main_draw_size dentro da escada atual (nenhum 64 sobrevivente fora dos preservados)', newTournaments.every((t) => t.main_draw_size <= 32));

  const exhibitions = newTournaments.filter((t) => t.is_exhibition);
  gate('Exatamente 1 evento de Exibição/Pré-Temporada foi criado', exhibitions.length === 1);
  gate('A Exibição não tem pontos de ranking', exhibitions[0].rank_points === 0);
  gate('A Exibição não é world_tour_event (não entra na simulação de fundo nem na poda de obsoletos)', exhibitions[0].world_tour_event === false);

  // Idempotência: chamar de novo não duplica a Exibição nem re-processa
  // torneios antigos indevidamente.
  const result2 = await ensureFutureTournaments(careerDate);
  const allTournaments2 = (await localGame.entities.Tournament.list(null, 500)) || [];
  const exhibitions2 = allTournaments2.filter((t) => t.is_exhibition);
  gate('Chamar ensureFutureTournaments de novo não cria uma segunda Exibição', exhibitions2.length === 1);
  gate('Torneio antigo com inscrição continua intacto após a segunda chamada', (await localGame.entities.Tournament.get('old-pending-registered'))?.status === 'inscricoes');

  gate('Config de tier tem os 9 tiers esperados (Bronze...Legacy Finals)', ['Bronze', 'Silver', 'Gold', 'Platinum', 'Circuit Finals', 'Masters', 'Elite', 'Crown', 'Legacy Finals'].every((tier) => Boolean(TOURNAMENT_TIER_CONFIG[tier])));

  console.log(`\n${gates} gates executados, todos PASS — Fase 3, item 3E: migração de carreira salva de antes da escada de 9 tiers não quebra.`);
} finally {
  await server.close();
}
