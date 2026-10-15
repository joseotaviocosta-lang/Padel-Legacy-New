// Playthrough 5.26-C, Bloco P — conferência manual de saves finais.
// Carrega o save gravado por --keepSave (<perfil>-<seed>.save.json) num
// runtime NOVO, pelo mesmo caminho de carregamento do jogo
// (careerManager.loadCareer), e lê o estado pelas mesmas funções das telas:
// rank (getWorldRank), moedas, patrocínios ativos, staff/treinador, parceiro
// (Partnership ativa + AthleteProfile), títulos, equipamento, idade e
// reputação. Também mede as maiores tabelas do save (Bloco K).
//   node scripts/inspect-save-v526c.mjs <run.json> [<run.json> ...]
// Saída: reports/progression-clean-526c/manual-check.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDeterminism, MemoryStorage, bootRuntime } from './lib/v526CareerSim.mjs';

const runs = process.argv.slice(2);
const results = [];
for (const runFile of runs) {
  const run = JSON.parse(readFileSync(runFile, 'utf8'));
  const saveFile = runFile.replace(/\.json$/, '.save.json');
  if (!existsSync(saveFile)) { results.push({ run: runFile, error: 'save não gravado (--keepSave)' }); continue; }
  const save = JSON.parse(readFileSync(saveFile, 'utf8'));
  installDeterminism(`inspect-${run.profile}-${run.seed}`);
  const rt = await bootRuntime(new MemoryStorage(new Map(Object.entries(save))));
  try {
    const loaded = await rt.careerManager.loadCareer(run.careerId);
    rt.runtime.activeCareerAdapter.setActiveCareer(loaded);
    const E = rt.localGame.entities;
    const profile = await E.PlayerProfile.get(run.profileId);
    const world = await rt.padel.getWorldRank(profile).catch(() => null);
    const partnership = ((await E.Partnership.filter({ profile_id: profile.id, status: 'ativa' }).catch(() => [])) || [])[0] || null;
    const partner = partnership ? await E.AthleteProfile.get(partnership.partner_bot_id).catch(() => null) : null;
    const contracts = ((await E.PlayerContract.filter({ profile_id: profile.id, is_active: true }).catch(() => [])) || []);
    const staff = ((await E.PlayerStaffHire.filter({ profile_id: profile.id }).catch(() => [])) || []).filter((s) => s.status !== 'demitido' && s.status !== 'dismissed' && s.is_active !== false && (!s.contract_end_date || s.contract_end_date >= profile.career_date));
    const inventory = ((await E.PlayerInventory?.filter({ profile_id: profile.id }).catch(() => [])) || []);
    const lastWeek = run.weekly.at(-1);
    const age = rt.padel.ageAtDate ? rt.padel.ageAtDate(profile.birth_date, profile.career_date) : null;
    // O save é um JSON por carreira: mede cada coleção de `entities` e as seções de topo.
    const careerJson = JSON.parse(Object.entries(save).find(([path]) => path.startsWith('careers/'))?.[1] || '{}');
    const mb = (v) => Math.round((JSON.stringify(v ?? null).length / 1048576) * 100) / 100;
    const tables = [
      ...Object.entries(careerJson.entities || {}).map(([name, rows]) => ({ table: `entities.${name}`, rows: Array.isArray(rows) ? rows.length : Object.keys(rows || {}).length, MB: mb(rows) })),
      ...Object.entries(careerJson).filter(([k]) => k !== 'entities').map(([k, v]) => ({ table: k, MB: mb(v) })),
    ].sort((a, b) => b.MB - a.MB);
    const row = {
      run: runFile, profile: run.profile, seed: run.seed, careerDate: profile.career_date,
      rank: world?.rank ?? null, rankInRunLog: lastWeek?.rank ?? null, rankingPositionField: profile.ranking_position ?? null,
      coins: profile.coins, coinsInRunLog: run.finalCoins,
      sponsors: contracts.map((c) => `${c.sponsor_name || c.sponsor_id} (${c.sponsor_tier || c.tier || '?'})`), sponsorsInRunLog: lastWeek?.sponsors ?? null,
      coach: profile.coach_id || null, staff: staff.map((s) => s.staff_type || s.role), staffInRunLog: lastWeek?.staff ?? null,
      partner: partner ? { name: partner.name, ovr: partner.overall ?? partner.overall_rating, retired: Boolean(partner.retired) } : null,
      titles: Number(profile.tournaments_won) || 0, titlesInRunLog: run.tournaments.filter((t) => t.status === 'champion').length,
      equipment: inventory.length ? { owned: inventory.length, equipped: inventory.filter((i) => i.equipped || i.is_equipped).length } : { owned: lastWeek?.gearOwned ?? null, equipped: lastWeek?.gearEquipped ?? null, source: 'run log' },
      age, ageInRunLog: lastWeek?.age ?? null, reputation: profile.reputation ?? null, reputationInRunLog: lastWeek?.reputation ?? null,
      saveMB: Math.round((Object.values(save).reduce((t, v) => t + v.length, 0) / 1048576) * 100) / 100, largestTables: tables.slice(0, 8),
    };
    row.consistent = row.rank === row.rankInRunLog && row.coins === row.coinsInRunLog && row.titles === row.titlesInRunLog && row.age === row.ageInRunLog;
    results.push(row);
    console.log(JSON.stringify(row));
  } catch (error) {
    results.push({ run: runFile, error: error.message });
  } finally {
    await rt.close();
  }
}
writeFileSync(resolve('reports/progression-clean-526c/manual-check.json'), JSON.stringify(results, null, 2));
process.exit(0);
