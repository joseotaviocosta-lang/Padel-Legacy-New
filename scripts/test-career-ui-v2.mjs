// Auditoria do redesign de Carreira (Fase 6 — Atleta, Dupla, Comissão
// Técnica, Equipamentos e Estatísticas). Mesmo padrão de
// scripts/test-core-gameplay-ui.mjs (Fase 5): checks agrupados por área,
// falhas coletadas antes de sair — ver docs/CAREER_UI.md.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

const failures = [];
let checks = 0;
function check(area, label, condition) {
  checks += 1;
  if (!condition) failures.push(`[${area}] ${label}`);
}

// ─── 6.1 Atleta ─────────────────────────────────────────────────────────
{
  const profile = read('src/pages/PlayerProfile.jsx');
  check('Atleta', 'PlayerProfile.jsx ainda importa da biblioteca-sombra padel/ui', !profile.includes("from '@/components/padel/ui'"));
  check('Atleta', 'Resumo do atleta não mostra lado/mão dominante (seção 4)', profile.includes('sideLabel(profile') && profile.includes('handLabel(profile'));
  check('Atleta', 'Resumo do atleta não mostra ranking', profile.includes("label=\"Ranking\""));
  check('Atleta', 'Resumo do atleta não mostra condição física', profile.includes('Condição física'));
  check('Atleta', 'Ranking exibido sem fallback seguro (não pode exigir novo dado obrigatório no save)', profile.includes('profile?.rank_points || profile?.ranking_points'));
  check('Atleta', 'Atributos não estão organizados por grupo (seção 5)', profile.includes('ATTRIBUTE_GROUPS'));
  check('Atleta', 'Sem link para personalizar aparência reaproveitando o editor existente (seção 8)', profile.includes("to=\"/character\""));
  check('Atleta', 'Página não reaproveita AttributeDistribution/PlayStyleSummary existentes', profile.includes('<AttributeDistribution') && profile.includes('<PlayStyleSummary'));
  check('Atleta', 'PlayerProfile.jsx não busca dados de popularidade fora do profile já carregado (evitar fetch novo)', !/FanBase/.test(profile));
}

// ─── 6.2 Dupla ──────────────────────────────────────────────────────────
{
  const hub = read('src/pages/PartnerHub.jsx');
  check('Dupla', 'PartnerHub.jsx ainda importa da biblioteca-sombra padel/ui', !hub.includes("from '@/components/padel/ui'"));
  check('Dupla', 'Abas da dupla não usam Tabs oficial', hub.includes('<Tabs'));
  check('Dupla', 'ConverseModal ainda é um modal cru (fixed inset-0) em vez de ModalShell', !hub.includes('fixed inset-0 z-50 flex items-end'));
  const overview = read('src/components/partner/PartnerOverview.jsx');
  check('Dupla', 'PartnerOverview não mostra indicador de compatibilidade de lados (seção 11)', overview.includes('Lados complementares'));
  check('Dupla', 'PartnerOverview não usa Surface oficial', overview.includes("from '@/components/design-system'"));
  const offers = read('src/components/partner/PartnerOffersPanel.jsx');
  check('Dupla', 'Painel de propostas perdeu a formação sugerida por lado', offers.includes('Formação sugerida'));
}

// ─── 6.3 Comissão Técnica ───────────────────────────────────────────────
{
  const staffPage = read('src/pages/Staff.jsx');
  check('Comissão', 'Staff.jsx ainda importa da biblioteca-sombra padel/ui', !staffPage.includes("from '@/components/padel/ui'"));
  const staffPanel = read('src/components/economy/StaffPanel.jsx');
  check('Comissão', 'StaffPanel.jsx ainda importa GlassCard/EmptyStateCard da biblioteca-sombra padel/ui', !staffPanel.includes("from '@/components/padel/ui'"));
  check('Comissão', 'StaffPanel.jsx não usa Tabs oficial para as sub-abas', staffPanel.includes('<Tabs'));
  check('Comissão', 'Demissão de profissional não usa Button oficial', staffPanel.includes("Button"));
  check('Comissão', 'Demissão de profissional não passa por confirmação (evitar ação destrutiva de 1 clique)', staffPanel.includes('confirmFireId'));
  const coachesPage = read('src/pages/Coaches.jsx');
  check('Comissão', 'Treinador principal não é destacado visualmente na tela de Técnicos (seção 15)', coachesPage.includes('Técnico atual'));
  const coachDetail = read('src/components/coaches/CoachDetail.jsx');
  check('Comissão', 'CoachDetail não usa ModalShell', coachDetail.includes('ModalShell'));
  check('Comissão', 'CoachDetail ainda tem <button> cru no rodapé em vez de Button', coachDetail.includes('<Button'));
}

// ─── 6.4 Equipamentos ───────────────────────────────────────────────────
{
  const inventory = read('src/pages/Inventory.jsx');
  check('Equipamentos', 'Inventory.jsx ainda importa da biblioteca-sombra padel/ui', !inventory.includes("from '@/components/padel/ui'"));
  check('Equipamentos', 'Inventory.jsx não mostra resumo "Equipado agora" por slot (seção 19/20)', inventory.includes('EQUIPMENT_SLOTS') && inventory.includes('Equipado agora'));
  check('Equipamentos', 'Botões de Equipar/Vender ainda são <button> cru em vez de Button', inventory.includes('<Button'));
  const shop = read('src/pages/Shop.jsx');
  check('Equipamentos', 'Shop.jsx ainda importa da biblioteca-sombra padel/ui', !shop.includes("from '@/components/padel/ui'"));
  check('Equipamentos', 'Alternância Loja/Equipados não usa Tabs oficial (separação clara, seção 23)', shop.includes('<Tabs'));
  const detailModal = read('src/components/shop/ItemDetailModal.jsx');
  check('Equipamentos', 'ItemDetailModal não compara "Atual vs Novo" ao trocar de equipamento (seção 21)', detailModal.includes('Comparação com'));
  check('Equipamentos', 'ItemDetailModal não recebe o item atualmente equipado como prop', detailModal.includes('currentEquipped'));
}

// ─── 6.5 Estatísticas ───────────────────────────────────────────────────
{
  const stats = read('src/pages/CareerStats.jsx');
  check('Estatísticas', 'CareerStats.jsx ainda importa da biblioteca-sombra padel/ui (PageContainer/GlassCard/EmptyStateCard/LoadingScreen)', !stats.includes("from '@/components/padel/ui'"));
  check('Estatísticas', 'CareerStats.jsx não usa Page/PageContent oficiais', stats.includes('<Page') && stats.includes('<PageContent>'));
  check('Estatísticas', 'CareerStats.jsx não usa Surface oficial nos blocos de conteúdo', stats.includes('<Surface>'));
  check('Estatísticas', 'Alternância Carreira/Temporada não usa Tabs oficial', stats.includes('<Tabs'));
  check('Estatísticas', 'CareerStats.jsx removeu os gráficos existentes (Radar/Pie) — não deveria', stats.includes('RadarChart') && stats.includes('PieChart'));
}

// ─── Rotas: nenhuma rota de Carreira foi renomeada ou removida ─────────
{
  const appRoutes = read('src/App.jsx');
  for (const routePath of ['/profile', '/partners', '/staff', '/coaches', '/game/inventory', '/game/shop', '/game/stats']) {
    check('Rotas', `Rota ${routePath} não encontrada em App.jsx`, appRoutes.includes(`path="${routePath}"`));
  }
}

// ─── Transversal: nenhum polling novo nos arquivos tocados nesta fase ──
{
  const touchedFiles = [
    'src/pages/PlayerProfile.jsx', 'src/pages/PartnerHub.jsx', 'src/components/partner/PartnerOverview.jsx',
    'src/components/partner/PartnerNegotiationModal.jsx', 'src/components/partner/InboxPanel.jsx',
    'src/pages/Staff.jsx', 'src/components/economy/StaffPanel.jsx', 'src/components/coaches/CoachCard.jsx',
    'src/components/coaches/CoachDetail.jsx', 'src/pages/Inventory.jsx', 'src/pages/Shop.jsx',
    'src/components/shop/ItemDetailModal.jsx', 'src/components/shop/EquippedView.jsx', 'src/pages/CareerStats.jsx',
  ];
  for (const file of touchedFiles) {
    check('Transversal', `${file} não existe`, exists(file));
    const source = read(file);
    check('Transversal', `${file} introduziu setInterval novo (polling)`, !source.includes('setInterval('));
  }
}

if (failures.length) {
  console.error(`CareerUiV2Test: FALHA (${failures.length}/${checks})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('CareerUiV2Test: PASS');
console.log(`✓ ${checks} verificações — Atleta, Dupla, Comissão Técnica, Equipamentos, Estatísticas, rotas e checagens transversais`);
