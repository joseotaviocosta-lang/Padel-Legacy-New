// Redesign Checkpoint — Hotfix 1. Protege as duas correções desta rodada:
// (1) o símbolo da marca carrega de fato em produção/Tauri (a causa real era
// um comentário XML com "--" duplo em src/assets/brand/*.svg, que quebrava
// tanto o inlining de asset do Vite quanto o gerador de ícones do Tauri —
// não um caminho errado); (2) os cards de Treinos voltaram a mostrar o valor
// atual do atributo, não só o ganho, sem tocar em nenhuma fórmula de treino.
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

// ── 1. Branding — asset carrega de verdade em produção ─────────────────────

const brandMark = read('src/components/design-system/BrandMark.jsx');
check('BrandMark não importa o PNG oficial da marca', brandMark.includes("@/assets/brand/app-icon-master.png"));
check('BrandMark não usa import estático `?url`', brandMark.includes("app-icon-master.png?url"));
check('BrandMark não usa <img> para o símbolo', brandMark.includes('<img'));

// Duas causas raiz confirmadas do ícone quebrado, ambas dentro dos
// comentários XML dos SVGs de marca:
// (a) hífen duplo consecutivo — inválido em XML, derrubava o gerador de
//     ícones do Tauri (usvg/resvg, parser estrito) com ParsingFailed;
// (b) caracteres acentuados/não-ASCII — o inlining de asset do Vite (build
//     de produção, assets <4KB viram `data:image/svg+xml,...`) não os
//     percent-encoda corretamente, corrompendo a URI resultante (renderiza
//     normal no navegador/dev server, mas falha no WebView2 empacotado).
// Ignora os delimitadores válidos `<!--`/`-->` na checagem de hífen duplo.
for (const svgPath of ['src/assets/brand/logo-horizontal.svg', 'src/assets/brand/logo-monochrome.svg']) {
  const svg = read(svgPath);
  const commentBodies = [...svg.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
  const hasDoubleHyphen = commentBodies.some((body) => body.includes('--'));
  check(`${svgPath} tem "--" dentro de um comentário XML (inválido, quebra parsers estritos)`, !hasDoubleHyphen);
  // eslint-disable-next-line no-control-regex
  const nonAscii = [...svg].filter((ch) => ch.charCodeAt(0) > 127);
  check(`${svgPath} tem caractere não-ASCII (${nonAscii.join(' ')}) — corrompe o data-URI inline do build de produção`, nonAscii.length === 0);
}

// Nenhum outro ponto do app deve importar um asset de marca sem `?url` (a
// mesma armadilha de inlining se aplica a qualquer SVG pequeno referenciado
// como <img src=...>).
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const srcFiles = walk(path.join(root, 'src'));
const unsafeBrandImports = srcFiles
  .map((file) => path.relative(root, file))
  .filter((relFile) => {
    const content = read(relFile);
    return /from ['"]@\/assets\/brand\/[^'"]+\.svg['"]/.test(content);
  });
check(`Import de asset de marca sem "?url" em: ${unsafeBrandImports.join(', ')}`, unsafeBrandImports.length === 0);

// ── 2. Componente de marca único — mesma fonte em todas as superfícies ─────

const brandSurfaces = {
  'src/components/AppLayout.jsx': 'sidebar/header',
  'src/pages/CareerManager.jsx': 'gerenciador de carreiras',
  'src/pages/Landing.jsx': 'landing pública',
  'src/components/AuthLayout.jsx': 'login/registro/recuperação de senha',
  'src/pages/Settings.jsx': 'Configurações/Sobre',
};
for (const [file, surface] of Object.entries(brandSurfaces)) {
  check(`${surface} (${file}) não usa <BrandMark>`, read(file).includes('BrandMark'));
}
check('BrandMark não exportado no barrel do design system', read('src/components/design-system/index.js').includes('BrandMark'));

// ── 3. Ícone do executável Windows — família real, não placeholder ─────────

const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'));
const declaredIcons = tauriConf?.bundle?.icon || [];
check('tauri.conf.json não declara ícones de bundle', declaredIcons.length > 0);
for (const iconRelPath of declaredIcons) {
  const iconPath = path.join('src-tauri', iconRelPath);
  check(`Ícone declarado no tauri.conf.json não existe: ${iconRelPath}`, exists(iconPath));
  const stat = fs.statSync(path.join(root, iconPath));
  // O placeholder anterior (128x128@2x.png) tinha ~1.7KB; o símbolo real
  // renderizado corretamente é substancialmente maior. Não é uma prova
  // absoluta, mas pega uma regressão de "voltou a gerar vazio/cortado".
  check(`${iconRelPath} suspeito de estar vazio/corrompido (${stat.size} bytes)`, stat.size > 500);
}
check('icon.ico ausente em src-tauri/icons/', exists('src-tauri/icons/icon.ico'));

// ── 4. Treinos — valor atual do atributo restaurado ─────────────────────────

const trainingCard = read('src/components/training/TrainingActivityCard.jsx');
check('TrainingActivityCard não importa ATTRIBUTE_LABELS (tabela de tradução já existente)', trainingCard.includes('ATTRIBUTE_LABELS'));
check('TrainingActivityCard criou uma segunda tabela de tradução em vez de reaproveitar', !trainingCard.includes('const ATTRIBUTE_LABELS ='));
check('TrainingActivityCard não lê o valor atual de `profile` (mesma fonte do gameplay)', trainingCard.includes('profile?.[attribute]'));
check('TrainingActivityCard não mostra mais o ganho previsto (+X.XX)', trainingCard.includes('gain.toFixed(2)'));
check('TrainingActivityCard não deveria manter estado próprio de atributo (nada de useState para valor atual)', !/useState\(\s*(profile|currentAttrVal|attributeValue)/.test(trainingCard));
check('TrainingActivityCard não faz fetch/consulta própria por card (deve usar a prop `profile` já carregada)', !/localGame\.|fetch\(|await\s+get/.test(trainingCard));

// Todos os tipos de treino passam pelo mesmo componente/card — cobertura
// automática de Quadra/Físico/Mental/Tático de Dupla sem lógica por categoria.
const trainingPage = read('src/pages/Training.jsx');
check('Training.jsx não passa `profile` para TrainingActivityCard', /<TrainingActivityCard[\s\S]{0,300}?profile=\{profile\}/.test(trainingPage));

// ── 5. Balanceamento intocado ────────────────────────────────────────────────

const trainingSystem = read('src/lib/trainingSystemV2.js');
check('getPredictedGain não existe mais em trainingSystemV2.js (fórmula não pode ter sido removida)', trainingSystem.includes('export function getPredictedGain'));
check('distributeTrainingGain não existe mais (fórmula de distribuição de ganho não pode ter sido tocada)', trainingSystem.includes('export function distributeTrainingGain'));
check('previewTraining não existe mais (cálculo de fadiga/energia/risco não pode ter sido tocado)', trainingSystem.includes('export function previewTraining'));

console.log(`test:visual-checkpoint-hotfix1 OK — ${checks} verificações.`);
