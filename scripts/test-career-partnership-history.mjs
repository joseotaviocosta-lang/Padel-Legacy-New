// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 6/17).
//
// Prova o bug real encontrado na auditoria: endPartnership() sempre gravava
// ended_career_date = started_career_date (nenhum dos 4 call sites reais
// passava uma data de término), fazendo toda parceria encerrada no jogo
// mostrar "período junto" igual a 0 dias — inviabilizando "parceria mais
// longa"/"melhor parceria" (Partnership já preserva histórico real, só a
// data de fim estava errada). Também prova describePartnershipHistory
// (pura) e a troca de parceiro (cenário 15 do briefing).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { describePartnershipHistory } = await server.ssrLoadModule('/src/lib/careerStory.js');

  // ── describePartnershipHistory: pura, a partir de linhas já buscadas ────
  gate('Sem parcerias, retorna nulos em tudo (nunca inventa)', JSON.stringify(describePartnershipHistory([])) === JSON.stringify({ bestByTitles: null, mostMatches: null, longest: null }));
  const partnerships = [
    { id: 'p1', partner_name: 'Curta e Intensa', started_career_date: '2026-01-01', ended_career_date: '2026-02-01', shared_matches: 30, shared_wins: 20, shared_titles: 3, status: 'encerrada_jogador' },
    { id: 'p2', partner_name: 'Longa Duração', started_career_date: '2025-01-01', ended_career_date: '2026-06-01', shared_matches: 15, shared_wins: 8, shared_titles: 0, status: 'encerrada_contrato' },
    { id: 'p3', partner_name: 'Mais Partidas', started_career_date: '2026-03-01', ended_career_date: '2026-04-01', shared_matches: 50, shared_wins: 25, shared_titles: 1, status: 'encerrada_jogador' },
  ];
  const summary = describePartnershipHistory(partnerships);
  gate('Melhor parceria por títulos é a de mais títulos, não a de mais partidas', summary.bestByTitles.name === 'Curta e Intensa');
  gate('Parceiro com mais partidas é identificado corretamente', summary.mostMatches.name === 'Mais Partidas');
  gate('19. Parceria mais longa é calculada pela DURAÇÃO real (dias), não pelo número de partidas', summary.longest.name === 'Longa Duração' && summary.longest.durationDays === 516);

  // ── Comportamental: bug real de endPartnership corrigido ────────────────
  const { startPartnership, endPartnership } = await server.ssrLoadModule('/src/lib/partnershipSystem.js');
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
  await careerManager.createCareer({ id: 'career-partnership', name: 'QA Partnership' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profile = await localGame.entities.PlayerProfile.create({ id: 'qa-partnership', sport_name: 'QA Partnership', career_date: '2026-01-01', coins: 5000 });
  const bot = { id: 'bot-partner-1', name: 'Bot Parceiro 1', country: 'BR', level: 'iniciante', position: 'direita', play_style: 'ofensivo', overall: 60 };
  const { partnership: created } = await startPartnership(profile, bot, 60, 50);
  gate('startPartnership cria uma Partnership real e ativa', created?.status === 'ativa');

  const endedDate = '2026-03-15';
  await endPartnership(created.id, 'encerrada_jogador', 'Decisão do jogador (QA)', endedDate);
  const ended = await localGame.entities.Partnership.get(created.id);
  gate('BUG BLOQUEADO: ended_career_date agora é a data REAL de término (2026-03-15), não mais igual a started_career_date', ended.ended_career_date === endedDate && ended.ended_career_date !== ended.started_career_date);
  gate('Duração real da parceria encerrada agora é > 0 dias (antes do fix, sempre 0)', describePartnershipHistory([ended]).longest.durationDays > 0);

  // ── 15: troca de parceiro encerra a anterior corretamente com a data real ──
  const bot2 = { id: 'bot-partner-2', name: 'Bot Parceiro 2', country: 'AR', level: 'iniciante', position: 'esquerda', play_style: 'defensivo', overall: 62 };
  const profileWithDate = { ...profile, career_date: '2026-05-01', partner_id: null };
  const { partnership: second } = await startPartnership(profileWithDate, bot2, 60, 50);
  gate('15. Nova parceria criada com sucesso (troca de parceiro)', second?.status === 'ativa');
  const firstAfterSwitch = await localGame.entities.Partnership.get(created.id);
  gate('15. Parceria anterior à troca permanece com seu próprio fim já registrado (não sobrescrita pela troca seguinte)', firstAfterSwitch.status === 'encerrada_jogador' && firstAfterSwitch.ended_career_date === endedDate);

  console.log(`\n${gates} gates executados, todos PASS — Histórico de parcerias (Fase 14): duração real corrigida, melhor parceria/mais partidas/mais longa, troca de parceiro preserva histórico.`);
} finally {
  await server.close();
}
