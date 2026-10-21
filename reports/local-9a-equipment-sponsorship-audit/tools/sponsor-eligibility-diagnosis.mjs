// LOCAL-9A — por que scripts/test-sponsor-eligibility-authority-v526c.mjs passa só 3/7.
// Reexecuta as MESMAS asserções do teste (sem alterá-lo) com o fixture original e com o fixture
// acrescido de `tournaments_played`, isolando a causa. Carreira em MEMÓRIA; nada de src/ alterado.
// Uso: node reports/local-9a-equipment-sponsorship-audit/tools/sponsor-eligibility-diagnosis.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootCareer } from '../../../scripts/lib/v526bTestKit.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { rt, profile: p0 } = await bootCareer('local-9a-sponsor');
const report = { generatedBy: 'LOCAL-9A sponsor-eligibility-diagnosis', variants: {} };
try {
  const S = await rt.load('/src/lib/sponsors.js');
  const B = await rt.load('/src/lib/balance527.js');
  const E = rt.localGame.entities;
  report.preset = B.getBalance527().id;
  report.proofGate = { requireProof: B.getBalance527().sponsor.requireProof, proofMinTournaments: B.getBalance527().sponsor.proofMinTournaments, rule: 'balance527.hasSponsorProof: tournaments_played >= proofMinTournaments' };
  report.careerProfileTournamentsPlayed = p0.tournaments_played ?? null;
  const birthFor = (careerDate, age) => `${Number(careerDate.slice(0, 4)) - age}${careerDate.slice(4)}`;

  for (const [variant, extra] of Object.entries({ fixture_original_do_teste: {}, fixture_com_tournaments_played_1: { tournaments_played: 1 } })) {
    const base = (over = {}) => ({ id: p0.id, career_date: '2028-06-01', birth_date: birthFor('2028-06-01', 25), xp: 99999, tournaments_won: 99, fan_appeal: 100, ...extra, ...over });
    const rows = [];
    const run = async (name, fn) => { try { const detail = await fn(); rows.push({ name, ok: true, detail: detail ?? null }); } catch (e) { rows.push({ name, ok: false, reason: String(e?.message || e).split('\n')[0] }); } };
    const must = (cond, msg) => { if (!cond) throw new Error(msg); };

    await run('1. os 9 originais sem is_available são elegíveis', () => {
      const out = {};
      for (const id of ['babolat', 'siux', 'varlion', 'nox', 'wilson', 'adidas', 'joma', 'bullpadel', 'head']) out[id] = S.canSign(S.SPONSOR_CATALOG.find((x) => x.id === id), base());
      const bad = Object.entries(out).filter(([, r]) => !r.ok);
      must(!bad.length, `recusados: ${bad.map(([id, r]) => `${id}="${r.reason}"`).join('; ')}`);
    });
    await run('2. is_available:false explícito bloqueia', () => {
      const r = S.canSign({ ...S.SPONSOR_CATALOG[0], is_available: false }, base());
      must(!r.ok && /não aceita novos contratos/.test(r.reason), r.reason);
    });
    await run('3. limiares: barra 1 abaixo e libera no valor exato', () => {
      const bad = [];
      for (const s of S.SPONSOR_CATALOG) {
        const ok = base({ xp: s.min_xp || 0, tournaments_won: s.min_titles || 0, fan_appeal: s.min_fan_appeal || 0, birth_date: birthFor('2028-06-01', s.min_age || 16) });
        const r = S.canSign(s, ok);
        if (!r.ok) bad.push(`${s.id}="${r.reason}"`);
      }
      must(!bad.length, `no limiar recusados: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
    });
    await run('4. idade pela data da carreira', () => {
      const r = S.canSign(S.SPONSOR_CATALOG.find((x) => x.id === 'head'), base({ career_date: '2034-06-01', birth_date: '2008-01-01' }));
      must(r.ok, r.reason);
    });
    await run('5. signSponsorContract recusa com o motivo do canSign', async () => {
      const s = S.SPONSOR_CATALOG.find((x) => x.id === 'head');
      const weak = { ...(await E.PlayerProfile.get(p0.id)), ...extra, xp: 0, tournaments_won: 0, fan_appeal: 0 };
      const reason = S.canSign(s, weak).reason;
      let threw = null; try { await S.signSponsorContract(weak, s); } catch (e) { threw = e.message; }
      must(threw && threw.startsWith(reason.slice(0, 10)), `canSign="${reason}" / sign="${threw}"`);
      return { reason };
    });
    await run('6. signSponsorContract assina um original', async () => {
      const cur = await E.PlayerProfile.get(p0.id);
      const p = { ...cur, ...base({ career_date: cur.career_date }) };
      p.birth_date = birthFor(p.career_date, 25);
      const existing = ((await E.PlayerContract.filter({ profile_id: p0.id, sponsor_id: 'babolat', is_active: true })) || []);
      for (const c of existing) await E.PlayerContract.update(c.id, { is_active: false });
      await S.signSponsorContract(p, S.SPONSOR_CATALOG.find((x) => x.id === 'babolat'));
    });
    await run('7. tela, modal e harness usam canSign', () => {
      must(/canSign\(sponsor, profile\)/.test(readFileSync('src/components/economy/SponsorPanel.jsx', 'utf8')), 'SponsorPanel');
      must(/canSign\(sponsor, profile\)/.test(readFileSync('src/components/economy/SponsorNegotiationModal.jsx', 'utf8')), 'Modal');
      must(/A\.sponsors\.canSign\(sponsor, profile\)/.test(readFileSync('scripts/lib/v526Actions.mjs', 'utf8')), 'harness');
    });
    report.variants[variant] = { passed: rows.filter((r) => r.ok).length, total: rows.length, rows };
    console.log(`${variant}: ${rows.filter((r) => r.ok).length}/${rows.length}`);
    for (const r of rows.filter((x) => !x.ok)) console.log(`  ✗ ${r.name}: ${r.reason}`);
  }

  // UI × motor: a tela mostra o mesmo mercado e a mesma regra?
  const panel = readFileSync('src/components/economy/SponsorPanel.jsx', 'utf8');
  report.uiVsEngine = {
    panelUsesMonthlyMarket: /getMonthlySponsorMarket/.test(panel) || /getMonthlySponsorMarket/.test(readFileSync('src/pages/Economy.jsx', 'utf8')),
    panelUsesCanSign: /canSign\(sponsor, profile\)/.test(panel),
    signUsesCanSign: /const check = canSign\(sponsor, profile\)/.test(readFileSync('src/lib/sponsors.js', 'utf8')),
    renewContractChecksCanSign: /renewContract[\s\S]{0,400}canSign/.test(readFileSync('src/lib/sponsors.js', 'utf8')),
    renewContractKeepsSponsorCategory: /renewContract[\s\S]{0,1600}sponsor_category/.test(readFileSync('src/lib/sponsors.js', 'utf8')),
  };
} finally {
  await rt.close();
}
writeFileSync(resolve(OUT, 'sponsor-eligibility-diagnosis.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.uiVsEngine));
