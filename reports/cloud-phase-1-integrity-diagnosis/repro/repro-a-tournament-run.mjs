// CLOUD-1 / Investigação A — reprodução mínima do caso 8 de
// scripts/test-career-persistence-integrity.mjs (tournament_run ausente após
// torneio completo + reload).
//
// NÃO DESTRUTIVA: storage 100% em memória (nenhum arquivo, save real ou
// evidência versionada é tocado). Só lê src/ via Vite SSR.
//
// Uso (na raiz do repo): node reports/cloud-phase-1-integrity-diagnosis/repro/repro-a-tournament-run.mjs [--out=<arquivo.json>]
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const teamRank = Number(process.argv.find((a) => a.startsWith('--team-rank='))?.split('=')[1] || 200); // 200 = valor do teste original

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') {
    const prefix = dir && dir !== '.' ? `${dir}/` : '';
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).filter((r) => r && !r.includes('/')).map((name) => ({ name, isDirectory: false }));
  }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const report = { scenario: 'test-career-persistence-integrity §8', timeline: [], drawProbe: null, persisted: null, reloaded: null };
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { registerTournament } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { isTournamentDrawDue, ensureTournamentDraw, getTournamentDrawAnchorDate } = await vite.ssrLoadModule('/src/lib/tournamentDraw.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const storage = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Novo Atleta' });
  activeCareerAdapter.setActiveCareer(career);
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  await activeCareerAdapter.createPlayerProfile({
    id: 'repro-a-player', sport_name: 'repro-a', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
  });
  const profile0 = await localGame.entities.PlayerProfile.get('repro-a-player');

  // Mesmo torneio do teste: só id, nome, tier, start_date, status.
  const tournament = await localGame.entities.Tournament.create({ id: 'tournament-reload-t1', name: 'Reload Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
  const reg = await registerTournament({ player: profile0, partner, tournament, teamRank });
  report.teamRank = teamRank; report.registration = { success: reg?.success ?? null, reasons: reg?.reasons ?? null, warnings: reg?.warnings ?? null, validation: reg?.validation ?? null };

  const snap = async (label, profile) => {
    const t = await localGame.entities.Tournament.get(tournament.id).catch(() => null);
    const events = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id })).filter((e) => e.related_id === tournament.id);
    return {
      label,
      career_date: profile.career_date,
      tournament: t && { status: t.status, start_date: t.start_date, end_date: t.end_date ?? null, draw_date: t.draw_date ?? null, draw_pending_reason: t.draw_pending_reason ?? null, participants: Array.isArray(t.participants) ? t.participants.length : null },
      calendarEvents: events.map((e) => ({ id: e.id, status: e.status, event_type: e.event_type, start_date: e.start_date, metadataKeys: Object.keys(e.metadata || {}).sort(), hasRun: Boolean(e.metadata?.tournament_run), drawAnchor: t ? getTournamentDrawAnchorDate(e, t) : null, drawDue: t ? isTournamentDrawDue(e, t, profile.career_date) : null })),
    };
  };

  let current = profile0;
  report.timeline.push(await snap('após inscrição', current));
  let guard = 0;
  while (current.career_date < '2026-01-08' && guard++ < 20) {
    current = await advanceCareerDay(current, {});
    report.timeline.push(await snap('após advanceCareerDay', current));
  }

  // Sonda: chama o MESMO ponto de criação do sorteio, mas SEM o
  // `.catch(() => null)` de calendarSystem.js, para expor a exceção engolida.
  const t = await localGame.entities.Tournament.get(tournament.id);
  const event = (await localGame.entities.CalendarEvent.filter({ profile_id: current.id })).find((e) => e.related_id === tournament.id && e.event_type === 'tournament');
  const probeDate = event && t ? getTournamentDrawAnchorDate(event, t) : null;
  try {
    const r = await ensureTournamentDraw({ profile: { ...current, career_date: probeDate || current.career_date }, tournament: t, calendarEvent: event });
    report.drawProbe = { probeDate, threw: false, created: r.created, drawn: r.drawn, hasRun: Boolean(r.run) };
  } catch (error) {
    report.drawProbe = { probeDate, threw: true, error: String(error?.message || error), stack: String(error?.stack || '').split('\n').slice(0, 8).map((l) => l.trim()) };
  }

  // Conteúdo persistido (o JSON que está no "disco" em memória) e reload.
  const careerFile = [...storage.files.keys()].find((k) => k.startsWith('careers/') && k.endsWith(`${career.career_id}.json`));
  const persisted = careerFile ? JSON.parse(storage.files.get(careerFile)) : null;
  report.persisted = persisted && { file: careerFile, save_version: persisted.save_version, calendarEventsForTournament: (persisted.entities?.CalendarEvent || []).filter((e) => e.related_id === tournament.id).map((e) => ({ id: e.id, status: e.status, hasRun: Boolean(e.metadata?.tournament_run), metadataKeys: Object.keys(e.metadata || {}).sort() })) };
  const reloaded = await manager.loadCareer(career.career_id);
  const reloadedEvent = (reloaded.entities.CalendarEvent || []).find((e) => e.related_id === tournament.id);
  report.reloaded = { hasEvent: Boolean(reloadedEvent), hasRun: Boolean(reloadedEvent?.metadata?.tournament_run), status: reloadedEvent?.status ?? null };
} finally {
  await vite.close();
}
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
