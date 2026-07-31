// ─── Equipment Catalog Aggregator ────────────────────────────────────────────
// Combines all category catalogs into a single array

import { RACKETS } from './catalog/rackets';
import { GRIPS, BALLS, BAGS } from './catalog/gripsBallsBags';
import { APPAREL, SHOES, TECH, COLLECTIBLES, ACCESSORIES } from './catalog/apparelTechCollectibles';

export const FULL_EQUIPMENT_CATALOG = [
  ...RACKETS,
  ...GRIPS,
  ...BALLS,
  ...BAGS,
  ...APPAREL,
  ...SHOES,
  ...TECH,
  ...COLLECTIBLES,
  ...ACCESSORIES,
];

export const EQUIPMENT_COUNTS = {
  raquetes: RACKETS.length,
  grips: GRIPS.length,
  bolas: BALLS.length,
  mochilas: BAGS.length,
  vestuario: APPAREL.length,
  tenis: SHOES.length,
  tecnologia: TECH.length,
  colecionaveis: COLLECTIBLES.length,
  acessorios: ACCESSORIES.length,
  total: FULL_EQUIPMENT_CATALOG.length,
};