import { isAtLeastBetaOrRC } from './release-version-utils.mjs';
import fs from 'node:fs';

const careerHub = fs.readFileSync('src/pages/CareerHub.jsx', 'utf8');
const layout = fs.readFileSync('src/components/AppLayout.jsx', 'utf8');
const headerContextLib = fs.readFileSync('src/lib/careerHeaderContext.js', 'utf8');
const profileSync = fs.readFileSync('src/hooks/useCareerProfileSync.js', 'utf8');
const seasonPlan = fs.readFileSync('src/lib/seasonCareerPlan.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Fase de validação final (hotfix de persistência): CareerHub.jsx passou por
// um redesign de composição visual desde a v36.3.1 (o próprio arquivo
// documenta isso: "prioridades, jornada, evolução e atenção — só a
// composição visual mudou"). MyJourneyPanel/CareerFeed viraram
// JourneyTimeline ("Sua jornada"); a escada própria de metas de ranking
// ("Entrar no Top 500"→"Defender a liderança mundial") foi unificada com o
// catálogo real de conquistas (Tutorial 4.0, docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md,
// Parte 14) para eliminar uma fonte de verdade duplicada — exatamente o tipo
// de problema que hotfixes anteriores desta mesma sessão corrigiram em outras
// áreas (torneios). O evento de avanço de dia é padel:career-advanced (não
// padel:day-advanced); os textos de contexto do header ("Recuperação",
// "Fadiga alta", "Semana de desenvolvimento") continuam existindo, só
// migraram de CareerHeaderContext.jsx (o componente) para
// src/lib/careerHeaderContext.js (a lógica pura, extraída para ser
// testável/reusável). A funcionalidade nunca deixou de existir em nenhum
// desses casos — só o arquivo/nome mudou num refactor já em produção.
const checks = [
  ['Painel "Sua jornada" (linha do tempo compacta da carreira)', careerHub.includes('function JourneyTimeline') && careerHub.includes('Sua jornada')],
  ['Objetivo dinâmico usa o catálogo real de conquistas (não uma escada duplicada)', careerHub.includes('function NextObjectiveCard') && seasonPlan.includes('findNextLockedAchievement') && seasonPlan.includes('Defender a liderança mundial')],
  ['Atalhos diretos a partir da Home (painel de ações rápidas com destinos reais)', careerHub.includes('function QuickActionsBar') && (careerHub.match(/<Link to=/g) || []).length >= 4],
  ['Header inteligente reage a avanço de dia (padel:career-advanced)', layout.includes('CareerHeaderContext') && layout.includes('useCareerHeaderData') && (layout.includes('padel:career-advanced') || profileSync.includes('padel:career-advanced'))],
  ['Contextos do header (Recuperação / Fadiga alta / Semana de desenvolvimento)', headerContextLib.includes('Recuperação') && headerContextLib.includes('Fadiga alta') && headerContextLib.includes('Semana de desenvolvimento')],
  ['Versão da entrega', isAtLeastBetaOrRC(pkg.version, 33)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) process.exit(1);
console.log(`UXHomeV36_3_1Test: PASS (${checks.length}/${checks.length})`);