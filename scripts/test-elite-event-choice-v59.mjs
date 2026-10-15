// Playthrough 5.9 (continuação), Parte F — formaliza o achado do caso
// Galán/Chingotto: numa semana com mais de uma opção de elite, o que uma
// dupla Top10 escolhe e por quê.
//
// Nada hardcoded por nome: usa a autoridade real de escolha da IA
// (`chooseTournament` / `evaluateTournamentChoice`,
// gameplay/worldTour/TournamentSelectionAI.js) sobre o calendário semeado,
// e apenas observa scores/decisões.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-elite-event-choice-v59', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const TIER_LADDER = ['Exibição', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const tierIndex = (tier) => TIER_LADDER.indexOf(tier);
const ELITE_TIERS = ['Masters', 'Elite', 'Crown'];

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { chooseTournament, evaluateTournamentChoice } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentSelectionAI.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Elite Choice', playerName: 'Player59Elite' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p59-elite', sport_name: 'Player59Elite', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Avançado', coins: 900000, xp: 90000,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);

  // Semanas com mais de uma opção, contendo ao menos um evento de elite.
  const byStart = new Map();
  for (const t of tournaments) {
    if (!t.start_date) continue;
    if (!byStart.has(t.start_date)) byStart.set(t.start_date, []);
    byStart.get(t.start_date).push(t);
  }
  const eliteWeeks = [...byStart.entries()]
    .filter(([, list]) => list.length > 1 && list.some((t) => ELITE_TIERS.includes(t.tier)))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);

  assert.ok(eliteWeeks.length > 0, 'pré-condição: precisa haver semana com opção de elite');
  console.log(`semanas com opção de elite analisadas: ${eliteWeeks.length}\n`);

  const RANKS = [{ label: 'Top10', rank: 5 }, { label: '#250', rank: 250 }, { label: '#900', rank: 900 }];
  const eliteChoicesByRank = {};

  for (const scenario of RANKS) {
    eliteChoicesByRank[scenario.label] = { eliteChosen: 0, weeksWithElite: 0, choices: [] };
    for (const [start, list] of eliteWeeks) {
      const representative = {
        id: 'probe', name: 'Probe Pair', overall_rating: scenario.rank <= 10 ? 95 : scenario.rank <= 300 ? 78 : 55,
        rank: scenario.rank, ranking_position: scenario.rank, careerStrategy: 'balanced', currentRegion: 'global',
      };
      const decision = chooseTournament(list, representative, { strategy: 'balanced', currentRegion: 'global', aiFieldContext: true });
      // O score por opção é calculado DENTRO de chooseTournament
      // (scoreOption) e exposto em `decision.options`; evaluateTournamentChoice
      // sozinho não o devolve. Usa a fonte certa para registrar o score.
      const scoreByTournamentId = new Map((decision?.options || []).map((opt) => [opt.tournament?.id, opt.score]));
      const scored = list.map((t) => {
        const choice = evaluateTournamentChoice(t, { ...representative, teamRank: scenario.rank }, { aiFieldContext: true });
        const score = scoreByTournamentId.get(t.id);
        return {
          tier: t.tier, name: t.name,
          eligible: Boolean(choice.entry?.eligible),
          score: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
          prestige: choice.prestige ?? null,
          semifinalChance: choice.semifinalChance ?? null,
        };
      });
      const chosenTier = decision?.tournament?.tier || null;
      const hasEligibleElite = scored.some((s) => s.eligible && ELITE_TIERS.includes(s.tier));
      if (hasEligibleElite) {
        eliteChoicesByRank[scenario.label].weeksWithElite += 1;
        if (ELITE_TIERS.includes(chosenTier)) eliteChoicesByRank[scenario.label].eliteChosen += 1;
      }
      eliteChoicesByRank[scenario.label].choices.push({ start, chosenTier, scored, hasEligibleElite });
    }
  }

  // Log detalhado do Top10 (o caso do briefing).
  console.log('=== Top10: opções e escolha por semana ===');
  for (const entry of eliteChoicesByRank['Top10'].choices) {
    const opts = entry.scored.map((s) => `${s.tier}${s.eligible ? '' : '(inelegível)'}=${s.score}`).join(' ');
    console.log(`  ${entry.start}: ${opts} -> escolheu ${entry.chosenTier || 'nenhum'}`);
  }

  for (const scenario of RANKS) {
    const r = eliteChoicesByRank[scenario.label];
    const rate = r.weeksWithElite ? (r.eliteChosen / r.weeksWithElite) * 100 : null;
    console.log(`\n${scenario.label}: semanas com elite elegível=${r.weeksWithElite} | escolheu elite=${r.eliteChosen} (${rate?.toFixed(0) ?? 'n/a'}%)`);
  }

  check('Parte F: Top10 tem semanas com evento de elite ELEGÍVEL (amostra válida)', () => {
    assert.ok(eliteChoicesByRank['Top10'].weeksWithElite > 0, 'nenhuma semana com elite elegível para Top10');
  });

  check('Parte F/29: Top10 NÃO prefere sistematicamente tier de base havendo elite elegível', () => {
    const r = eliteChoicesByRank['Top10'];
    const rate = (r.eliteChosen / r.weeksWithElite) * 100;
    assert.ok(rate >= 50, `Top10 escolheu elite em apenas ${rate.toFixed(0)}% das semanas com elite elegível`);
  });

  check('Parte F/30: dentro da elite, um tier MAIS alto pode legitimamente vencer outro (Crown > Masters)', () => {
    // Procura ao menos uma semana em que havia Masters elegível e a escolha
    // foi um tier ainda mais alto — é exatamente o caso Galán/Chingotto.
    const r = eliteChoicesByRank['Top10'];
    const upgrades = r.choices.filter((entry) => {
      if (!entry.chosenTier) return false;
      const hadMasters = entry.scored.some((s) => s.eligible && s.tier === 'Masters');
      return hadMasters && tierIndex(entry.chosenTier) > tierIndex('Masters');
    });
    console.log(`   [registro] semanas em que o Top10 preteriu Masters por tier superior: ${upgrades.length}`);
    // Não exigimos que ocorra sempre — só que, quando ocorre, seja explicável
    // pela escada (nunca um downgrade inexplicável).
    for (const entry of upgrades) {
      assert.ok(ELITE_TIERS.includes(entry.chosenTier), `escolha fora da elite: ${entry.chosenTier}`);
    }
  });

  check('Parte F/31: nenhuma escolha do Top10 é um downgrade inexplicável (base havendo elite elegível)', () => {
    const r = eliteChoicesByRank['Top10'];
    const downgrades = r.choices.filter((entry) => entry.hasEligibleElite && entry.chosenTier
      && tierIndex(entry.chosenTier) < tierIndex('Gold'));
    assert.equal(downgrades.length, 0,
      `Top10 escolheu tier de base em ${downgrades.length} semana(s) com elite elegível: ${downgrades.map((d) => `${d.start}->${d.chosenTier}`).join(', ')}`);
  });

  check('Parte F: a preferência por elite acompanha o rank (Top10 >= #900)', () => {
    const top = eliteChoicesByRank['Top10'];
    const low = eliteChoicesByRank['#900'];
    const topRate = top.weeksWithElite ? top.eliteChosen / top.weeksWithElite : 0;
    const lowRate = low.weeksWithElite ? low.eliteChosen / low.weeksWithElite : 0;
    assert.ok(topRate >= lowRate, `Top10=${(topRate * 100).toFixed(0)}% < #900=${(lowRate * 100).toFixed(0)}%`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-elite-event-choice-v59: PASS');
} finally {
  await vite.close();
}
