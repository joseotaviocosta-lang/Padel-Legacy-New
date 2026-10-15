// Playthrough 5.26-B — tiers da loja acima de "incomum" desbloqueiam pelas
// regras EXISTENTES (SHOP_PROGRESSION) assim que reputação e posição no
// ranking existem de verdade. Preços não mudaram.
import { makeSuite, bootModules, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-shop-tier-unlock-v526b');
const m = await bootModules();
try {
  const store = await m.load('/src/lib/storeCatalog.js');
  const press = await m.load('/src/lib/pressData.js');
  const item = (rarity) => store.normalizeShopItem({ rarity, name: rarity });
  const unlocked = (p, rarity) => store.getShopItemAccess(p, item(rarity)).unlocked;

  await check('estado bugado da 5.26 (sem reputação, sem ranking_position): trava em incomum', () => {
    const bugged = { career_level: 48, reputation: undefined, ranking_position: undefined };
    assert.equal(unlocked(bugged, 'incomum'), true); assert.equal(unlocked(bugged, 'raro'), false);
  });
  await check('raro desbloqueia com nível 8, Top 500 e reputação 8 (regra atual)', () => assert.equal(unlocked({ career_level: 8, ranking_position: 500, reputation: 8 }, 'raro'), true));
  await check('épico/lendário/mítico/exclusivo seguem as próprias faixas', () => {
    assert.equal(unlocked({ career_level: 15, ranking_position: 200, reputation: 20 }, 'epico'), true);
    assert.equal(unlocked({ career_level: 25, ranking_position: 100, reputation: 40 }, 'lendario'), true);
    assert.equal(unlocked({ career_level: 35, ranking_position: 40, reputation: 65 }, 'mitico'), true);
    assert.equal(unlocked({ career_level: 45, ranking_position: 10, reputation: 85 }, 'exclusivo'), true);
    assert.equal(unlocked({ career_level: 45, ranking_position: 11, reputation: 85 }, 'exclusivo'), false);
  });
  await check('reputação vinda da imprensa (applyReputationEffects) destrava o gate de raro', () => {
    let p = { career_level: 10, ranking_position: 300, reputation: 0 };
    assert.equal(unlocked(p, 'raro'), false);
    p = { ...p, ...press.applyReputationEffects(p, { reputation: 3 }) };
    p = { ...p, ...press.applyReputationEffects(p, { reputation: 6 }) };
    assert.equal(p.reputation, 9); assert.equal(unlocked(p, 'raro'), true);
  });
  await check('pisos de preço inalterados (SHOP_PROGRESSION)', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(store.SHOP_PROGRESSION).map(([k, v]) => [k, v.priceFloor])), { comum: 40, incomum: 250, raro: 1200, epico: 5000, lendario: 16000, mitico: 35000, exclusivo: 65000 });
  });
} finally {
  await m.close();
}
finish();
