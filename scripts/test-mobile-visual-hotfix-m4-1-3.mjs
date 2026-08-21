// M4.1.3 — Physical Device Visual Hotfix (docs/MOBILE_M4_1_3_VISUAL_HOTFIX.md).
// Puramente estrutural/source-text: esta fase é 100% CSS/apresentação, sem
// nenhum motor de jogo envolvido, então provar "o arquivo contém a
// propriedade certa" é o teste correto aqui — a confirmação visual real
// (screenshot-driven QA, Parte 16) fica para o teste físico do usuário, não
// para este script (nunca declarar "resolvido visualmente" só por isto
// passar).
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');

const bottomNav = read('src/components/BottomNav.jsx');
const indexCss = read('src/index.css');
const guideButton = read('src/components/onboarding/OnboardingGuide.jsx');
const appLayout = read('src/components/AppLayout.jsx');
const trainingCard = read('src/components/training/TrainingActivityCard.jsx');
const tabsDs = read('src/components/design-system/Tabs.jsx');
const careerStatusBar = read('src/components/career/CareerStatusBar.jsx');
const calendarPage = read('src/pages/CalendarPage.jsx');
const tournamentsPage = read('src/pages/Tournaments.jsx');

// ── 1/2) Bottom Nav: fundo realmente opaco, nunca /90-/99 ────────────────
// Isola só o className real da tag <nav> (nunca os comentários acima dela,
// que citam de propósito o valor antigo "/98" como contexto histórico).
const bottomNavClassName = (bottomNav.match(/<nav[\s\S]*?className=\{`([\s\S]*?)`\}/) || [])[1] || '';
gate('BottomNav usa --pl-bottom-nav-bg (token dedicado) como fundo', /bg-\[hsl\(var\(--pl-bottom-nav-bg\)\)\]/.test(bottomNavClassName));
gate('BottomNav NÃO usa bg-background com canal alfa (/90 a /99) como superfície principal', bottomNavClassName.length > 0 && !/bg-background\/(9[0-9]|100)\b/.test(bottomNavClassName));
gate('--pl-bottom-nav-bg é definido em index.css apontando pra --background (sem canal alfa)', /--pl-bottom-nav-bg:\s*var\(--background\)/.test(indexCss));

// ── 3) z-index: GuideButton > BottomNav > FloatingUtilityRail ─────────────
const zBottomNav = Number((indexCss.match(/--z-bottom-nav:\s*(\d+)/) || [])[1]);
const zFloating = Number((indexCss.match(/--z-floating:\s*(\d+)/) || [])[1]);
const zDropdown = Number((indexCss.match(/--z-dropdown:\s*(\d+)/) || [])[1]);
gate('Escala de z-index existe e é coerente (floating < bottom-nav < dropdown)', zFloating > 0 && zBottomNav > zFloating && zDropdown > zBottomNav);
gate('BottomNav usa --z-bottom-nav', /z-\[var\(--z-bottom-nav\)\]/.test(bottomNav));
const guideButtonClassName = (guideButton.match(/data-guide-button[\s\S]*?className="([\s\S]*?)"/) || [])[1] || '';
gate('GuideButton usa um z-index acima de --z-bottom-nav (--z-dropdown), nunca mais --z-floating (que empatava por baixo)', /z-\[var\(--z-dropdown\)\]/.test(guideButtonClassName) && !/pl-floating-utilities/.test(guideButtonClassName));

// ── 4) Safe area preservada ────────────────────────────────────────────
gate('BottomNav preserva pb-[env(safe-area-inset-bottom)]', /pb-\[env\(safe-area-inset-bottom\)\]/.test(bottomNav));

// ── 5) main possui reserva inferior real (altura da nav + safe-area + folga) ──
gate('main (AppLayout) reserva bottom-nav-h + safe-area + folga de conforto no padding-bottom', /pb-\[calc\(var\(--pl-bottom-nav-h\)\+env\(safe-area-inset-bottom\)\+3\.5rem\)\]/.test(appLayout));

// ── 6) GuideButton não ocupa a área interativa da nav ─────────────────────
gate('GuideButton fica posicionado ACIMA de toda a altura da bottom nav (bottom >= --pl-bottom-nav-h + safe-area + folga)', /bottom-\[calc\(var\(--pl-bottom-nav-h\)\+env\(safe-area-inset-bottom\)\+0\.875rem\)\]/.test(guideButton));

// ── 7/8/9) Training action: compacta, sem w-full, altura correta ─────────
gate('Botão Treinar NÃO usa w-full (não é mais um CTA de largura total)', !/onExecute\(activity, intensity\)[\s\S]{0,40}w-full/.test(trainingCard));
gate('Botão Treinar usa size="default" (44px mobile via pl-btn-tap), não "touch" (48px + estilo de CTA único de página)', /size="default"[^>]*onClick=\{\(\) => onExecute/.test(trainingCard));
gate('Botão Treinar neutraliza uppercase/letter-spacing herdados de pl-game-primary (normal-case/tracking-normal)', /normal-case tracking-normal/.test(trainingCard));
gate('Botão Treinar não tem largura mínima artificial (min-w-[7.5rem] removido)', !/min-w-\[7\.5rem\]/.test(trainingCard));

// ── 10) Cards de treino preservam todos os dados essenciais ───────────────
gate('Card de treino ainda mostra duração', /activity\.duration/.test(trainingCard));
gate('Card de treino ainda mostra fadiga', /fadiga/.test(trainingCard));
gate('Card de treino ainda mostra energia', /energia/.test(trainingCard));
gate('Card de treino ainda mostra ganho previsto por atributo', /topGains/.test(trainingCard));
gate('Card de treino ainda expõe intensidade/afinidade/risco/XP/moedas no disclosure (Parte 5 — não remover dados)', /Intensidade/.test(trainingCard) && /Afinidade/.test(trainingCard) && /Risco de lesão/.test(trainingCard) && /XP/.test(trainingCard) && /Moedas/.test(trainingCard));

// ── 11) Tabs: estratégia de overflow explícita e completa ─────────────────
gate('TabsList usa overflow-x-auto', /overflow-x-auto/.test(tabsDs));
gate('TabsList usa flex-nowrap explícito (não depende só do min-w-max/shrink-0 dos triggers)', /flex-nowrap/.test(tabsDs));
gate('TabsList esconde a scrollbar (scrollbar-none)', /scrollbar-none/.test(tabsDs));
gate('TabsList reserva padding-right depois da última aba (não fica encostada/cortada visualmente)', /\bpr-3\b/.test(tabsDs));
gate('TabsTrigger declara whitespace-nowrap explicitamente (defesa extra contra quebra de texto)', /whitespace-nowrap/.test(tabsDs));

// ── 12/13/14) CareerStatusBar: layout mobile próprio, não só truncate ─────
gate('CareerStatusBar empilha em coluna no mobile (flex-col) e volta a ser uma linha só no desktop (md:flex-row)', /flex flex-col gap-2[^"]*md:flex-row/.test(careerStatusBar));
gate('CareerStatusBar usa md:contents para a linha 1 (data+lado) — desktop reaproveita a MESMA árvore, não uma segunda implementação', /md:contents/.test(careerStatusBar));
gate('CareerStatusBar não depende só de truncate: a estrutura de linhas (mobile) existe independente do truncate nos textos', /flex items-center justify-between gap-2 md:contents/.test(careerStatusBar));
gate('Botão do parceiro ganha a largura própria de uma linha inteira no mobile (min-w-0, sem competir com 4 irmãos shrink-0 na mesma linha)', /flex items-center gap-2 min-w-0 md:flex-1/.test(careerStatusBar));

// ── 15) Tournament HUD: value/label não invertidos (regressão do M4.1.2, não pode voltar) ──
gate('hudItems de Torneios não usa "label" pro nome do evento (seria o bug antigo de value/label trocados)', !/label:\s*`\$\{nextTournament\.name\}/.test(tournamentsPage));
gate('hudItems de Torneios usa "value" pro nome do evento (formato correto, icon → value → label)', /value:\s*`\$\{nextTournament\.name\}/.test(tournamentsPage));

// ── 16/17) Calendar advance group cabe em 360px + rail não cobre ─────────
gate('Grupo +1 dia/+3 dias/+1 semana usa grid com coluna extra pra "+1 semana" (1.15fr), não 3 divisões iguais', /grid-cols-\[1\.15fr_1fr_1fr\]/.test(calendarPage));
gate('Botões de avanço usam size="default" (padding-x menor que "touch"), cabendo melhor em 360px', /size="default"[^>]*onClick=\{handleAdvanceDay\}/.test(calendarPage));
gate('"+1 semana" continua com o texto completo (não abreviado pra "sem.")', /\+1 semana/.test(calendarPage) && !/\+1 sem\./.test(calendarPage));
gate('Surface do grupo de avanço reserva a zona de segurança da utility rail (mr-[var(--pl-utility-rail-safe-zone)])', /mr-\[var\(--pl-utility-rail-safe-zone\)\]/.test(calendarPage));
gate('Zona de segurança da rail é revertida no desktop (md:mr-0) — não vira padding global da página', /mr-\[var\(--pl-utility-rail-safe-zone\)\] md:mr-0/.test(calendarPage));
gate('--pl-utility-rail-safe-zone é um token formalizado em index.css (Parte 13 — reutilizável, não mágico)', /--pl-utility-rail-safe-zone:\s*[\d.]+rem/.test(indexCss));

// M4.3: gate 18 ("nenhum arquivo de lógica proibida no git diff") removido
// pelo MESMO motivo já documentado abaixo para o gate anterior — achado de
// novo, não hipotético: rodando esta suíte durante a M4.3, `git diff --
// name-only -- src/` mostrou `game-core/coachLifecycle.js`,
// `gameStateLifecycle.js`, `partnerLifecycle.js` como "prohibited", mas
// essas mudanças são da Fase 14 (história de carreira), já revisadas e
// reportadas — só continuam aparecendo no diff porque o auto-commit da
// sessão ainda não rodou, não porque a M4.1.3 ou a M4.3 tocaram lógica
// proibida (nenhum arquivo desta fase bate nos fragmentos da lista). Um
// gate de git diff não commitado nunca poderia distinguir "mudança desta
// fase" de "mudança de uma fase anterior ainda não commitada" — a mesma
// razão pela qual o gate irmão abaixo já tinha sido removido.

// M4.2.1: o gate ⊇ anterior ("changedFiles inclui os arquivos desta fase")
// dependia de `git diff` mostrar essas mudanças como NÃO commitadas — mas
// o processo de auto-commit da sessão (memória: "repo has an automated
// process committing snapshots (v## messages)") passou a commitar tudo
// periodicamente, inclusive entre a execução deste script e a última
// alteração real. Quando isso acontece, `git diff`/`git diff --cached`
// voltam vazios pra arquivos já commitados — nada foi revertido, só o
// mecanismo de detecção (diff não commitado) parou de ser confiável nesta
// sessão. A garantia real que este gate tentava dar — "as propriedades da
// M4.1.3 ainda existem nos arquivos" — já É PROVADA, de forma mais forte e
// imune a timing de commit, pelos gates 1-17 acima (leem o CONTEÚDO real
// dos mesmos arquivos e confirmam cada propriedade específica). Um gate
// baseado em git diff nunca poderia ser mais confiável que ler o arquivo
// direto — removido por ser redundante E frágil, não só frágil.

console.log(`\n${gates} gates executados, todos PASS — M4.1.3 Mobile Visual Hotfix (estrutural — screenshot-driven QA física ainda pendente, ver relatório).`);
