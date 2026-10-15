// Playthrough 5.27-M — atalho de próximo torneio no header: continua
// mostrando nome/data, mas o toque leva à página geral de Torneios (o evento
// é aberto lá dentro). Vale para desktop e mobile (mesmo componente; o modo
// compacto só encurta o rótulo).
import { readFileSync } from 'node:fs';
import { gateRunner, withModules } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-header-tournament-shortcut-v527m');
const src = readFileSync('src/components/career/CareerHeaderContext.jsx', 'utf8');

await withModules({ ctx: '/src/lib/careerHeaderContext.js', routes: '/src/navigation/routes.js' }, async ({ ctx, routes }) => {
  const profile = { career_date: '2026-01-05', energy: 90, fatigue: 10 };
  const tournaments = [{ id: 't-exh', name: 'Roma Pré-Temporada', start_date: '2026-01-12', end_date: '2026-01-14', tier: 'Exibição' }];
  const calendarEvents = [{ id: 'e1', related_id: 't-exh', event_type: 'tournament', status: 'scheduled', start_date: '2026-01-12', metadata: { registration_id: 'r1' } }];
  const c = ctx.buildCareerHeaderContext({ profile, tournaments, calendarEvents });
  gate('1. header continua identificando o próximo torneio', c.tournamentId === 't-exh' && /Roma/.test(`${c.label?.full} ${c.ariaLabel}`), JSON.stringify(c.label));
  gate('2. rótulo completo (desktop) e compacto (mobile) existem', Boolean(c.label?.full) && Boolean(c.label?.compact));
  gate('3. rota canônica da página geral é /tournaments', routes.APP_ROUTES.TOURNAMENTS === '/tournaments');
});

gate('4. único destino do atalho: <Link to={APP_ROUTES.TOURNAMENTS}>', src.includes('<Link to={APP_ROUTES.TOURNAMENTS}') && (src.match(/<Link /g) || []).length === 1);
gate('5. atalho não abre mais o evento direto (sem deep link de campanha)', !/import[^;]*buildTournamentPlayRoute/.test(src) && !src.includes('buildTournamentPlayRoute(') && !/[?&]tournament=/.test(src));
gate('6. o atalho inteiro é um único alvo (ícone + rótulo dentro do Link)', /<Link[^>]*>\s*\{inner\}\s*<\/Link>/.test(src));
gate('7. aria-label mantém o evento e diz que abre Torneios', src.includes("`${context.ariaLabel || label} — abrir Torneios`"));
finish();
