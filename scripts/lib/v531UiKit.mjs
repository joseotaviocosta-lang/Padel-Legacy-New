// Fase 5.31 — kit dos testes *-v531 (Dupla / Parceiro / Staff).
//
// - `withUi`: carrega pelo Vite SSR os módulos reais (aliases '@/') e um
//   `render(Component, props)` (react-dom/server) para montar os
//   componentes redesenhados com fixtures dos estados que não existem nas
//   carreiras de teste (separação pendente, técnico contratado, candidato
//   bloqueado, custo alto). Efeitos (useEffect) não rodam em SSR: o que se
//   mede é a ESTRUTURA que o jogador vê no primeiro render.
// - `measurements(phase)`: as medições do app real (scripts/ui-audit-531.mjs).
// - `gateRunner`: mesmo formato dos testes anteriores.
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { installShims } from './competitiveReviewGates.mjs';

export { gateRunner } from './v527mTestKit.mjs';

export const read = (path) => readFileSync(path, 'utf8');

export async function withUi(paths, work) {
  installShims('/v531');
  // useLayoutEffect do MemoryRouter não roda em SSR: aviso esperado, não erro.
  const originalError = console.error;
  console.error = (...args) => { if (String(args[0] || '').includes('useLayoutEffect does nothing on the server')) return; originalError(...args); };
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  try {
    const mods = {};
    for (const [key, p] of Object.entries(paths)) mods[key] = await server.ssrLoadModule(p);
    const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
    return await work({ ...mods, render });
  } finally { await server.close(); }
}

/** Texto visível aproximado do HTML (sem tags). */
export const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** CTAs primários: o Button level="primary" do design system usa a variante `default` (bg-primary sólido). */
export const primaryCount = (html) => (html.match(/bg-primary text-primary-foreground shadow-/g) || []).length;
export const count = (html, needle) => html.split(needle).length - 1;

export function measurements(phase) {
  const file = `reports/ui-redesign-531/${phase}/measurements.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
export const pick = (data, { screen, viewport, state }) => (data?.results || []).find((r) => r.screen === screen && r.viewport === viewport && (!state || r.state === state)) || null;

export const PROFILE = { id: 'player-1', sport_name: 'Novo Atleta', career_date: '2026-01-29', coins: 6481, career_level: 1, preferred_side: 'right', court_side: 'right' };
export const partnershipFixture = (extra = {}) => ({
  id: 'pship-1', status: 'ativa', partner_name: 'Tomás Acosta', partner_bot_id: 'bot-tomas', partner_country: 'Argentina', partner_level: 'Amador', partner_position: 'flex',
  chemistry: 71, partner_trust: 54, partner_morale: 68, prize_split_pct: 58, shared_matches: 1, shared_wins: 0, shared_titles: 0,
  started_career_date: '2026-01-01', negotiated_duration_days: 30, contract_end_date: '2026-03-03', contract_status: 'ativo',
  compatibility_breakdown: { position: 100, style: 80 }, shared_goals: [], conversations: [], conflicts: [],
  ...extra,
});
