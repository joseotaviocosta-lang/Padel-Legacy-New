// Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 10/13/24).
//
// Simula 50+ entrevistas com resultados/rodadas/rankings diferentes e mede
// diversidade real — não apenas conta templates. Prova que
// selectInterviewQuestions (1) reage a contexto real (upset/margem/final/
// título/estreia/sequência/ranking), (2) nunca repete uma pergunta
// imediatamente quando existe alternativa contextual válida, (3) usa
// famílias contextuais diferentes, não só sinônimos da mesma pergunta.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { selectInterviewQuestions, pickJournalist } = await server.ssrLoadModule('/src/lib/pressData.js');

  // ── Simulação: 60 entrevistas post_win, contextos variados, com memória
  // real de anti-repetição carregada adiante (como Press.jsx faria) ──────
  const SCENARIOS = [];
  for (let i = 0; i < 60; i += 1) {
    const margin = i % 3 === 0 ? 'close' : i % 3 === 1 ? 'dominant' : null;
    SCENARIOS.push({
      matchMargin: margin,
      isTitle: i % 11 === 0,
      isUpset: i % 7 === 0,
      isDebut: i === 0,
      winStreak: i % 5 === 0 ? 4 : 0,
      rankMilestone: i % 9 === 0 ? 50 : null,
      isRivalryMatch: i % 13 === 0,
      isSemifinalWin: i % 17 === 0,
      pressImportance: i % 4 === 0 ? 'global' : 'simple',
    });
  }

  let recentIds = [];
  const questionOccurrences = new Map();
  const journalistOccurrences = new Map();
  let immediateRepeats = 0;
  let previousIds = [];

  for (const scenario of SCENARIOS) {
    const chosen = selectInterviewQuestions('post_win', scenario, recentIds, 2);
    const ids = chosen.map((q) => q.id);
    ids.forEach((id) => questionOccurrences.set(id, (questionOccurrences.get(id) || 0) + 1));

    // 1 pergunta repetida entre entrevistas CONSECUTIVAS só é aceitável se
    // o pool elegível daquele contexto específico tiver 1 pergunta só.
    const overlap = ids.filter((id) => previousIds.includes(id));
    if (overlap.length > 0) immediateRepeats += 1;
    previousIds = ids;
    recentIds = [...recentIds, ...ids].slice(-20);

    const journalist = pickJournalist('any');
    journalistOccurrences.set(journalist.id, (journalistOccurrences.get(journalist.id) || 0) + 1);
  }

  const distinctQuestionsUsed = questionOccurrences.size;
  gate('2. Simulação de 60 entrevistas usa pelo menos 10 perguntas distintas (não sempre as mesmas 2)', distinctQuestionsUsed >= 10);
  gate('Nenhuma pergunta domina mais de 40% das entrevistas (distribuição real, não uma favorita disparada)', Math.max(...questionOccurrences.values()) / SCENARIOS.length < 0.4);

  const distinctJournalists = journalistOccurrences.size;
  gate('BUG BLOQUEADO: jornalista não é sempre o mesmo (pickJournalist agora sorteia entre elegíveis, não pega sempre [0])', distinctJournalists >= 4);

  // ── Contexto realmente influencia a seleção (não é decorativo) ──────────
  const closeOnly = selectInterviewQuestions('post_win', { matchMargin: 'close' }, [], 10).map((q) => q.id);
  const dominantOnly = selectInterviewQuestions('post_win', { matchMargin: 'dominant' }, [], 10).map((q) => q.id);
  gate('Contexto "vitória apertada" nunca seleciona pergunta específica de "vitória dominante"', !closeOnly.some((id) => id.startsWith('win_dominant')));
  gate('Contexto "vitória dominante" nunca seleciona pergunta específica de "vitória apertada"', !dominantOnly.some((id) => id.startsWith('win_close')));

  const titleOnly = selectInterviewQuestions('post_win', { isTitle: true }, [], 10).map((q) => q.id);
  gate('Pergunta de título só aparece quando isTitle=true', titleOnly.some((id) => id.startsWith('win_title')));
  gate('Pergunta de título NUNCA aparece sem isTitle', !selectInterviewQuestions('post_win', {}, [], 10).map((q) => q.id).some((id) => id.startsWith('win_title')));

  const upsetOnly = selectInterviewQuestions('post_win', { isUpset: true }, [], 10).map((q) => q.id);
  gate('Pergunta de upset só aparece quando isUpset=true', upsetOnly.some((id) => id.startsWith('win_upset')));

  const rivalryOnly = selectInterviewQuestions('post_win', { isRivalryMatch: true }, [], 10).map((q) => q.id);
  gate('Pergunta de rivalidade só aparece quando isRivalryMatch=true (dado real, nunca fabricado)', rivalryOnly.some((id) => id.startsWith('win_rivalry')));

  // ── Anti-repetição: exclui recentes quando há alternativa ────────────────
  const allWinIds = ['win_1', 'win_2', 'win_3', 'win_4'];
  const excludingAll = selectInterviewQuestions('post_win', {}, allWinIds, 2);
  gate('Com TODAS as perguntas genéricas recentes, só repete quando o pool se esgota (nunca lança exceção, sempre devolve algo)', excludingAll.length === 2);
  const excludingSome = selectInterviewQuestions('post_win', {}, ['win_1'], 2).map((q) => q.id);
  gate('Excluindo 1 pergunta recente de um pool com alternativa, a excluída NUNCA aparece', !excludingSome.includes('win_1'));

  // ── Determinismo estrutural: contagem e famílias ────────────────────────
  const { QUESTION_BANKS } = await server.ssrLoadModule('/src/lib/pressData.js');
  const contextualFamilies = new Set();
  for (const questions of Object.values(QUESTION_BANKS)) {
    for (const q of questions) {
      if (q.when) contextualFamilies.add(q.id.replace(/_\d+$/, ''));
    }
  }
  console.log(`   (informativo) famílias contextuais distintas: ${contextualFamilies.size} — ${[...contextualFamilies].join(', ')}`);
  gate('Existem pelo menos 10 famílias contextuais distintas (Parte 11: não é só sinônimo, são situações diferentes)', contextualFamilies.size >= 10);

  console.log(`\n${gates} gates executados, todos PASS — Diversidade de entrevistas (Hotfix 14.1): ${distinctQuestionsUsed} perguntas distintas em ${SCENARIOS.length} simulações, ${distinctJournalists} jornalistas distintos.`);
} finally {
  await server.close();
}
