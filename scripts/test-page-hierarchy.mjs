// Hotfix pré-beta — Page hierarchy cleanup (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md).
//
// QA relatou até 5 camadas repetindo o título da página (cabeçalho global,
// bloco de introdução do onboarding, PageHeader da própria página — exemplo
// citado: Imprensa aparecia como "Mundo / Imprensa" no cabeçalho global,
// "Imprensa" de novo no bloco de introdução, e "Imprensa Esportiva" no
// PageHeader). Investigação (código real, não suposição): NENHUMA das
// páginas auditadas (Imprensa, Atletas, Calendário, Treinos, Centro de
// Treinamento, Torneios) tem um segundo "hero" próprio — cada uma já usa
// exatamente um PageHeader. A duplicação vinha de dois componentes GLOBAIS
// que rodam em toda rota: o cabeçalho do AppLayout (reimprimia
// activeGroup.label + currentTitle) e o PageIntroduction do OnboardingGuide
// (reimprimia intro.title). Corrigido nesses dois lugares — estrutural,
// sem redesenhar página por página.
//
// Este teste é análise estática de código-fonte (sem jsdom neste projeto,
// então não há como montar componentes React): lê os arquivos reais e
// confere padrões de texto/JSX, não roda o app.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (...parts) => path.join(ROOT, 'src', ...parts);

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (relPath) => readFileSync(src(relPath), 'utf8');

// ---------------------------------------------------------------------------
// 1) AppLayout: o cabeçalho global não pode mais reimprimir o título da rota.
// ---------------------------------------------------------------------------
const appLayout = read('components/AppLayout.jsx');

gate('AppLayout não referencia mais currentTitle (título de rota removido)', !appLayout.includes('currentTitle'));
gate('AppLayout não referencia mais currentItem (derivava o título de rota)', !appLayout.includes('currentItem'));
gate('AppLayout não usa mais ALL_SHELL_ITEMS (só existia para achar o título de rota)', !appLayout.includes('ALL_SHELL_ITEMS'));

// Contexto operacional continua no cabeçalho (regra: GLOBAL HEADER =
// ranking/coins/energy/fatigue/date/advance/bell), só não mais a identidade
// da página.
gate('Cabeçalho global ainda mostra CareerHeaderContext (contexto operacional) no mobile', /<CareerHeaderContext profile=\{headerProfile\} compact/.test(appLayout));
gate('Cabeçalho global ainda mostra CareerHeaderContext (contexto operacional) no desktop', appLayout.match(/<CareerHeaderContext profile=\{headerProfile\}/g)?.length === 2);
gate('Cabeçalho global ainda controla o avanço de dia (CareerDayControl) 2x (mobile+desktop)', appLayout.match(/<CareerDayControl profile=\{headerProfile\}/g)?.length === 2);
gate('Cabeçalho global ainda mostra o sino de notificações (CommunicationBell) 2x (mobile+desktop)', appLayout.match(/<CommunicationBell/g)?.length === 2);

// Checks estruturais mobile (item 44 do hotfix): sem alturas fixas gigantes
// novas, safe-area preservada, bottom nav preservada, overflow normal.
gate('Header mobile mantém a altura compacta original (min-h-16, sem nova altura fixa gigante)', appLayout.includes('min-h-16'));
gate('Safe-area (pl-safe-t) preservada nos dois cabeçalhos (mobile + desktop sticky bar)', (appLayout.match(/pl-safe-t/g)?.length ?? 0) >= 2);
gate('Exatamente um <header> fixo mobile (nenhum spacer/cabeçalho duplicado introduzido)', appLayout.match(/<header /g)?.length === 1);
gate('Exatamente uma barra sticky desktop (app-desktop-bar), sem duplicata', appLayout.match(/app-desktop-bar/g)?.length === 1);
gate('BottomNav preservada', appLayout.includes('<BottomNav'));
gate('main mantém overflow-x-hidden (não virou overflow-hidden, scroll vertical normal)', appLayout.includes('overflow-x-hidden'));

// ---------------------------------------------------------------------------
// 2) OnboardingGuide: o guia orienta ação, não reidentifica a página.
//
// Hotfix page chrome (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md): esta seção foi
// além — agora nem "Como usar esta página" nem "Próximo passo" ficam
// permanentes acima da página. Ambas viraram seções dentro de um único
// painel (GuidePanel), acionado por um botão flutuante (GuideButton), não
// mais renderizadas diretamente pelo controller (`OnboardingGuide`).
// ---------------------------------------------------------------------------
const onboardingGuide = read('components/onboarding/OnboardingGuide.jsx');

const pageIntroductionSrc = onboardingGuide.slice(
  onboardingGuide.indexOf('function PageIntroductionSection'),
  onboardingGuide.indexOf('function NextStepSection'),
);
gate('PageIntroductionSection não imprime {intro.title} como texto visível (identidade da página continua só no PageHeader)', !/<h2[^>]*>\{intro\.title\}/.test(pageIntroductionSrc));
gate('PageIntroductionSection não tem nenhuma tag <h1>/<h2> (não reidentifica a página)', !pageIntroductionSrc.includes('<h1') && !pageIntroductionSrc.includes('<h2'));
gate('PageIntroductionSection ainda usa intro.description/purpose/tip (conteúdo preservado, só mudou de lugar)', pageIntroductionSrc.includes('intro.description') && pageIntroductionSrc.includes('intro.purpose') && pageIntroductionSrc.includes('intro.tip'));
gate('Guia continua pulando o conteúdo de introdução/próximo-passo na página de missões (isMissionCenter) — lógica não tocada', onboardingGuide.includes('isMissionCenter'));

// ---------------------------------------------------------------------------
// 2.1) Item 32 do hotfix de page chrome: nenhuma página comum renderiza mais
// PageIntroduction/OnboardingGuide inline — só AppLayout (operacional) + o
// PageHeader da própria página no fluxo normal de layout.
// ---------------------------------------------------------------------------
const controllerBody = onboardingGuide.slice(onboardingGuide.indexOf('export default function OnboardingGuide'));
gate('OnboardingGuide (controller) não renderiza PageIntroductionSection inline no fluxo da página', !/return <>[\s\S]*<PageIntroductionSection/.test(controllerBody));
gate('OnboardingGuide (controller) não renderiza NextStepSection inline no fluxo da página', !/return <>[\s\S]*<NextStepSection/.test(controllerBody));
gate('OnboardingGuide (controller) só devolve o botão flutuante + o painel (nada mais no fluxo visual)', /return <>\s*<GuideButton[\s\S]*<GuidePanel[\s\S]*<\/>/.test(controllerBody));

// ---------------------------------------------------------------------------
// 3) Nenhuma página comum tem dois PageHeaders (varredura em src/pages/*.jsx).
// ---------------------------------------------------------------------------
// Páginas com dois usos SÃO esperadas quando os dois ramos são mutuamente
// exclusivos (early return de erro vs. conteúdo normal) — documentado aqui,
// não uma exceção silenciosa.
const ALLOWED_MULTI_HEADER = {
  'Athletes.jsx': { max: 2, reason: 'Tela de erro de fonte (early return) e tela normal são mutuamente exclusivas — nunca as duas ao mesmo tempo (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md).' },
};

const pagesDir = src('pages');
const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith('.jsx'));
gate('Varredura encontrou as páginas reais do projeto (> 40 arquivos em src/pages)', pageFiles.length > 40);

const offenders = [];
for (const file of pageFiles) {
  const content = readFileSync(path.join(pagesDir, file), 'utf8');
  // Acha o nome local do PageHeader (direto ou com alias de import), tanto
  // do design-system quanto do wrapper padel/ui (mesma implementação).
  const importMatch = content.match(/import\s*\{[^}]*\bPageHeader(?:\s+as\s+(\w+))?[^}]*\}\s*from\s*['"]@\/components\/(?:design-system|padel\/ui)['"]/);
  if (!importMatch) continue; // página não usa PageHeader — fora do escopo desta varredura
  const localName = importMatch[1] || 'PageHeader';
  const usageRegex = new RegExp(`<${localName}[\\s/>]`, 'g');
  const count = (content.match(usageRegex) || []).length;
  const allowed = ALLOWED_MULTI_HEADER[file]?.max ?? 1;
  if (count > allowed || count === 0) offenders.push({ file, count, allowed });
}
gate(`Nenhuma página tem mais PageHeaders do que o permitido (${offenders.map(o => `${o.file}:${o.count}`).join(', ') || 'nenhum problema'})`, offenders.length === 0);

// Confere pontualmente as 5 páginas citadas no hotfix (Imprensa, Atletas,
// Calendário, Treinos, Torneios) para deixar explícito no relatório.
const namedPages = {
  'Press.jsx': 1,
  'Athletes.jsx': 2,
  'CalendarPage.jsx': 1,
  'Training.jsx': 1,
  'TrainingCenter.jsx': 1,
  'Tournaments.jsx': 1,
};
for (const [file, expected] of Object.entries(namedPages)) {
  const content = readFileSync(path.join(pagesDir, file), 'utf8');
  const importMatch = content.match(/import\s*\{[^}]*\bPageHeader(?:\s+as\s+(\w+))?[^}]*\}\s*from\s*['"]@\/components\/(?:design-system|padel\/ui)['"]/);
  const localName = importMatch?.[1] || 'PageHeader';
  const usageRegex = new RegExp(`<${localName}[\\s/>]`, 'g');
  const count = (content.match(usageRegex) || []).length;
  gate(`${file} tem exatamente ${expected} PageHeader (identidade única da página)`, count === expected);
}

// ---------------------------------------------------------------------------
// 4) Páginas de detalhe preservam breadcrumb legítimo (pai > filho).
// ---------------------------------------------------------------------------
const playerProfile = read('pages/PlayerProfile.jsx');
gate('PlayerProfile mantém breadcrumb pai > filho (Carreira > Perfil)', /breadcrumb=\{\['Carreira',\s*'Perfil'\]\}/.test(playerProfile));

const clubDetail = read('pages/ClubDetail.jsx');
gate('ClubDetail mantém título dinâmico do clube (detalhe legítimo, não hardcoded)', /title=\{club\.name\}/.test(clubDetail));

// ---------------------------------------------------------------------------
// 5) Páginas auditadas continuam com exatamente 1 <h1> de identidade visível
//    por caminho de render (o PageHeader é o único componente que emite h1).
// ---------------------------------------------------------------------------
const pageHeaderSrc = read('components/design-system/PageHeader.jsx');
gate('PageHeader (design-system) continua sendo a única fonte de <h1> de página', (pageHeaderSrc.match(/<h1/g) || []).length === 1);

console.log(`\n${gates} gates executados, todos PASS.`);
