// Playthrough 5.27-M — draw → save → reload → play → settle → save → reload
// → chave histórica: idêntica ao fluxo contínuo (repro headless do
// playtest, mesma seed, com e sem recarregar o runtime).
import { gateRunner, onboarding } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-historical-bracket-after-reload-v527m');
const continuous = onboarding('continuous');
const reload = onboarding('reload');
const at = (run, moment) => run.bracketMoments.find((m) => m.moment === moment);
const raw = (m) => JSON.stringify(m?.raw);

gate('1. o cenário com reload recarregou o runtime após inscrição, sorteio e settlement', ['reload:after-registration', 'reload:after-draw', 'reload:after-settlement', 'reload:final'].every((e) => reload.tutorialLog.some((t) => t.event === e)));
gate('2. sorteio idêntico com e sem reload', raw(at(reload, 'post-draw')) === raw(at(continuous, 'post-draw')));
gate('3. sorteio idêntico antes e depois do reload pós-sorteio', raw(at(reload, 'post-draw')) === raw(at(reload, 'post-draw-reload')));
gate('4. chave histórica final idêntica com e sem reload', raw(at(reload, 'historical-final-after-reload')) === raw(at(continuous, 'historical-final')));
gate('5. chave histórica idêntica antes e depois do último reload', raw(at(reload, 'historical-final')) === raw(at(reload, 'historical-final-after-reload')));
gate('6. campeão idêntico', at(reload, 'historical-final-after-reload').champion === at(continuous, 'historical-final').champion && Boolean(at(continuous, 'historical-final').champion));
gate('7. histórico após reload sem placeholder', at(reload, 'historical-final-after-reload').viewPlaceholders === 0);
gate('8. torneio finalizado após reload', at(reload, 'historical-final-after-reload').status === 'finalizado');
finish();
