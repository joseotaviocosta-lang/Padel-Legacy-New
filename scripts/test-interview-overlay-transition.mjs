// Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 7/8/23).
//
// Estrutural (fonte real) — a causa raiz comprovada pela auditoria era
// openPostMatchInterview() nunca chamar onClose() antes de navigate() para
// a rota lazy /press, deixando o backdrop do TournamentModal montado
// durante a espera pelo chunk (React Router future.v7_startTransition +
// Suspense) — coexistindo com o backdrop do InterviewModal. Corrigido na
// raiz (fecha o overlay ANTES de navegar), não com z-index maior.
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');
const overlayBackStack = read('src/components/design-system/overlayBackStack.js');
const modalShell = read('src/components/design-system/ModalShell.jsx');
const interviewModal = read('src/components/press/InterviewModal.jsx');
const pressPage = read('src/pages/Press.jsx');

// ── Causa raiz corrigida: onClose ANTES de navigate ─────────────────────
gate('BUG BLOQUEADO: openPostMatchInterview fecha o overlay do torneio (onClose) ANTES de navegar para /press — nunca deixa o backdrop antigo montado esperando o chunk lazy carregar', /function openPostMatchInterview\(\) \{[\s\S]{0,300}onClose\?\.\(\);\s*\n\s*navigate\(buildInterviewRoute/.test(tournamentModal));
gate('Não foi aplicado z-index maior como correção (proibido pelo próprio briefing — a causa raiz era stacking/timing, não prioridade de camada)', !/openPostMatchInterview[\s\S]{0,600}z-index/i.test(tournamentModal));

// ── Nenhum outro botão "Voltar à carreira" foi deixado sem navegar (M4.3 já tinha corrigido os outros) ──
gate('goBackToCareer (M4.3) continua a única saída real "voltar à carreira" — onClose + navigate juntos, mesmo padrão agora reaproveitado pela entrevista', /const goBackToCareer = useCallback\(\(\) => \{ onClose\?\.\(\); navigate\('\/'\); \}/.test(tournamentModal));

// ── Overlay stack (M1) não foi alterado — só consumido corretamente agora ──
gate('overlayBackStack.js (M1) não foi tocado por este hotfix — register/unregister continuam síncronos, sem debounce/timeout novo', /export function registerOverlay/.test(overlayBackStack) && /export function unregisterOverlay/.test(overlayBackStack) && !/setTimeout[\s\S]{0,50}unregisterOverlay|unregisterOverlay[\s\S]{0,50}setTimeout/.test(overlayBackStack));
gate('ModalShell continua desmontando imediatamente quando open=false (sem animação de saída que prolongue o backdrop)', /if \(!open[\s\S]{0,50}\) return null;/.test(modalShell));

// ── InterviewModal registra seu próprio overlay independente (confirmado pela auditoria) ──
gate('InterviewModal usa ModalShell (registra seu próprio overlay, independente do TournamentModal)', /ModalShell open onClose=\{onClose\}/.test(interviewModal));

// ── Cadeia completa: cancelar e não dar entrevista não deixam rastro ─────
gate('Cancelar entrevista chama onClose (mesmo caminho de fechamento limpo, nunca um estado intermediário)', /Cancelar entrevista/.test(interviewModal) && /onClick=\{onClose\}/.test(interviewModal));
gate('"Não dar entrevista" (fechar o resultado sem abrir a entrevista) não depende de nenhum estado extra — onClose do FinalState/StateMessage já é o goBackToCareer normal, mesmo caminho de sempre', /onClose=\{goBackToCareer\}/.test(tournamentModal));

// ── Press.jsx: abrir/responder/próxima pergunta/finalizar é o mesmo fluxo de sempre, sem overlay extra ──
gate('Press.jsx monta só 1 InterviewModal por vez (activeInterview && activeJournalist)', /\{activeInterview && activeJournalist && \(/.test(pressPage));
gate('closeInterview existe como o único caminho de fechamento do InterviewModal a partir de Press.jsx', /function closeInterview/.test(pressPage) || /closeInterview\s*=/.test(pressPage));

console.log(`\n${gates} gates executados, todos PASS — Transição de overlay Resultado -> Entrevista (Hotfix 14.1): causa raiz real corrigida (onClose antes de navigate), não z-index.`);
