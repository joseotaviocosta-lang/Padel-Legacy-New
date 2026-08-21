// Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 15/25).
//
// Garante estruturalmente que uma variante Humilde continua Humilde (nunca
// texto humilde -> efeito arrogante). Todo conteúdo NOVO desta fase usa
// presetEffects(grupo, postura) — a mesma postura no mesmo grupo sempre
// recebe o efeito IDÊNTICO por construção, não por convenção lembrada.
// Este teste prova isso e confirma que nenhuma resposta nova altera
// economia/reputação fora do que a tabela canônica já define.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { QUESTION_BANKS, TONE_EFFECT_PRESETS, presetEffects } = await server.ssrLoadModule('/src/lib/pressData.js');

  // ── presetEffects: pura, sempre devolve cópia (nunca a mesma referência) ──
  const e1 = presetEffects('positive', 'humilde');
  const e2 = presetEffects('positive', 'humilde');
  gate('presetEffects nunca devolve a mesma referência (evita mutação acidental do canônico)', e1 !== e2);
  gate('presetEffects devolve valores idênticos para o mesmo (grupo, postura)', JSON.stringify(e1) === JSON.stringify(e2));
  gate('presetEffects(grupo inexistente) nunca lança exceção, devolve neutro', JSON.stringify(presetEffects('nada', 'humilde')) === JSON.stringify({ fan_appeal: 0, sponsor_appeal: 0, morale: 0, reputation: 0, journalist_bias: 0 }));

  // ── Todo o conteúdo NOVO desta fase usa presetEffects, nunca números soltos ──
  // Identificado por id (as 11 perguntas originais mantêm effects manuais,
  // por decisão explícita de não alterar balanceamento retroativo).
  const ORIGINAL_IDS = new Set(['pre_1', 'pre_2', 'win_1', 'win_2', 'loss_1', 'loss_2', 'rumor_1', 'rumor_2', 'spec_1', 'spec_2', 'pred_1']);
  let newQuestionCount = 0;
  let totalAnswerCount = 0;
  // partner_positive/coach_positive são sobre um ESTADO de relação (química
  // alta, confiança alta), não um resultado de partida — mesma família
  // mecânica de rumor/speculation (grupo 'neutral'), não uma vitória.
  const groupByCategory = (category) => (category === 'post_win' ? 'positive' : category === 'post_loss' ? 'negative' : 'neutral');

  for (const [category, questions] of Object.entries(QUESTION_BANKS)) {
    for (const question of questions) {
      totalAnswerCount += question.answers.length;
      if (ORIGINAL_IDS.has(question.id)) continue;
      newQuestionCount += 1;
      const expectedGroup = groupByCategory(category);
      for (const answer of question.answers) {
        const canonical = TONE_EFFECT_PRESETS[expectedGroup]?.[answer.tone];
        gate(`${question.id}/${answer.tone}: postura tem um preset canônico definido para o grupo "${expectedGroup}"`, Boolean(canonical));
        gate(`${question.id}/${answer.tone}: efeito da variante é EXATAMENTE igual ao canônico do grupo (${category})`, JSON.stringify(answer.effects) === JSON.stringify(canonical));
      }
    }
  }
  gate('Pelo menos 25 perguntas NOVAS usam o sistema canônico de efeitos (não apenas 1-2 de exemplo)', newQuestionCount >= 25);

  // ── 14. Contagem total de templates (Parte 14: meta 40-60+) ─────────────
  const totalQuestions = Object.values(QUESTION_BANKS).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`   (informativo) total de templates de pergunta: ${totalQuestions}, total de respostas: ${totalAnswerCount}`);
  gate('Total de templates de pergunta está na faixa pedida pelo briefing (>= 40)', totalQuestions >= 40);

  // ── Nenhuma resposta nova altera campos fora do conjunto mecânico conhecido ──
  const KNOWN_EFFECT_KEYS = new Set(['fan_appeal', 'sponsor_appeal', 'morale', 'reputation', 'journalist_bias']);
  let unknownKeyFound = false;
  for (const questions of Object.values(QUESTION_BANKS)) {
    for (const question of questions) {
      for (const answer of question.answers) {
        for (const key of Object.keys(answer.effects || {})) {
          if (!KNOWN_EFFECT_KEYS.has(key)) unknownKeyFound = true;
        }
      }
    }
  }
  gate('Nenhuma resposta (nova ou antiga) introduz um campo de efeito desconhecido (nenhuma mecânica nova de personalidade criada)', !unknownKeyFound);

  console.log(`\n${gates} gates executados, todos PASS — Consistência de efeitos por postura (Hotfix 14.1): Humilde continua Humilde, Arrogante continua Arrogante.`);
} finally {
  await server.close();
}
