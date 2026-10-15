// Playthrough 5.27-M — card do torneio depois da campanha do jogador:
// "Eliminado" enquanto o torneio segue (a chave ainda revela rodadas por
// data) e "Concluído" quando o torneio termina (fix da 5.27-K preservado,
// nunca "Não participante"). Também confere que o fix de estado antigo da
// página de Torneios (5.27-K) continua no lugar.
import { readFileSync } from 'node:fs';
import { gateRunner, withModules } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-completed-tournament-card-v527m');

await withModules({ reg: '/src/lib/tournamentRegistrationState.js', card: '/src/lib/tournamentCardState.js' }, async ({ reg, card }) => {
  const S = reg.TOURNAMENT_REGISTRATION_STATE;
  const registration = { status: 'completed', tournament_id: 't1' };
  const running = { id: 't1', tier: 'Exibição', start_date: '2026-01-12', end_date: '2026-01-14', status: 'em_andamento', current_phase: 'eliminated', bracket_schema_version: 2, bracket_history: [{ matches: [{}] }] };
  const done = { ...running, status: 'finalizado', current_phase: 'concluido', champion: 'X & Y' };
  const label = (state) => card.getTournamentCardPresentation(card.resolveTournamentCardState({ registrationState: state })).label;

  const mid = reg.getPlayerTournamentRegistrationState({ tournament: running, registration, careerDate: '2026-01-12' });
  gate('1. eliminado com torneio em andamento → "Eliminado"', mid === S.ELIMINATED && label(mid) === 'Eliminado', `${mid}/${label(mid)}`);
  const end = reg.getPlayerTournamentRegistrationState({ tournament: done, registration, careerDate: '2026-01-15' });
  gate('2. torneio concluído → "Concluído"', end === S.COMPLETED && label(end) === 'Concluído', `${end}/${label(end)}`);
  gate('3. nunca "Não participante" para quem disputou', ![mid, end].includes(S.NOT_REGISTERED) && ![mid, end].includes(S.REGISTRATION_CLOSED));
  const champ = reg.getPlayerTournamentRegistrationState({ tournament: done, registration, careerDate: '2026-01-14' });
  gate('4. campeão (torneio finalizado na final) → "Concluído"', champ === S.COMPLETED);
  gate('5. "Eliminado" e "Concluído" seguem estados de participação', reg.isPlayerParticipating(mid) && reg.isPlayerParticipating(end));
});

const page = readFileSync('src/pages/Tournaments.jsx', 'utf8');
gate('6. fix 5.27-K preservado: refreshCampaignState existe', page.includes('async function refreshCampaignState('));
gate('7. fix 5.27-K preservado: recarrega quando career_date muda sem sair da página', page.includes('lastLoadedDateRef') && /\[profile\?\.id, profile\?\.career_date, loading\]/.test(page));
finish();
