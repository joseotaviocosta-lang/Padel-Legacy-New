// Playthrough 4.8, Parte P — teste estrutural do mercado de treinadores
// compactado (mesmo padrão de test-mobile-game-feel-m4-1.mjs: valida o
// código real da página/componente, não renderização visual).
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');
const coachesPage = read('src/pages/Coaches.jsx');
const coachCard = read('src/components/coaches/CoachCard.jsx');

console.log('\n--- Parte I/K: grid responsivo, 1 coluna mobile / 2 colunas desktop ---');
gate('Coaches.jsx usa grid-cols-1 + lg:grid-cols-2 (mesmo padrão de PartnerOffersPanel)', (coachesPage.match(/grid grid-cols-1 gap-4 lg:grid-cols-2/g) || []).length >= 1);
gate('CoachCard não depende mais da classe morta pl-roster-row', !coachCard.includes('pl-roster-row'));
gate('CoachCard usa o mesmo padrão visual compacto (glass + rounded-2xl) dos cards de proposta de dupla', coachCard.includes('glass') && coachCard.includes('rounded-2xl'));

console.log('\n--- Parte M: paginação de 4 em 4, nunca lista gigante de uma vez ---');
gate('visibleCount inicial é 4 (não mais 12)', /useState\(4\)/.test(coachesPage) && coachesPage.includes('setVisibleCount(4)'));
gate('incremento de "Mostrar mais" é +4', coachesPage.includes('count + 4'));
gate('seções "Recomendados"/"Outras opções" também paginam em 4 (não renderizam tudo de uma vez)', coachesPage.includes('highlightedVisibleCount') && coachesPage.includes('restVisibleCount'));

console.log('\n--- Parte J: hierarquia do card preservada (nome, especialidade, OVR, badges, impactos, rodapé, botões) ---');
gate('cabeçalho: nome + badges (Recomendado / Melhor custo-benefício)', coachCard.includes('coach.name') && coachCard.includes('Recomendado') && coachCard.includes('Melhor custo-benefício'));
gate('OVR visível no cabeçalho', coachCard.includes('evaluation.overall'));
gate('corpo: no máximo 3 impactos principais', coachCard.includes('impact.highlights.slice(0, 3)'));
gate('rodapé: salário mensal, assinatura e afinidade', coachCard.includes('moedas/mês') && coachCard.includes('assinatura') && coachCard.includes('afinidade'));
// Fase 5.31: os dois botões antigos ("Ver detalhes" e "Contratar") abriam o
// MESMO modal. O card passou a ter UMA ação clara; a contratação de verdade
// continua só no modal (CoachDetail, "Contratar treinador").
const coachDetail = readFileSync('src/components/coaches/CoachDetail.jsx', 'utf8');
gate('card expõe uma ação clara (Ver detalhes / Ver requisitos)', coachCard.includes('Ver detalhes') && coachCard.includes('Ver requisitos') && /\{available\s*\?\s*<Button[\s\S]*?:\s*<Button/.test(coachCard));
gate('o modal contém o CTA real de contratação', coachDetail.includes('Contratar treinador') && coachDetail.includes('onClick={onHire}'));

console.log('\n--- Parte L: filtros, busca e ordenação preservados ---');
gate('filtros de status preservados (Todos/Disponíveis/Recomendados/Dentro do orçamento/Bloqueados)', ['Todos', 'Disponíveis', 'Recomendados', 'Dentro do orçamento', 'Bloqueados'].every((label) => coachesPage.includes(label)));
gate('busca por nome/cidade/especialidade preservada', coachesPage.includes('Nome, cidade ou especialidade'));
gate('filtro de especialidade preservado', coachesPage.includes('specialtyFilter'));
gate('ordenação preservada (relevância/OVR/salário/custo-benefício/nome)', coachesPage.includes('sortOrder') && coachesPage.includes('Custo-benefício'));

console.log(`\n=== ${gates} gates, todos PASS ===`);
console.log('test-coach-market-compact-layout: PASS');
