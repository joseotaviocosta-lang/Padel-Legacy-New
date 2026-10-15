// Playthrough 5.27-M — texto do tutorial == condição de conclusão.
// "Inscreva-se em um torneio" conclui na inscrição confirmada; "Jogue sua
// primeira partida de torneio" conclui na primeira partida oficial (a
// Pré-Temporada vale) e, enquanto o jogador está inscrito sem chave, o CTA
// não volta a dizer "Inscrever-se".
import { readFileSync } from 'node:fs';
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';
import { gateRunner, onboarding } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-tutorial-registration-condition-v527m');

const steps = readFileSync('src/onboarding/tutorialSteps.js', 'utf8');
gate('1. etapa de inscrição continua "Inscreva-se em um torneio" (objetivo join_tournament)', /step\('tournament-registered', 'join_tournament', 'Inscreva-se em um torneio'/.test(steps));
gate('2. etapa seguinte diz "Jogue sua primeira partida de torneio" (objetivo play_matches)', /step\('first-match', 'play_matches', 'Jogue sua primeira partida de torneio'/.test(steps));
gate('3. texto não afirma mais que a Pré-Temporada não conta', !/Exibição de pré-temporada é um bom aquecimento, mas esta etapa pede/.test(steps));
gate('4. recompensas das duas etapas inalteradas (150 + 150)', (steps.match(/reward: \{ xp: 100, coins: 150 \}/g) || []).length === 2);

for (const variant of ['continuous', 'reload']) {
  const run = onboarding(variant);
  const registered = run.tutorialLog.find((t) => t.event === 'registered');
  gate(`5. [${variant}] inscrição conclui a etapa de inscrição na hora (etapa atual vira first-match)`, registered?.currentStepId === 'first-match', registered?.currentStepId);
  gate(`6. [${variant}] recompensa da inscrição paga (não silenciosa) uma vez`, (registered?.rewarded || []).filter((r) => r.key === 'tutorial-tournament-registered' && !r.silent).length === 1);
  const afterMatch = run.tutorialLog.find((t) => t.event === 'after-match-0');
  gate(`7. [${variant}] primeira partida (Pré-Temporada) conclui first-match`, afterMatch && afterMatch.currentStepId !== 'first-match', afterMatch?.currentStepId);
}

// CTA do Home/Guia/Missões com o jogador inscrito e sem chave (antes do D-3).
installDeterminism('v527m-tutorial');
const storage = new MemoryStorage(new Map());
const rt = await bootRuntime(storage);
const A = await act.loadActionModules(rt);
const created = await createRealCareer(rt, { saveName: 'Tutorial 527M' });
let profile = (await act.completeOnboarding(rt, A, created.profile, { side: 'direita', style: A.initialProfiles.PLAY_STYLE_OPTIONS[0].id, name: 'Atleta Tutorial' })).profile;
await act.ensurePartner(rt, A, profile, (rows) => rows[0]);
profile = await rt.localGame.entities.PlayerProfile.get(profile.id);
await A.career.ensureFutureTournaments(profile.career_date);
const exhibition = (await rt.localGame.entities.Tournament.list('start_date', 3000)).find((t) => t.tier === 'Exibição');
const { resolveFirstMatchAction } = await rt.load('/src/onboarding/firstMatchDestination.js');
const before = await resolveFirstMatchAction(profile, created.careerId);
gate('8. sem inscrição o CTA pede inscrição', before.cta === 'Inscrever-se em um torneio');
const reg = await act.tryRegister(rt, A, profile, exhibition, A.career.getPartnerBot(profile));
gate('9. inscrição na Pré-Temporada confirmada', reg.ok, reg.reason);
const after = await resolveFirstMatchAction(await rt.localGame.entities.PlayerProfile.get(profile.id), created.careerId);
gate('10. inscrito e sem chave: CTA NÃO diz "Inscrever-se"', !/Inscrever/.test(after.cta), after.cta);
gate('11. descrição diz que a etapa conclui ao jogar a partida', /conclui quando você jogar/.test(after.description), after.description);
await rt.close();
finish();
