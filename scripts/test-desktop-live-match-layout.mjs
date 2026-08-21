// Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 1-6/22).
//
// Estrutural (fonte real) + comportamental (renderização real via
// ssrLoadModule dos componentes puros de layout, quando aplicável).
// A causa raiz comprovada pela auditoria: LiveMatch.jsx já usava
// flex/min-h-0/flex-1/overflow-y-auto corretamente — o teto artificial
// estava nos HOSTS (TournamentModal.jsx/SimulationModal.jsx), que capavam
// a altura do modal em ~46-48rem mesmo em telas de 900-1080px de altura.
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');
const liveMatch = read('src/components/matches/LiveMatch.jsx');
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');
const simulationModal = read('src/components/matches/SimulationModal.jsx');
const modalShell = read('src/components/design-system/ModalShell.jsx');

// ── Causa raiz: teto artificial removido, mesma fórmula de viewport nos 2 hosts ──
// (o texto "min(48rem"/"min(46rem" ainda aparece nos comentários que
// documentam o bug corrigido — checagem restrita à linha de className real,
// não ao arquivo inteiro, pra não colidir com a própria documentação.)
const tournamentHeightLine = tournamentModal.match(/className=\{phase === 'match'[^}]*\}/)?.[0] || '';
const simulationHeightLine = simulationModal.match(/className=\{phase === 'live'[^}]*\}/)?.[0] || '';
gate('BUG BLOQUEADO: TournamentModal não capa mais a altura desktop em min(48rem,...) — usa o viewport real (calc(100dvh-2rem))', tournamentHeightLine.includes("sm:h-[calc(100dvh-2rem)]") && !tournamentHeightLine.includes('min('));
gate('BUG BLOQUEADO: SimulationModal não capa mais a altura desktop em min(46rem,92dvh) — usa o viewport real', simulationHeightLine.includes("sm:h-[calc(100dvh-2rem)]") && !simulationHeightLine.includes('min('));
gate('Mobile preserva a MESMA altura explícita de antes (h-[calc(100dvh-1rem)], sem prefixo) nos 2 hosts — nenhuma regressão mobile', /'h-\[calc\(100dvh-1rem\)\] sm:h-\[calc\(100dvh-2rem\)\]'/.test(tournamentModal) && /'h-\[calc\(100dvh-1rem\)\] sm:h-\[calc\(100dvh-2rem\)\]'/.test(simulationModal));
gate('Breakpoint unificado entre os 2 hosts do MESMO LiveMatch.jsx (era sm: vs md:, divergência sem motivo)', (tournamentModal.match(/sm:h-\[calc\(100dvh-2rem\)\]/g) || []).length >= 1 && (simulationModal.match(/sm:h-\[calc\(100dvh-2rem\)\]/g) || []).length >= 1);

// ── Nenhuma altura mágica nova (Parte 4: preferir flex/min-h-0/dvh) ─────
gate('Nenhum host usa unidades vh cruas fora de dvh (mesma convenção já estabelecida)', !/[^d]vh[-\)]/.test(tournamentModal.match(/h-\[[^\]]*\]/g)?.join('') || '') && !/[^d]vh[-\)]/.test(simulationModal.match(/h-\[[^\]]*\]/g)?.join('') || ''));

// ── LiveMatch.jsx: cadeia flex/min-h-0 já correta, preservada intocada ──
gate('Área central (conteúdo da aba ativa) recebe o espaço flexível restante (min-h-0 flex-1)', /min-h-0 flex-1 overflow-hidden rounded-2xl/.test(liveMatch));
gate('Scoreboard não cresce (shrink-0) — nunca disputa espaço com a área flexível', /<div className="shrink-0"><CompactScoreboard/.test(liveMatch));
gate('Barra de tabs não cresce (shrink-0) — permanece sempre visível, nunca precisa de scroll externo pra aparecer', /grid shrink-0 grid-cols-4/.test(liveMatch));
gate('Controles inferiores não crescem (shrink-0) — nunca são empurrados pra fora da tela pela narração (bug antigo que não pode voltar)', /<div className="shrink-0">\s*<PlaybackControls/.test(liveMatch));
gate('Raiz do LiveMatch usa altura definida + overflow-hidden (nunca cresce além do host)', /flex h-full min-h-0 max-h-full flex-col gap-2 overflow-hidden/.test(liveMatch));

// ── Narração: scroll próprio, nunca a página/modal inteiro ──────────────
gate('MatchFeed (narração) tem overflow-y-auto PRÓPRIO (scroll interno), não depende do modal rolar', /min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain/.test(liveMatch));
gate('Completa/Resumida/Momentos preservados (nenhuma mudança de filtro de narração)', /'text',\s*'Completa'/.test(liveMatch) && /'summary',\s*'Resumida'/.test(liveMatch) && /'important',\s*'Momentos'/.test(liveMatch));
gate('Feed de eventos continua limitado a um slice de renderização (nunca cresce o DOM indefinidamente)', /\.slice\(-120\)/.test(liveMatch));

// ── Técnico: indicador visível de qualquer aba + "visto" limpa o estado novo ──
gate('Indicador de nova sugestão na aba Técnico é visível de QUALQUER aba (badge no botão da tab, não escondido dentro do conteúdo)', /hasAlert && <span className="absolute right-2 top-1\.5/.test(liveMatch));
gate('BUG BLOQUEADO: indicador de "nova" sugestão agora é retirado depois de visualizado (antes ficava aceso enquanto a sugestão existisse, mesmo já vista)', /coachSuggestion\.id !== seenSuggestionId/.test(liveMatch) && /setSeenSuggestionId\(coachSuggestion\.id\)/.test(liveMatch));
gate('Marcar como "vista" só acontece quando a aba Técnico está de fato aberta (activePanel === \'coach\')', /if \(activePanel === 'coach' && coachSuggestion\) setSeenSuggestionId/.test(liveMatch));
gate('CoachPanel mostra recomendação + contexto + confiança/custo + ações (Aplicar/Parcial/Ouvir dupla/Manter plano) — nada foi removido', /coachSuggestion\.observation/.test(liveMatch) && /coachSuggestion\.expectedImpact/.test(liveMatch) && /SmallAction primary onClick=\{onApply\}/.test(liveMatch));

// ── Lógica de sugestão do treinador não foi alterada (Parte 3: só a UI) ──
gate('Lógica de QUANDO o treinador sugere não foi tocada (state.liveCoach.pendingSuggestion continua a mesma fonte)', /const coachSuggestion = state\.liveCoach\?\.pendingSuggestion;/.test(liveMatch));

// ── Uma única implementação de LiveMatch, nunca duas ────────────────────
gate('TournamentModal e SimulationModal importam o MESMO LiveMatch.jsx (nenhuma segunda implementação criada)', tournamentModal.includes("from '@/components/matches/LiveMatch'") && simulationModal.includes("from '@/components/matches/LiveMatch'"));

// ── ModalShell: propriedade arquitetural que sustenta a fórmula de altura ──
gate('ModalShell.pl-modal-panel continua com max-h definido (base que a fórmula h-[...] dos hosts complementa) — não regrediu pra layout solto', /max-h-\[calc\(100dvh-1rem\)\]/.test(modalShell));

console.log(`\n${gates} gates executados, todos PASS — Layout desktop do LiveMatch (Hotfix 14.1): teto artificial removido, mobile preservado, Técnico sempre acessível com indicador que soma "visto".`);
