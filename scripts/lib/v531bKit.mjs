// Hotfix 5.31-B — kit dos testes *-v531b (contenção mobile + prioridade do nome).
// Lê as medições do app real (reports/ui-hotfix-531b/tools/audit.mjs) e a
// reprodução do card de técnico com o CSS real (tools/coach-card-repro.mjs).
import { existsSync, readFileSync } from 'node:fs';

export { gateRunner } from './v527mTestKit.mjs';
export { withUi, textOf, read } from './v531UiKit.mjs';

const json = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
export const audit = (phase) => json(`reports/ui-hotfix-531b/${phase}/measurements.json`);
export const repro = () => json('reports/ui-hotfix-531b/coach-card-repro.json');
export const VIEWPORTS = ['360', '390', 'desktop', 'landscape'];
export const groupsOf = (data, filter = () => true) => (data?.results || []).flatMap((r) => r.groups.filter(filter).map((g) => ({ ...g, screen: r.screen, viewport: r.viewport, state: r.state })));
export const where = (rows) => JSON.stringify(rows.slice(0, 4).map((g) => `${g.state}/${g.screen}@${g.viewport}:${g.label?.slice(0, 20)}`));
