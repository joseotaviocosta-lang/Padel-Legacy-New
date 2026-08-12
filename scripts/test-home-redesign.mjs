// Auditoria do Centro da Carreira (Fase 4 — Home / CareerHub.jsx).
// Ver docs/HOME_REDESIGN.md para a hierarquia que este teste protege.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

const home = read('src/pages/CareerHub.jsx');

// 1. Objetivo principal — meta de ranking já computada (buildSeasonCareerPlan),
//    exibida com barra de progresso, não uma meta inventada.
check('NextObjectiveCard ausente (objetivo principal)', home.includes('function NextObjectiveCard'));
check('Objetivo não usa o goal já computado por buildSeasonCareerPlan', home.includes('seasonPlan?.goals?.[0]') || home.includes('seasonPlan.goals'));
check('Objetivo sem barra de progresso', /NextObjectiveCard[\s\S]{0,1200}<ProgressBar/.test(home));

// 2. Próximo evento — deriva de dados já carregados (lesão/torneio ativo/próximo torneio), sem fetch novo.
check('buildNextEvent ausente (próximo evento)', home.includes('function buildNextEvent'));
check('NextEventCard ausente', home.includes('function NextEventCard'));

// 3. CTA contextual — motor de próximo passo determinístico, múltiplos estados de carreira.
check('getNextStep ausente (CTA contextual)', home.includes('function getNextStep'));
for (const branch of ['isRetired(profile)', '!profile.court_side', '!profile.partner_id', "profile.injury_status === 'injured'"]) {
  check(`getNextStep não cobre o estado: ${branch}`, home.includes(branch));
}

// 4. "O que fazer agora" — prioridade simples e determinística sobre dados já computados.
check('buildPriorityActions ausente ("o que fazer agora")', home.includes('function buildPriorityActions'));
check('PriorityActionsPanel ausente', home.includes('function PriorityActionsPanel'));
check('Prioridades não reaproveitam dailyBriefing/decisionCenter já computados', home.includes('dailyBriefing') && home.includes('decisionCenter'));

// 5. Jornada — timeline compacta agrupada por dia, não uma grade de cards.
check('buildJourneyTimeline ausente (jornada)', home.includes('function buildJourneyTimeline'));
check('JourneyTimeline ausente', home.includes('function JourneyTimeline'));
check('Agrupamento por dia (Hoje/Ontem/N dias atrás) ausente', home.includes('function dayBucketLabel'));

// 6. Responsividade — grid de 12 colunas com blocos assimétricos (seção 16),
//    não larguras uniformes.
const colSpanMatches = home.match(/xl:col-span-\d+/g) || [];
check('Nenhuma classe xl:col-span-* encontrada (grid de 12 colunas ausente)', colSpanMatches.length >= 4);
check('Todas as colunas têm a mesma largura (esperado tamanhos variados)', new Set(colSpanMatches).size >= 2);

// 7. Nenhuma rota quebrada — Home continua na mesma rota, App.jsx inalterado nas rotas ativas.
const appJsx = read('src/App.jsx');
check('Rota /game removida ou CareerHub desconectado dela', appJsx.includes("path=\"/game\"") && appJsx.includes('CareerHub'));

// 8. Nenhum polling novo — CareerHub não deve ter setInterval próprio.
check('CareerHub introduziu polling próprio (setInterval)', !home.includes('setInterval('));

// 9. Nenhum import legado novo — Fase 2 já migrou os adapters; a Home não deve
//    voltar a importar da biblioteca-sombra.
check('CareerHub ainda importa de padel/ui.jsx', !home.includes("from '@/components/padel/ui'"));
check('CareerHub ainda importa de padel/GameShared.jsx', !home.includes("from '@/components/padel/GameShared'"));
check('CareerHub ainda importa de padel/Shared.jsx', !home.includes("from '@/components/padel/Shared'"));
check('CareerHub não usa o design-system oficial', home.includes("from '@/components/design-system'"));

// 10. Nenhum dado obrigatório novo no save — os únicos patches gravados no
//     profile continuam os dois já existentes (conclusão de tutorial e
//     recuperação de lesão), sem campo novo introduzido por esta fase.
const updateCalls = [...home.matchAll(/PlayerProfile\.update\(profile\.id,\s*\{([^}]*)\}/gs)].map((match) => match[1]);
check('Nenhuma chamada PlayerProfile.update encontrada (esperado: conclusão de tutorial)', updateCalls.length >= 1);
const updatedFields = updateCalls.join(',');
for (const field of ['tutorial_onboarding', 'onboarding_completed', 'onboarding_stage']) {
  check(`Campo de save esperado ausente da chamada de update: ${field}`, updatedFields.includes(field));
}

// 11. Ferramentas de gestão (Centro Médico, Leitura Estratégica) continuam
//     100% funcionais — só ficam recolhidas por padrão, não removidas.
check('MedicalCenterPanel removido do Home (perderia funcionalidade de gestão médica)', home.includes('MedicalCenterPanel'));
check('StrategicCareerPanel removido do Home (perderia funcionalidade de plano semanal)', home.includes('StrategicCareerPanel'));
check('CareerToolsSection (progressive disclosure) ausente', home.includes('function CareerToolsSection'));
check('Ferramentas não recolhidas por padrão (toolsOpen deveria iniciar false)', home.includes('useState(false)') && home.includes('toolsOpen'));

// 12. Escolha de dupla continua acessível diretamente do Home (modal, não só link).
check('PartnerSelection removido do Home', home.includes('PartnerSelection'));
check('CareerCalendar (avançar dia + status diário) removido do Home', home.includes('CareerCalendar'));

// 13. Acessibilidade básica — toggle de ferramentas com aria-expanded/aria-controls.
check('Toggle de ferramentas sem aria-expanded', home.includes('aria-expanded={open}'));
check('Toggle de ferramentas sem aria-controls', home.includes('aria-controls="career-tools-panel"'));

// 14. Loading por região — skeleton discreto no carregamento inicial, não bloqueio total.
check('PageSkeleton ausente no estado de carregamento', home.includes('<PageSkeleton'));

console.log('HomeRedesignTest: PASS');
console.log(`✓ ${checks} verificações — objetivo, evento, CTA, jornada, grid responsivo, rotas, polling, imports e save`);
