// Playthrough 5.26-C, Bloco B — autoridade única de elegibilidade de patrocínio.
// canSign (sponsors.js) decide para a tela (SponsorPanel, modal de
// negociação), para a assinatura (signSponsorContract) e para o harness.
// Bug corrigido: campo `is_available` AUSENTE era lido como "não aceita novos
// contratos" — os 9 patrocinadores originais do catálogo ficavam bloqueados
// para sempre. Só `is_available: false` explícito bloqueia. Limiares
// inalterados.
import { readFileSync } from 'node:fs';
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-sponsor-eligibility-authority-v526c');
const { rt, profile: p0 } = await bootCareer('sponsor-authority-526c');
try {
  const S = await rt.load('/src/lib/sponsors.js');
  const E = rt.localGame.entities;
  const birthFor = (careerDate, age) => `${Number(careerDate.slice(0, 4)) - age}${careerDate.slice(4)}`;
  const base = (over = {}) => ({ id: p0.id, career_date: '2028-06-01', birth_date: birthFor('2028-06-01', 25), xp: 99999, tournaments_won: 99, fan_appeal: 100, ...over });
  const original = ['babolat', 'siux', 'varlion', 'nox', 'wilson', 'adidas', 'joma', 'bullpadel', 'head'];

  await check('os 9 patrocinadores originais não têm `is_available` e agora são elegíveis', () => {
    for (const id of original) {
      const s = S.SPONSOR_CATALOG.find((x) => x.id === id);
      assert.equal(s.is_available, undefined, id);
      assert.deepEqual(S.canSign(s, base()), { ok: true }, id);
    }
  });
  await check('`is_available: false` explícito continua bloqueando', () => {
    const s = { ...S.SPONSOR_CATALOG[0], is_available: false };
    assert.equal(S.canSign(s, base()).ok, false);
    assert.match(S.canSign(s, base()).reason, /não aceita novos contratos/);
  });
  await check('limiares inalterados: cada requisito barra 1 abaixo e libera no valor exato', () => {
    for (const s of S.SPONSOR_CATALOG) {
      const ok = base({ xp: s.min_xp || 0, tournaments_won: s.min_titles || 0, fan_appeal: s.min_fan_appeal || 0, birth_date: birthFor('2028-06-01', s.min_age || 16) });
      assert.equal(S.canSign(s, ok).ok, true, `${s.id} no limiar`);
      if (s.min_xp) assert.match(S.canSign(s, { ...ok, xp: s.min_xp - 1 }).reason, /XP/);
      if (s.min_titles) assert.match(S.canSign(s, { ...ok, tournaments_won: s.min_titles - 1 }).reason, /título/);
      if (s.min_fan_appeal) assert.match(S.canSign(s, { ...ok, fan_appeal: s.min_fan_appeal - 1 }).reason, /fãs/);
      assert.match(S.canSign(s, { ...ok, birth_date: birthFor('2028-06-01', (s.max_age || 40) + 1) }).reason, /faixa etária/);
    }
  });
  await check('idade pela data da CARREIRA (não pelo relógio real)', () => {
    const s = S.SPONSOR_CATALOG.find((x) => x.id === 'head'); // 22–39
    // Nascido em 2008: 26 anos em 2034 (carreira), 18 no relógio de 2026.
    const p = base({ career_date: '2034-06-01', birth_date: '2008-01-01' });
    assert.equal(S.canSign(s, p).ok, true);
  });
  await check('signSponsorContract aplica a MESMA regra (recusa com o motivo do canSign)', async () => {
    const s = S.SPONSOR_CATALOG.find((x) => x.id === 'head');
    const weak = { ...(await E.PlayerProfile.get(p0.id)), xp: 0, tournaments_won: 0, fan_appeal: 0 };
    await assert.rejects(() => S.signSponsorContract(weak, s), new RegExp(S.canSign(s, weak).reason.slice(0, 10)));
  });
  await check('signSponsorContract assina um original (antes: sempre recusado)', async () => {
    const p = { ...(await E.PlayerProfile.get(p0.id)), ...base({ career_date: (await E.PlayerProfile.get(p0.id)).career_date }) };
    p.birth_date = birthFor(p.career_date, 25);
    await S.signSponsorContract(p, S.SPONSOR_CATALOG.find((x) => x.id === 'babolat'));
    const rows = (await E.PlayerContract.filter({ profile_id: p0.id, sponsor_id: 'babolat' })) || [];
    assert.equal(rows.length, 1);
  });
  await check('tela, modal e harness usam canSign (nenhuma segunda regra)', () => {
    assert.match(readFileSync('src/components/economy/SponsorPanel.jsx', 'utf8'), /canSign\(sponsor, profile\)/);
    assert.match(readFileSync('src/components/economy/SponsorNegotiationModal.jsx', 'utf8'), /canSign\(sponsor, profile\)/);
    assert.match(readFileSync('scripts/lib/v526Actions.mjs', 'utf8'), /A\.sponsors\.canSign\(sponsor, profile\)/);
    assert.doesNotMatch(readFileSync('src/lib/sponsors.js', 'utf8'), /!sponsor\.is_available\b/);
  });
} finally {
  await rt.close();
}
finish();
