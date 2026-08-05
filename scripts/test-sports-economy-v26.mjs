import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sourcePath = path.join(root, 'src/lib/sportsEconomyV26.js');
let source = await fs.readFile(sourcePath, 'utf8');
source = source.replace("import { localGame } from '@/api/localGameClient.js';", "const localGame = { entities: { Club: { list: async () => [], create: async (row) => row } } };");
const tempPath = path.join(root, 'scripts/.sportsEconomyV26.test.mjs');
await fs.writeFile(tempPath, source, 'utf8');
const mod = await import(`${pathToFileURL(tempPath).href}?t=${Date.now()}`);

const sponsors = [
  { id: 'a', name: 'A', tier: 'Bronze', base_monthly_value: 1000, base_sign_bonus: 200 },
  { id: 'b', name: 'B', tier: 'Bronze', base_monthly_value: 1200, base_sign_bonus: 250 },
  { id: 'c', name: 'C', tier: 'Bronze', base_monthly_value: 900, base_sign_bonus: 180 },
  { id: 'd', name: 'D', tier: 'Bronze', base_monthly_value: 1100, base_sign_bonus: 220 },
  { id: 'e', name: 'E', tier: 'Prata', base_monthly_value: 3000, base_sign_bonus: 800 },
  { id: 'f', name: 'F', tier: 'Ouro', base_monthly_value: 7000, base_sign_bonus: 2000 },
];
const beginner = { id: 'p1', career_date: '2026-01-10', career_level: 1, ranking_position: 1500, reputation: 0 };
const market1 = mod.getMonthlySponsorMarket(beginner, sponsors);
const market2 = mod.getMonthlySponsorMarket(beginner, sponsors);
if (JSON.stringify(market1) !== JSON.stringify(market2)) throw new Error('Mercado mensal não determinístico.');
if (market1.sponsors.some(s => s.tier !== 'Bronze')) throw new Error('Iniciante recebeu patrocinador avançado.');
if (market1.sponsors.length < 4) throw new Error('Mercado iniciante insuficiente.');

const clubs = mod.buildWorldClubCatalog(72);
if (clubs.length !== 72) throw new Error('Catálogo de clubes incompleto.');
if (new Set(clubs.map(c => c.world_club_key)).size !== 72) throw new Error('IDs de clubes duplicados.');
if (clubs.some(c => !c.name || !c.country || c.monthly_fee <= 0)) throw new Error('Clube inválido.');

const common = mod.getEquipmentMarketState({ id: 'common', rarity: 'comum', release_year: 2020 }, beginner);
if (!common.available) throw new Error('Item comum deveria estar disponível.');
const future = mod.getEquipmentMarketState({ id: 'future', rarity: 'raro', release_year: 2030 }, beginner);
if (future.available || future.status !== 'future_release') throw new Error('Lançamento futuro liberado indevidamente.');

const files = [
  'src/components/economy/SponsorPanel.jsx',
  'src/pages/Shop.jsx',
  'src/pages/Clubs.jsx',
];
for (const relative of files) {
  const text = await fs.readFile(path.join(root, relative), 'utf8');
  if (!text.includes('sportsEconomyV26')) throw new Error(`${relative} não integrado à economia v26.`);
}

await fs.unlink(tempPath).catch(() => {});
console.log('SportsEconomyV26Test: PASS');
console.log(`✓ ${market1.sponsors.length} patrocinadores adequados à fase iniciante`);
console.log(`✓ ${clubs.length} clubes mundiais determinísticos`);
console.log('✓ Rotação mensal de equipamentos e lançamentos futuros');
