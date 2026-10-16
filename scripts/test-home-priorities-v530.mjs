// Fase 5.30 — prioridades curtas: uma lista (antes duas), ordenada por
// impacto, sem repetir destino nem a ação do herói, máx. 3 visíveis.
import { componentSource, gateRunner, HOME_LIB, homeSource, withModules } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-priorities-v530');
await withModules({ home: HOME_LIB }, async ({ home }) => {
  const priorityActions = [
    { id: 'energy', tone: 'warning', title: 'Energia baixa', description: 'Descanse antes do torneio.', route: '/game/training-center?view=training' },
    { id: 'interview', tone: 'premium', title: 'Entrevista disponível', description: 'A imprensa espera.', route: '/press' },
    { id: 'injury', tone: 'danger', title: 'Lesão', description: 'Recupera em 3 dias.', route: '/medical' },
  ];
  const attentionItems = [
    { id: 'renew', priority: 'high', category: 'Dupla', title: 'Renovar contrato', description: 'Vence em 5 dias.', route: '/partners?view=contract' },
    { id: 'dup', priority: 'critical', category: 'Imprensa', title: 'Duplicada', route: '/press' },
    { id: 'coach', priority: 'normal', category: 'Treinador', title: 'Treinador disponível', route: '/coaches' },
  ];
  const r = home.buildHomePriorities({ priorityActions, attentionItems, pendingOffersCount: 0, hasPartner: true, heroRoute: '/coaches' });
  gate('1. bloqueio/crítico primeiro (lesão), depois prazo/alto', r.items[0].id === 'injury' && ['energy', 'decision-renew'].includes(r.items[1].id), r.items.map((i) => i.id).join(','));
  gate('2. mesmo destino não se repete (/press uma vez)', r.items.filter((i) => i.route && i.route.startsWith('/press')).length === 1);
  gate('3. a ação do herói não vira prioridade (/coaches)', !r.items.some((i) => i.route === '/coaches'));
  gate('4. no máximo 3 visíveis e o resto em "ver mais"', r.visible.length === 3 && r.hiddenCount === r.items.length - 3);
  gate('5. energia baixa (alerta) aparece entre as visíveis', r.visible.some((i) => i.id === 'energy'));
  const empty = home.buildHomePriorities({});
  gate('6. sem nada: lista vazia (UI mostra "Tudo em dia")', empty.items.length === 0 && empty.hiddenCount === 0);
});
const panel = componentSource('HomePriorities');
gate('7. componente: limite visível de 3 e "ver mais {hiddenCount}"', homeSource().includes('const VISIBLE_PRIORITY_ACTIONS = 3;') && panel.includes('ver mais {hiddenCount}'));
gate('8. tutorial ativo continua suprimindo prioridades concorrentes (regra Single Source of Truth)', homeSource().includes('onboardingNextAction ? [] : buildPriorityActions('));
finish();
