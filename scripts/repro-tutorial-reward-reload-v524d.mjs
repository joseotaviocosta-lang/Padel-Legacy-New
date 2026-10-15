// Playthrough 5.24-D, Parte A — REPRODUÇÃO determinística da recompensa do
// tutorial (tutorial-career-created, +50) antes de qualquer correção.
//
// Para cada etapa lê TRÊS fontes, porque "objeto em memória" não prova nada:
//  - memória: localGame.entities (snapshot quente do runtime);
//  - bytes persistidos: o arquivo da carreira dentro do storage (o mesmo
//    contrato de arquivo que o Tauri usa, via shim de plugin:fs);
//  - falhas de escrita: setItem do storage que estourou (o shim engole erros).
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const MISSION = 'tutorial-career-created';

async function snapshot(page, label) {
  return page.evaluate(async (missionId) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const player = (await localGame.entities.PlayerProfile.list(null, 1))?.[0] || null;
    const row = (await localGame.entities.MissionProgress.filter({ mission_id: missionId }).catch(() => []))?.[0] || null;
    // Bytes persistidos: o arquivo careers/<id>.json gravado pelo storage.
    const fs = new Map(JSON.parse(localStorage.getItem('__pl_audit_fs__') || '[]'));
    const careerFiles = [...fs.keys()].filter((k) => /careers\/[^/]+\.json$/.test(k) && !/backup|tmp|recovery/i.test(k));
    let persisted = null;
    for (const key of careerFiles) {
      try {
        const raw = fs.get(key);
        const text = typeof raw === 'string' ? raw : String(raw);
        const career = JSON.parse(text);
        const prow = (career.entities?.MissionProgress || []).find((r) => r.mission_id === missionId) || null;
        persisted = {
          file: key,
          bytes: text.length,
          coins: career.player?.coins ?? null,
          missionStatus: prow?.status || null,
          claimed: Boolean(prow?.claimed),
          revision: career.__save_meta?.revision ?? career.updated_at ?? null,
        };
      } catch (e) { persisted = { file: key, error: String(e.message).slice(0, 120) }; }
    }
    return {
      memory: { coins: player?.coins ?? null, missionStatus: row?.status || null, claimed: Boolean(row?.claimed) },
      persisted,
      storageChars: (localStorage.getItem('__pl_audit_fs__') || '').length,
      fsFiles: [...fs.keys()],
      quotaFailures: window.__plQuotaFailures || [],
      shimFailures: window.__plShimPersistFailures || [],
    };
  }, MISSION).then((s) => ({ label, ...s }));
}

async function run() {
  const browser = await launch();
  const results = [];
  try {
    const page = await openCareer(browser, { width: 360, height: 800, mobile: true });
    // Instrumenta falhas do storage a partir daqui (vale também após reload).
    await page.evaluateOnNewDocument(() => {
      window.__plQuotaFailures = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(key, value) {
        try { return original.call(this, key, value); } catch (e) {
          window.__plQuotaFailures.push({ key, chars: String(value).length, error: e.name });
          throw e;
        }
      };
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2500));
    results.push(await snapshot(page, '1. após criar carreira (reload limpo)'));
    await goto(page, '/ranking', { settle: 2500 });
    results.push(await snapshot(page, '2. fora da Home'));
    // Navegação SPA para a Home (PUSH) — o caminho real do jogador.
    await page.evaluate(() => { history.pushState(null, '', '/game'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await new Promise((r) => setTimeout(r, 5000));
    await dismissOverlays(page);
    results.push(await snapshot(page, '3. Home (recompensa aplicada?)'));
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 3000));
    results.push(await snapshot(page, '4. após reload'));
    await goto(page, '/ranking', { settle: 2500 });
    results.push(await snapshot(page, '5. reload em outra rota'));
    results.push({ label: 'pageErrors', errors: page.__errors || [] });
  } finally {
    await browser.close();
  }
  for (const r of results) {
    if (r.errors) { console.log(r.label, JSON.stringify(r.errors)); continue; }
    console.log(`${r.label}\n   memória=${JSON.stringify(r.memory)}\n   persistido=${JSON.stringify(r.persisted)}\n   storageChars=${r.storageChars} quotaFailures=${r.quotaFailures.length} shimFailures=${(r.shimFailures || []).length} arquivos=${r.fsFiles.length}`);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
