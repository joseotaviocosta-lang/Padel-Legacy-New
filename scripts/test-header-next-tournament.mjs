// Hotfix pré-beta — Page chrome cleanup (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md).
//
// O chip de contexto no cabeçalho global mostrava só "Nome · Xd" sem
// deixar claro que era o PRÓXIMO TORNEIO. Este teste cobre a lógica pura
// extraída para `src/lib/careerHeaderContext.js` (usada por
// `CareerHeaderContext.jsx`) e confirma que o componente ficou clicável
// reaproveitando o deep link canônico (buildTournamentPlayRoute), sem
// lógica de roteamento nova.
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { buildCareerHeaderContext } = await server.ssrLoadModule('/src/lib/careerHeaderContext.js');
  const { buildTournamentPlayRoute } = await server.ssrLoadModule('/src/lib/tournamentNextAction.js');

  const CAREER_DATE = '2026-04-01';
  const baseProfile = { career_date: CAREER_DATE, energy: 80, fatigue: 20 };

  // ── Sem torneio próximo: não pode inventar informação ───────────────────
  const idle = buildCareerHeaderContext({ profile: baseProfile, tournaments: [] });
  gate('Sem torneio próximo não inventa "próximo torneio" falso', idle.kind === 'idle');
  gate('Sem torneio: nenhum tournamentId (não pode virar clicável sem destino real)', idle.tournamentId === null);
  gate('Sem torneio: label conhecido do comportamento existente ("Semana de desenvolvimento")', idle.label.compact === 'Semana de desenvolvimento' && idle.label.full === 'Semana de desenvolvimento');

  // ── Torneio distante (>5 dias): não é "próximo torneio" urgente, mas é clicável ──
  const farTournament = { id: 'roland-garros-open', name: 'Roland Garros Open', start_date: '2026-04-20' };
  const far = buildCareerHeaderContext({ profile: baseProfile, tournaments: [farTournament] });
  gate('Torneio distante (>5 dias) cai no estado "tournament_upcoming"', far.kind === 'tournament_upcoming');
  gate('Torneio distante: dias calculados corretamente (19 dias)', far.daysUntil === 19);
  gate('Torneio distante: tournamentId aponta pro torneio certo', far.tournamentId === farTournament.id);

  // ── Torneio em 13 dias (dentro de 5? não — > 5, então cai no mesmo "upcoming") ──
  const in13 = buildCareerHeaderContext({ profile: baseProfile, tournaments: [{ id: 'vienna-classic', name: 'Viena Classic', start_date: '2026-04-14' }] });
  gate('Torneio em 13 dias: compact mostra nome + dias', in13.label.compact === 'Viena Classic · 13d');
  gate('Torneio em 13 dias: full deixa "Próximo torneio" explícito (item 2/25 do hotfix)', in13.label.full === 'Próximo torneio · Viena Classic · 13d');
  gate('Torneio em 13 dias: aria-label explica dias', in13.ariaLabel === 'Próximo torneio: Viena Classic em 13 dias');

  // ── Torneio urgente (dentro de 5 dias) ───────────────────────────────────
  const soonTournament = { id: 'doha-open', name: 'Doha Open', start_date: '2026-04-04' };
  const soon = buildCareerHeaderContext({ profile: baseProfile, tournaments: [soonTournament] });
  gate('Torneio em 3 dias cai no estado "tournament_soon" (urgente)', soon.kind === 'tournament_soon');
  gate('Torneio em 3 dias: dias corretos', soon.daysUntil === 3);
  gate('Torneio em 3 dias: compact deixa claro (nome + dias)', soon.label.compact === 'Doha Open · 3d');
  gate('Torneio em 3 dias: full deixa "Próximo torneio" explícito', soon.label.full === 'Próximo torneio · Doha Open · 3d');
  gate('Torneio em 3 dias: aria-label correto', soon.ariaLabel === 'Próximo torneio: Doha Open em 3 dias');
  gate('Torneio em 3 dias: tournamentId correto', soon.tournamentId === soonTournament.id);

  // ── Torneio hoje ──────────────────────────────────────────────────────
  const todayTournament = { id: 'wien-open', name: 'Wien Open', start_date: CAREER_DATE };
  const today = buildCareerHeaderContext({ profile: baseProfile, tournaments: [todayTournament] });
  gate('Torneio hoje cai no estado "tournament_today"', today.kind === 'tournament_today');
  gate('Torneio hoje: label "Hoje · Nome" (compact e full)', today.label.compact === 'Hoje · Wien Open' && today.label.full === 'Hoje · Wien Open');
  gate('Torneio hoje: aria-label diz "hoje"', today.ariaLabel === 'Próximo torneio: Wien Open hoje');
  gate('Torneio hoje: dias = 0', today.daysUntil === 0);

  // ── Prioridades: lesão/fadiga/energia continuam por cima de torneio distante ──
  const injuredProfile = { ...baseProfile, injury_status: 'injured', injury_days_remaining: 5 };
  const injured = buildCareerHeaderContext({ profile: injuredProfile, tournaments: [farTournament] });
  gate('Jogador lesionado: contexto é lesão, não torneio (prioridade preservada)', injured.kind === 'injured');
  gate('Jogador lesionado: sem tournamentId (não pode virar clicável para torneio errado)', injured.tournamentId === null);

  const fatiguedProfile = { ...baseProfile, fatigue: 85 };
  const fatigued = buildCareerHeaderContext({ profile: fatiguedProfile, tournaments: [farTournament] });
  gate('Fadiga alta com torneio distante: contexto é fadiga (comportamento existente preservado)', fatigued.kind === 'fatigue');

  const lowEnergyProfile = { ...baseProfile, fatigue: 20, energy: 15 };
  const lowEnergy = buildCareerHeaderContext({ profile: lowEnergyProfile, tournaments: [farTournament] });
  gate('Energia baixa com torneio distante: contexto é energia (comportamento existente preservado)', lowEnergy.kind === 'energy');

  // ── Torneio urgente tem prioridade sobre fadiga/energia (já era assim) ──
  const urgentOverridesFatigue = buildCareerHeaderContext({ profile: fatiguedProfile, tournaments: [soonTournament] });
  gate('Torneio urgente (≤5 dias) tem prioridade sobre fadiga alta', urgentOverridesFatigue.kind === 'tournament_soon');

  // ── Múltiplos torneios: escolhe o mais próximo, ignora os que já passaram ──
  const multi = buildCareerHeaderContext({
    profile: baseProfile,
    tournaments: [
      { id: 'past-one', name: 'Já passou', start_date: '2026-03-20' },
      { id: 'later-one', name: 'Mais tarde', start_date: '2026-04-10' },
      soonTournament,
    ],
  });
  gate('Múltiplos torneios: escolhe o mais próximo (não o primeiro da lista)', multi.tournamentId === soonTournament.id);
  gate('Múltiplos torneios: torneio já passado nunca é escolhido como "próximo"', multi.tournamentId !== 'past-one');

  // ── Componente ficou clicável reaproveitando o deep link canônico ───────
  const componentSrc = readFileSync('src/components/career/CareerHeaderContext.jsx', 'utf8');
  gate('CareerHeaderContext importa buildTournamentPlayRoute (deep link canônico, sem lógica paralela)', componentSrc.includes("buildTournamentPlayRoute") && componentSrc.includes("from '@/lib/tournamentNextAction.js'"));
  gate('CareerHeaderContext usa <Link> quando há tournamentId (chip vira clicável)', /context\.tournamentId[\s\S]{0,200}<Link/.test(componentSrc));
  gate('Destino do clique é exatamente buildTournamentPlayRoute(context.tournamentId)', componentSrc.includes('buildTournamentPlayRoute(context.tournamentId)'));

  console.log(`\n${gates} gates executados, todos PASS.`);
} finally {
  await server.close();
}
