// Playthrough 5.27-G — mercados de Busca de parceiro gravados (25: 2 reais da
// micro + 23 amostrados de saves) e o seletor equilibrado do Normal, aplicado
// offline com a MESMA pontuação do simulador (v527gPartnerScore).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalPartnerScore } from './v527gPartnerScore.mjs';

export const DUMP_DIRS = ['reports/rebalance-527g/partner-dump'];
export function loadSearchMarkets(dirs = DUMP_DIRS) {
  return dirs.filter(existsSync).flatMap((d) => readdirSync(d).flatMap((f) => readFileSync(join(d, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))))
    .filter((m) => String(m.kind).startsWith('search'))
    // OVR da tela/motor (média de atributos), não o `overall_rating` declarado.
    .map((m) => ({ ...m, candidates: m.candidates.map((c) => ({ ...c, uiOvr: c.attrOvr || c.ovr })) }));
}
export const pickNormal = (m) => [...m.candidates].map((c) => ({ c, s: normalPartnerScore({ compatibility: c.compatibility, candidateOvr: c.uiOvr, playerOvr: m.playerOvr, coins: m.coins, salary: c.salary, prizeSplit: c.prizeSplit }) })).sort((a, b) => b.s - a.s)[0].c;
export const pickCompat = (m) => [...m.candidates].sort((a, b) => b.compatibility - a.compatibility)[0];
export const pickOptimizer = (m) => [...m.candidates].sort((a, b) => ((b.worldPoints || 0) || b.uiOvr) - ((a.worldPoints || 0) || a.uiOvr))[0];
export const bestOvr = (m) => Math.max(...m.candidates.map((c) => c.uiOvr));
export const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
