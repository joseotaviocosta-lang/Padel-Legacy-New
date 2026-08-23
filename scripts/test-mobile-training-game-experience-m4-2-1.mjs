// M4.2.1 (docs/MOBILE_M4_2_1_TRAINING_ECONOMY.md, Parte 25-36/46).
//
// Puramente estrutural/source-text, mesmo padrão já estabelecido por
// test-mobile-game-app-experience-m4-2.mjs — screenshot-driven QA física
// continua sendo a fonte da verdade pro visual em 390×800 (Parte 46: "não
// fingir que teste estrutural substitui screenshot"); este script prova
// que o código real contém os elementos que a Parte 26/27/30/31/32/33
// declaram existir: action-first, saldo visível, custo visível, botão
// compacto, tabs acessíveis, treino antes de recovery/staff, rows
// compactas, disclosure.
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');
const training = read('src/components/training-center/TrainingView.jsx');
const hub = read('src/pages/TrainingCenter.jsx');
const progress = read('src/components/training-center/TrainingProgressView.jsx');
const card = read('src/components/training/TrainingActivityCard.jsx');
const appLayout = read('src/components/AppLayout.jsx');

// ── Parte 26/27: HUD com saldo visível, sem card gigante próprio ──────────
gate('Saldo de moedas permanece no Header Global e não é duplicado no HUD local do Centro', /formatCoinBalance\(headerProfile\?\.coins\)/.test(appLayout) && !/label: 'moedas'/.test(hub));
// Hotfix 15.5.3 (Centro de Treinamento): o HUD comparava trainings_today
// contra a constante fixa DAILY_TRAINING_LIMIT — Quadras evoluídas
// anunciavam "+1 treino/dia" na UI, mas o limite real (aqui e na execução)
// nunca refletia o bônus. Corrigido para getDailyTrainingLimit(profile),
// que soma o bônus resolvido do Centro (facility_daily_training_bonus,
// cacheado no profile no momento do upgrade) à mesma constante base — o
// regex passa a exigir o resolver canônico, não mais a constante isolada.
gate('HUD local continua mostrando treinos hoje/limite real (getDailyTrainingLimit, com bônus do Centro)/energia/fadiga e partida', /trainings_today.*getDailyTrainingLimit\(profile\)/s.test(hub) && /energia/.test(hub) && /fadiga/.test(hub) && /partida/.test(hub));

// ── Parte 26: action-first — atividades de treino vêm ANTES de recovery/staff ──
const activitiesIdx = training.indexOf('Atividades de treino');
const conditionIdx = training.indexOf('Estado do atleta');
const recoveryIdx = training.indexOf('Recuperação e suporte');
gate('Atividades de treino renderizam ANTES de "Estado do atleta" (action-first, não catálogo depois de status)', activitiesIdx > 0 && activitiesIdx < conditionIdx);
gate('Atividades de treino renderizam ANTES de "Recuperação e suporte"/comissão', activitiesIdx > 0 && activitiesIdx < recoveryIdx);

// ── Parte 28/31: disclosure — Estado do atleta e Recuperação ficam recolhidos ──
gate('"Estado do atleta" usa CollapsibleSection (recolhido por padrão, não sempre expandido)', /<CollapsibleSection icon=\{Heart\} title="Estado do atleta"/.test(training));
gate('"Recuperação e suporte" usa CollapsibleSection', /<CollapsibleSection icon=\{FastForward\} title="Recuperação e suporte"/.test(training));

// ── Parte 25/38: tabs acessíveis (Treino/Agenda/Evolução/Metas/Histórico) ──
gate('Existem 5 abas primárias compactas e Metas/Histórico ficam dentro de Evolução', ['TRAINING', 'MATCH', 'AGENDA', 'PROGRESS', 'CENTER'].every((key) => hub.includes(`TRAINING_CENTER_VIEWS.${key}`)) && /key: 'goals'/.test(progress) && /key: 'history'/.test(progress));
gate('Tabs primárias usam variant="segmented" compacto', /variant="segmented"/.test(hub));

// ── Parte 9/31: custo visível no card, fechado E expandido, antes de confirmar ──
gate('Card fechado (summary) mostra custo em moedas (💰) junto de fadiga/energia — nunca escondido atrás de um clique', /💰 \{cost\}/.test(card));
gate('Card expandido (details) mostra a linha "Custo" com o valor real (getPredictedGain/getTrainingCost via prediction.cost)', /DetailRow label="Custo" value=\{`💰 \$\{cost\}`\}/.test(card));
gate('Custo é derivado de prediction.cost (getPredictedGain → previewTraining → getTrainingCost — fonte única, Parte 41), nunca um valor separado calculado no componente', /const cost = prediction\.cost/.test(card));

// ── Parte 10/11: botão compacto, informativo, com saldo insuficiente tratado ──
gate('Botão "Treinar" mostra o custo ao lado do rótulo (Parte 10), sem virar botão gigante (mesmo size="default" de M4.1.3)', /Treinar · 💰\{cost\}/.test(card) && /size="default"/.test(card));
gate('Saldo insuficiente desabilita o botão E mostra mensagem clara ("Moedas insuficientes"), nunca cobra pra só depois avisar', /lowCoins \? \(\s*'Moedas insuficientes'/.test(card) && /isDisabled = disabled \|\| busy \|\| lowEnergy \|\| lowCoins/.test(card));

// ── Parte 32: intensidade atualiza custo/ganho/energia/fadiga ao vivo, ANTES de confirmar ──
gate('Trocar intensidade recalcula a predição (getPredictedGain) reativamente — cost/gains/energyCost derivam do state `intensity` local, não são fixos', /getPredictedGain\(profile, activity, intensity, weeklyCount, coachBonus\)/.test(card));

// ── Parte 33: feedback pós-treino mostra o débito real, nunca "+moedas" ──
gate('Feedback pós-treino mostra "-{cost} moedas" (débito), nunca mais "+{coins} moedas" (a atividade não paga mais — Parte 2)', /-\$\{res\.cost\} moedas/.test(training) && !/\+\$\{res\.activity\.coins\}/.test(training));
gate('Feedback compacto mantém o saldo atualizado no profile compartilhado/Header', /coinsAfter: res\.profile\.coins/.test(training) && /onProfileUpdate\(res\.profile/.test(training));

// ── Parte 34: histórico mostra custo da sessão, sem exigir migração de saves antigos ──
gate('Histórico mostra custo (coins_cost, débito) para sessões novas, preservando coins_reward de sessões antigas sem migração', /coins_cost/.test(progress) && /coins_reward/.test(progress));

// ── Parte 26/28: menos cards isolados — CompactActionCard, não card grande por atividade ──
gate('Cada atividade usa CompactActionCard (fechado por padrão, ~110-160px — não um card grande sempre expandido)', /<CompactActionCard/.test(card));

// ── Parte 35/36: nenhuma lógica separada para desktop/landscape — mesmo componente, sem duplicar ──
gate('Nenhum branch de plataforma (isMobile/isDesktop) na lógica de custo — mesma decisão para todas as telas', !/isMobile|isDesktop/.test(card) && !/isMobile|isDesktop/.test(training));

// ── Bottom nav / utility rail: Training.jsx não sai do shell global (AppLayout) ──
gate('AppLayout continua montando BottomNav globalmente (Training.jsx não precisa recriar navegação)', /BottomNav/.test(appLayout));
gate('AppLayout continua montando FloatingUtilityRail/guia globalmente', /FloatingUtilityRail/.test(appLayout));
gate('Centro unificado usa o wrapper padrão <Page>/<PageContent> (não um layout customizado que escondesse bottom nav/utility rail)', /<Page/.test(hub) && /<PageContent/.test(hub));

console.log(`\n${gates} gates executados, todos PASS — Experiência de treino mobile (M4.2.1): action-first, saldo/custo visíveis, botão compacto, disclosure, sem quebrar shell global. QA física em 390×800 continua obrigatória para o visual real.`);
