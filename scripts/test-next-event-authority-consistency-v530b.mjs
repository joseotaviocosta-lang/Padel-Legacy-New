// Hotfix 5.30-B — ONE AUTHORITY FOR NEXT EVENT. Para o mesmo save e a mesma
// data, header, Home e Torneios concordam sobre o próximo evento. Cobre
// também o refresh do header (calendário mudou sem o dia mudar), o clique
// (página geral de Torneios) e save/reload.
import { CAREER_START, campaignEvent, gateRunner, liveRun, readSource, registrationEvent, surfaces, withNextEventModules } from './lib/v530bNextEventKit.mjs';

const { gate, finish } = gateRunner('test-next-event-authority-consistency-v530b');

await withNextEventModules(async (mods) => {
  const { preseason, season, london, world } = mods;
  const states = {
    'A pré-temporada aberta': { tournaments: world, careerDate: CAREER_START, expect: preseason.id },
    'B inscrito na pré-temporada': { tournaments: world, calendarEvents: [registrationEvent(preseason)], careerDate: '2026-01-05', expect: preseason.id },
    'C pré-temporada em andamento': { tournaments: world, calendarEvents: [campaignEvent(preseason)], careerDate: '2026-01-12', expect: preseason.id },
    'D pré-temporada concluída': { tournaments: world.map((t) => (t.id === preseason.id ? { ...t, status: 'finalizado', champion: 'X' } : t)), calendarEvents: [campaignEvent(preseason, { round: 2, status: 'champion', eventStatus: 'completed' })], careerDate: '2026-01-14', expect: london.id },
    'E sem pré-temporada': { tournaments: season, careerDate: CAREER_START, expect: london.id },
  };
  let n = 0;
  for (const [label, state] of Object.entries(states)) {
    const s = surfaces(mods, state);
    n += 1;
    gate(`${n}. ${label}: autoridade = esperado`, s.next?.tournamentId === state.expect, s.next?.name);
    gate(`${n}b. ${label}: header = autoridade`, s.headerCtx.tournamentId === s.next?.tournamentId, s.headerCtx.label.full);
    gate(`${n}c. ${label}: Home (próximo torneio) = autoridade`, s.homeNext?.id === s.next?.tournamentId);
    if (s.next?.kind === 'open') {
      gate(`${n}d. ${label}: Torneios ("Próximo evento") = autoridade`, s.tournamentsPageOpen?.id === s.next.tournamentId);
      gate(`${n}e. ${label}: Home sem compromisso cita o mesmo evento`, s.homeFree.meta.includes(s.next.name), s.homeFree.meta);
    }
  }

  // Save/reload: os mesmos dados serializados/deserializados (como o save
  // faz) dão a mesma resposta.
  const reloaded = JSON.parse(JSON.stringify({ tournaments: world, calendarEvents: [registrationEvent(preseason)] }));
  const again = mods.authority.selectNextRelevantEvent({ ...reloaded, careerDate: '2026-01-05' });
  gate('6. save/reload: mesma seleção depois de serializar o save', again?.tournamentId === preseason.id && again.kind === 'registered');
});

// As três superfícies usam a MESMA autoridade (sem regra duplicada).
const headerLib = readSource('src/lib/careerHeaderContext.js');
const headerUi = readSource('src/components/career/CareerHeaderContext.jsx');
const hub = readSource('src/pages/CareerHub.jsx');
const page = readSource('src/pages/Tournaments.jsx');
const careerLib = readSource('src/lib/career.js');
const registration = readSource('src/lib/tournamentRegistration.js');
gate('7. header usa selectNextRelevantEvent', headerLib.includes("from '@/lib/nextEventAuthority.js'") && headerLib.includes('selectNextRelevantEvent({ tournaments, calendarEvents, careerDate })'));
gate('8. header não tem mais regra própria de "primeiro por data"', !/tournaments \|\| \[\]\)\s*\n?\s*\.filter\(\(item\) => item\?\.start_date && item\.start_date >= careerDate\)/.test(headerLib));
gate('9. Home usa selectNextRelevantEvent (não upcomingTournaments[0])', hub.includes('selectNextRelevantEvent({ tournaments: upcomingTournaments, calendarEvents: tournamentEvents') && !hub.includes('const nextTournament = upcomingTournaments[0];'));
gate('10. Torneios usa selectNextOpenTournament da mesma autoridade', page.includes("import { selectNextOpenTournament } from '@/lib/nextEventAuthority.js'") && page.includes('const nextTournament = selectNextOpenTournament(tournaments, careerDate);'));
gate('11. header recarrega quando o calendário muda (evento) e ao trocar de tela', headerUi.includes('window.addEventListener(TOURNAMENTS_CHANGED_EVENT, refresh)') && headerUi.includes('}, [load, pathname]);'));
gate('12. busca do header continua presa a jogador/dia (Fase 15.6)', headerUi.includes('}, [profileId, careerDate]);'));
gate('13. reconciliação do calendário avisa quando cria/altera torneios', careerLib.includes('if (pendingTournamentUpserts.length || removedObsolete) notifyTournamentsChanged();'));
gate('14. inscrever e cancelar avisam o header', (registration.match(/notifyTournamentsChanged\(\);/g) || []).length === 2);
gate('15. header lê os eventos do jogador do mais novo para o mais antigo', headerUi.includes("event_type: 'tournament' }, '-start_date', 30)"));
gate('16. clique do header continua abrindo a página geral de Torneios', headerUi.includes('<Link to={APP_ROUTES.TOURNAMENTS}') && (headerUi.match(/<Link /g) || []).length === 1 && !headerUi.includes('buildTournamentPlayRoute('));

// App real: as três superfícies concordam em cada passo (inclui reload).
for (const label of ['after-fix-same-career', 'after-fix-new-career']) {
  const run = liveRun(label);
  if (!run) continue;
  const agree = run.steps.every((step) => {
    const name = /Próximo torneio: (.+?) em \d+ dias/.exec(step.header || '')?.[1];
    const other = step.home || step.tournaments || '';
    return name && other.includes(name);
  });
  gate(`17. app real (${label}${run.reload ? ', após reload' : ''}): header, Home e Torneios concordam em todos os passos`, agree);
  gate(`18. app real (${label}): sem erro de JS e atalho aponta para /tournaments`, run.errors.length === 0 && run.headerHref === '/tournaments');
}
finish();
