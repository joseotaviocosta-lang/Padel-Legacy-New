// Playthrough 5.26-B — kit mínimo compartilhado pelos testes de integridade.
// Cada teste roda os MÓDULOS REAIS do jogo (Vite SSR) e, quando precisa de
// carreira, a mesma criação da tela "Nova carreira" (scripts/lib/v526CareerSim.mjs).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installBrowserShim, installDeterminism, MemoryStorage, bootRuntime, createRealCareer } from './v526CareerSim.mjs';

export { assert };

export function makeSuite(title) {
  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); console.log(`✓ ${name}`); }
    catch (error) { results.push({ name, ok: false }); console.log(`✗ ${name}\n  ${String(error?.message || error).split('\n').slice(0, 12).join('\n  ')}`); }
  };
  const finish = () => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${title}: ${results.length - failed}/${results.length} passaram`);
    process.exit(failed ? 1 : 0);
  };
  return { check, finish };
}

/** Só os módulos (sem carreira): para regras puras. */
export async function bootModules() {
  installBrowserShim();
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
  return { load: (p) => server.ssrLoadModule(p), close: () => server.close() };
}

/** Carreira real em storage de memória (opcionalmente reaproveitando `files`). */
export async function bootCareer(seed, { files = new Map() } = {}) {
  installDeterminism(seed);
  const storage = new MemoryStorage(files);
  const rt = await bootRuntime(storage);
  const { careerId, profile } = await createRealCareer(rt, { saveName: `teste-${seed}` });
  return { rt, storage, files, careerId, profile };
}

/** Destrói o runtime e recarrega a mesma carreira do storage persistido. */
export async function reloadCareer(rt, storage, careerId) {
  await rt.close();
  const next = await bootRuntime(storage);
  const loaded = await next.careerManager.loadCareer(careerId);
  next.runtime.activeCareerAdapter.setActiveCareer(loaded);
  return next;
}
