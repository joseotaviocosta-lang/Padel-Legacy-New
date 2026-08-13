// Auditoria do redesign do Mundo Vivo (Fase 7 — Notícias, Comunidade,
// Imprensa, Mercado e Universo Vivo). Ver docs/WORLD_UI.md para as decisões
// que este teste protege contra regressão. Segue o padrão de asserção
// estática por string dos demais gates de UI (test-ui-redesign.mjs,
// test-home-redesign.mjs, test-global-market-v25.mjs).
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

const journal = read('src/pages/Journal.jsx');
const worldFeed = read('src/components/world/WorldFeed.jsx');
const worldEventCard = read('src/components/world/WorldEventCard.jsx');
const community = read('src/pages/Community.jsx');
const social = read('src/pages/Social.jsx');
const press = read('src/pages/Press.jsx');
const articleCard = read('src/components/press/ArticleCard.jsx');
const careerAssistantLib = read('src/lib/careerAssistant.js');
const careerAssistant = read('src/components/career/CareerAssistant.jsx');
const worldMarket = read('src/pages/WorldMarket.jsx');
const worldHub = read('src/pages/WorldHub.jsx');
const worldEvents = read('src/pages/WorldEvents.jsx');
const livingWorldEngine = read('src/lib/livingWorldEngine.js');
const appJsx = read('src/App.jsx');

// 1. As cinco páginas do Mundo Vivo continuam nas mesmas rotas (nenhuma
//    rota nova, nenhuma renomeação — Fase 7 é redesign de UI, não de IA).
check('rota /journal (Notícias) ausente ou desconectada', appJsx.includes("path=\"/journal\"") && appJsx.includes('<Journal'));
check('rota /community (Comunidade) ausente ou desconectada', appJsx.includes("path=\"/community\"") && appJsx.includes('<Community'));
check('rota /press (Imprensa) ausente ou desconectada', appJsx.includes("path=\"/press\"") && appJsx.includes('<Press'));
check('rota /world-market (Mercado) ausente ou desconectada', appJsx.includes("path=\"/world-market\"") && appJsx.includes('<WorldMarket'));
check('rota /world (Universo Vivo) ausente ou desconectada', appJsx.includes("path=\"/world\"") && appJsx.includes('<WorldHub'));

// 2. Notícias — destaque principal + paginação no feed do mundo (seções 3/4/9/30).
check('WorldFeed sem variante de destaque principal', worldFeed.includes("variant=\"hero\""));
check('WorldFeed sem paginação (Carregar mais)', worldFeed.includes('Carregar mais') && worldFeed.includes('visibleCount'));
check('WorldEventCard sem formatação relativa de data (Hoje/Ontem/Esta semana)', worldEventCard.includes('formatWorldDate'));
check('WorldEventCard sem indicação "Relacionado a você"', worldEventCard.includes('Relacionado a você'));
check('WorldEventCard não reaproveita PlayerAvatar (conexão Ranking ↔ Notícias ↔ Mundo)', worldEventCard.includes('PlayerAvatar'));

// 3. Comunidade — paginação (lote limitado) e reaproveitamento de PlayerAvatar,
//    sem recriar uma segunda rede social paralela (seção 8/9).
check('Community sem paginação (lote limitado)', community.includes('visibleCount') && community.includes('Carregar mais'));
check('Community não reaproveita PlayerAvatar', community.includes('PlayerAvatar'));
check('Social sem paginação (lote limitado)', social.includes('visibleCount') && social.includes('Carregar mais'));
check('Social não reaproveita PlayerAvatar', social.includes('PlayerAvatar'));
check('Rota /social parou de redirecionar para /community (experiência duplicada de rede social)', appJsx.includes('path="/social"') && appJsx.includes('Navigate to="/community"'));

// 4. Imprensa — entrevista impossível de ignorar, mesma fonte em todas as
//    superfícies (Home, sino, assistente, Imprensa), deep link preservado (seções 11-14).
check('Press sem banner de entrevista disponível', press.includes('Entrevista disponível') && press.includes('Dar entrevista'));
check('Press deixou de consumir searchParams.get(interview) — quebraria o deep link', press.includes("searchParams.get('interview')"));
check('Press deixou de consumir searchParams.get(source) — quebraria o deep link', press.includes("searchParams.get('source')"));
check('Press deixou de validar partida oficial antes de aplicar efeitos de entrevista', press.includes('isPostMatchInterview') && press.includes('findOfficialInterviewMatch'));
check('ArticleCard sem histórico de impacto (reputação/fãs/patrocinadores)', articleCard.includes('reputation_change') && articleCard.includes('fan_appeal_change') && articleCard.includes('sponsor_appeal_change'));
check('CareerAssistant não sinaliza entrevista pendente (guia/assistente)', careerAssistant.includes('pressInterview'));
check('CareerAssistant não reaproveita resolveNotificationDestination (mesma fonte da Home/sino)', careerAssistant.includes('resolveNotificationDestination'));
check('careerAssistant.js sem insight de entrevista disponível', careerAssistantLib.includes('press-interview') && careerAssistantLib.includes('context.pressInterview'));

// 5. Mercado — componentes oficiais (PlayerAvatar/CountryFlag) e Movimentações
//    com identidade visual (seções 17/18/26), tabs/chamadas existentes intactas.
check('WorldMarket não reaproveita PlayerAvatar', worldMarket.includes('PlayerAvatar'));
check('WorldMarket não reaproveita CountryFlag', worldMarket.includes('CountryFlag'));
check('WorldMarket sem metadados visuais de Movimentações', worldMarket.includes('movementMeta') || worldMarket.includes('MOVEMENT_TAG_META'));
for (const tabId of ["id: 'athletes'", "id: 'teams'", "id: 'coaches'", "id: 'movements'"]) {
  check(`WorldMarket perdeu a aba ${tabId}`, worldMarket.includes(tabId));
}
for (const call of ['submitPartnerOffer', 'getNegotiationPreview', 'scoutAthlete', 'toggleShortlist', 'processGlobalMarketMonth']) {
  check(`WorldMarket deixou de chamar ${call} (lógica de mercado alterada)`, worldMarket.includes(call));
}

// 6. Universo Vivo — bug de leitura corrigido (categorias circuito/mercado),
//    agrupamento temático na aba Hoje, paginação nas abas Circuito/Mercado (seções 20-26).
check('getLivingWorldSnapshot mudou a forma categorias.circuito/mercado/saude (isso quebraria a correção de leitura)', livingWorldEngine.includes('circuito:') && livingWorldEngine.includes('mercado:') && livingWorldEngine.includes('saude:'));
check('WorldHub ainda lê a chave inexistente categories.circuit', !worldHub.includes('categories?.circuit '));
check('WorldHub ainda lê a chave inexistente categories.market', !worldHub.includes('categories?.market '));
check('WorldHub lê categorias.circuito corretamente', worldHub.includes('categories?.circuito'));
check('WorldHub lê categorias.mercado corretamente', worldHub.includes('categories?.mercado'));
check('WorldHub sem agrupamento temático da aba Hoje (Ranking/Torneios/Mercado/Tendências)', ['Ranking', 'Torneios', 'Tendências'].every((label) => worldHub.includes(label)));
for (const label of ["label: 'Hoje'", "label: 'Circuito'", "label: 'Mercado'", "label: 'História'"]) {
  check(`WorldHub perdeu a aba ${label} (protegida por test:living-world)`, worldHub.includes(label));
}
check('WorldHub sem paginação na aba Circuito/Mercado', worldHub.includes('EVENT_PAGE_SIZE'));
check('WorldEvents sem Design System oficial (Page/PageHeader/PageSkeleton)', worldEvents.includes("from '@/components/design-system'") && worldEvents.includes('PageSkeleton'));
check('WorldEvents sem paginação (Carregar mais)', worldEvents.includes('Carregar mais') && worldEvents.includes('visibleCount'));
check('WorldEvents deixou de consumir searchParams.get(event) — quebraria o deep link', worldEvents.includes("searchParams.get('event')"));
check('WorldEvents deixou de usar ModalShell no deep link', worldEvents.includes('<ModalShell'));

// 7. Performance — nenhuma simulação do mundo disparada apenas por abrir a
//    página (seção 31), nenhum polling novo (seção 30/32).
for (const [source, label] of [[worldHub, 'WorldHub'], [worldEvents, 'WorldEvents'], [worldMarket, 'WorldMarket'], [journal, 'Journal'], [worldFeed, 'WorldFeed']]) {
  check(`${label} chama processLivingWorldDay a partir da página (deveria só rodar no avanço de dia)`, !source.includes('processLivingWorldDay('));
}
// O mount effect de cada página só chama load()/carregamentos "ensure*" (top-up
// idempotente); processGlobalMarketMonth só existe ligado ao botão "Atualizar mês".
check('WorldMarket mudou o mount effect (deveria só chamar load())', worldMarket.includes('useEffect(() => { load(); }, []);'));
check('WorldMarket passou a chamar processGlobalMarketMonth fora de processMonth()', (worldMarket.match(/processGlobalMarketMonth\(/g) || []).length === 1);
check('WorldHub mudou o mount effect (deveria só chamar load())', worldHub.includes('load().catch(error => console.error'));
check('WorldEvents mudou o mount effect (deveria só chamar load())', worldEvents.includes('useEffect(() => { load(); }, []);'));

for (const [source, label] of [[worldHub, 'WorldHub'], [worldEvents, 'WorldEvents'], [worldFeed, 'WorldFeed'], [community, 'Community'], [social, 'Social'], [worldMarket, 'WorldMarket']]) {
  check(`${label} introduziu polling próprio (setInterval)`, !source.includes('setInterval('));
}

// 8. Design System oficial em todas as cinco páginas (seção 19/42).
for (const [source, label] of [[journal, 'Journal'], [community, 'Community'], [press, 'Press'], [worldMarket, 'WorldMarket'], [worldHub, 'WorldHub'], [worldEvents, 'WorldEvents']]) {
  check(`${label} não usa o design-system oficial`, source.includes("from '@/components/design-system'"));
}

// 9. Documentação da fase.
check('docs/WORLD_UI.md ausente', exists('docs/WORLD_UI.md'));

console.log(`test:world-ui-v2 OK — ${checks} verificações.`);
