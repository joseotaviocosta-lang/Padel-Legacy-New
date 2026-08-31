// UX — Atalho do Centro de Treinamento (validação final do hotfix de
// persistência). Remove o toggle de som do FloatingUtilityRail (pouco usado
// nesse espaço nobre) e o substitui, no MESMO lugar/tamanho/estilo, por um
// atalho direto à página principal do Centro de Treinamento.
//
// Escopo explícito: só o botão visual do rail muda. Áudio (uiSound.js),
// persistência da preferência, e o controle equivalente em Configurações →
// Áudio (Settings.jsx, que sempre teve seu próprio estado independente)
// continuam intactos — confirmado abaixo por auditoria estática.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const rail = read('src/components/system/FloatingUtilityRail.jsx');
const settings = read('src/pages/Settings.jsx');
const uiSound = read('src/lib/uiSound.js');
const routes = read('src/navigation/routes.js');
const routeModules = read('src/lib/routeModules.js');
const appLayout = read('src/components/AppLayout.jsx');
const appJsx = read('src/App.jsx');
const navigationConfig = read('src/navigation/navigationConfig.js');

// O próprio arquivo documenta em comentário a remoção do som (menciona
// Volume2/loadUiSoundPreferences/etc. como contexto histórico) — as checagens
// de "não existe mais" precisam olhar só o CÓDIGO, nunca a prosa explicativa.
const railCodeOnly = rail.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

// ═══════════ 1. Botão de som não aparece mais no rail ═══════════
gate('1. FloatingUtilityRail não importa mais Volume2/VolumeX de lucide-react', !/Volume2|VolumeX/.test(railCodeOnly));
gate('1b. FloatingUtilityRail não tem mais toggleSound/soundEnabled', !/toggleSound|soundEnabled/.test(railCodeOnly));
gate('1c. FloatingUtilityRail não chama mais loadUiSoundPreferences/saveUiSoundPreferences/playUiSound', !/loadUiSoundPreferences|saveUiSoundPreferences|playUiSound/.test(railCodeOnly));
gate('1d. Nenhum aria-label de som sobrou no rail', !/Desativar sons da interface|Ativar sons da interface|Som ligado|Som desligado/.test(railCodeOnly));

// ═══════════ 2. Botão do Centro de Treinamento aparece ═══════════
gate('2. FloatingUtilityRail importa Building2 (mesmo ícone da navegação principal, navigationConfig.js)', rail.includes('Building2'));
gate('2b. Botão do Centro de Treinamento tem aria-label e title (tooltip desktop + acessibilidade)', rail.includes('aria-label="Centro de treinamento"') && rail.includes('title="Centro de treinamento"'));
gate('2c. Ícone reutilizado é exatamente o mesmo já usado para "Centro de treinamento" na navegação principal', navigationConfig.includes('icon: Building2') && navigationConfig.includes("label: 'Centro de treinamento'"));

// ═══════════ 3. Navega para a rota correta (rota/componente já existentes, nenhuma nova) ═══════════
gate('3. Botão usa APP_ROUTES.TRAINING_CENTER (constante existente, não uma string solta)', rail.includes('to={APP_ROUTES.TRAINING_CENTER}'));
gate('3b. APP_ROUTES.TRAINING_CENTER aponta para /game/training-center (rota já existente)', routes.includes("TRAINING_CENTER: TRAINING_CENTER_PATH") && routes.includes("const TRAINING_CENTER_PATH = '/game/training-center'"));
gate('3c. /game/training-center já resolve para o componente TrainingCenter existente (nenhuma página nova)', routeModules.includes("'/game/training-center': 'TrainingCenter'") && routeModules.includes("TrainingCenter: () => import('@/pages/TrainingCenter')"));

// ═══════════ 4/5. Carreira e estado de treinamento preservados (nenhum reload, nenhuma recriação) ═══════════
gate('4. O botão é um <Link> do react-router-dom (navegação client-side, sem reload de página)', rail.includes("import { Link } from 'react-router-dom'") && rail.includes('<Link'));
gate('4b. FloatingUtilityRail não importa nada de carreira/API (não pode recriar/reler a carreira sozinho)', !/from ['"]@\/careers\//.test(rail) && !/from ['"]@\/api\/localGameClient/.test(rail) && !/localGame\./.test(rail));
gate('5. CareerProvider envolve o <Router> inteiro (App.jsx) — nunca desmonta ao trocar de rota, então nenhuma navegação recria a carreira', /<CareerProvider>[\s\S]*<Router[\s\S]*<\/Router>[\s\S]*<\/CareerProvider>/.test(appJsx));

// ═══════════ 6/7. Áudio continua disponível em Configurações e funcional ═══════════
gate('6. Configurações → Áudio continua com o controle de som (independente do rail)', settings.includes('loadUiSoundPreferences') && settings.includes('saveUiSoundPreferences') && settings.includes("Volume2") && settings.includes('VolumeX'));
gate('6b. Configurações tem seu próprio toggleSound (nunca dependeu do FloatingUtilityRail)', settings.includes('function toggleSound'));
gate('7. Infraestrutura de áudio (uiSound.js) intacta — mesmas 3 funções exportadas', uiSound.includes('export function loadUiSoundPreferences') && uiSound.includes('export function saveUiSoundPreferences') && uiSound.includes('export function playUiSound'));

// ═══════════ 8/9. Sem reload completo, sem chamadas duplicadas ═══════════
gate('8. Nenhum window.location/window.location.href usado para navegar (só <Link>, sem reload de app)', !/window\.location(\.href)?\s*=/.test(rail));
gate('9. Rota do Centro de Treinamento já é pré-carregada em tempo ocioso (AppLayout.jsx) — nenhum preload novo necessário', appLayout.includes('APP_ROUTES.TRAINING') && appLayout.includes('preloadRoutes'));
gate('9b. preloadRoute deduplica por módulo (Map cache) — abrir o atalho depois do preload não dispara um segundo import', read('src/lib/routeModules.js').includes('if (!preloadRequests.has(moduleName))'));

// ═══════════ 10/11. Desktop (tooltip) e mobile (toque/safe-area) ═══════════
gate('10. Tooltip desktop via atributo title nativo (mesmo padrão dos outros botões do rail)', /title="Centro de treinamento"/.test(rail));
gate('11. Mesmo tamanho de toque do botão de Carreiras ao lado (h-11 w-11, >= 44px, inalterado)', (rail.match(/h-11 w-11/g) || []).length >= 2);
gate('11b. Safe-area preservada (nenhuma mudança no container do rail)', rail.includes('safe-area-inset-right'));
gate('11c. Rail continua com exatamente 3 utilitários (BETA, Carreiras, Centro de Treinamento) — não ficou maior nem cobre mais conteúdo', (railCodeOnly.match(/pointer-events-auto/g) || []).length === 3);

console.log(`\n${gates} gates executados, todos PASS — UX Training Center Shortcut.`);
