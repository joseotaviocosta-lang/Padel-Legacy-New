// Playthrough 5.27-M — caminho "Salvar nome do atleta" (Missions.jsx →
// saveAthleteName) com instrumentação de persistência.
//
// O playtest físico relatou um congelamento curto ao salvar o nome. No
// Android o custo de cada gravação completa da carreira é serializar o save
// inteiro e mandá-lo pela ponte IPC do Tauri para disco; aqui medimos, no
// mesmo código (storage em memória), quantas gravações completas e quantos
// bytes cada salvamento de nome produz, em 5 salvamentos seguidos.
//
// Gates:
//  1. o 1º salvamento (com recompensa do tutorial) grava a carreira UMA vez;
//  2. salvamentos seguintes (sem recompensa) gravam UMA vez;
//  3. o nome persiste após recarregar o runtime;
//  4. a recompensa do tutorial é paga uma única vez nos 5 salvamentos;
//  5. nenhum erro.
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism } from './lib/v526CareerSim.mjs';

installDeterminism('v527m-name-save');
const storage = new MemoryStorage(new Map());
let bytesWritten = 0;
let fullWrites = 0;
const origWrite = storage.writeText.bind(storage);
storage.writeText = async (p, c) => { if (String(c).length > 50_000) { fullWrites += 1; bytesWritten += String(c).length; } return origWrite(p, c); };

let rt = await bootRuntime(storage);
const created = await createRealCareer(rt, { saveName: 'Nome 527M' });
const careerId = created.careerId;
const profileId = created.profile.id;
const { saveAthleteNameFlow } = await rt.load('/src/onboarding/athleteNameSave.js');
// Como na UI: "Começar tutorial" (career-created) vem antes e destrava a etapa do nome.
await rt.padel.incrementMissionProgress(profileId, 'visit_career', 1, created.profile.career_date);

const runs = [];
const errors = [];
for (let i = 0; i < 5; i += 1) {
  const name = `Atleta Teste ${i + 1}`;
  const writesBefore = fullWrites; const bytesBefore = bytesWritten;
  const coinsBefore = (await rt.localGame.entities.PlayerProfile.get(profileId)).coins;
  const t0 = performance.now();
  try {
    const profile = await rt.localGame.entities.PlayerProfile.get(profileId);
    if (process.env.PL527M_BASELINE === '1') {
      // Caminho ANTERIOR (Missions.jsx até a 5.27-L), só para a medição antes/depois.
      const updated = await rt.localGame.entities.PlayerProfile.update(profile.id, { sport_name: name });
      await rt.padel.incrementMissionProgress(updated.id, 'set_player_name', 1, updated.career_date);
    } else {
      await saveAthleteNameFlow(profile, name);
    }
  } catch (error) { errors.push(error.message); }
  const ms = performance.now() - t0;
  const after = await rt.localGame.entities.PlayerProfile.get(profileId);
  runs.push({ run: i + 1, name, ms: Math.round(ms), fullCareerWrites: fullWrites - writesBefore, bytesWritten: bytesWritten - bytesBefore, coinsDelta: after.coins - coinsBefore, persistedName: after.sport_name });
}

// Recarrega o runtime (equivale a fechar e abrir o app) e confere o nome.
await rt.close();
rt = await bootRuntime(storage);
const loaded = await rt.careerManager.loadCareer(careerId);
rt.runtime.activeCareerAdapter.setActiveCareer(loaded);
const reloaded = await rt.localGame.entities.PlayerProfile.get(profileId);
await rt.close();

const out = { phase: '5.27-M', runs, saveSizeBytes: Math.max(...runs.map((r) => r.bytesWritten / Math.max(1, r.fullCareerWrites))), reloadedName: reloaded.sport_name, errors };
mkdirSync('reports/release-527m', { recursive: true });
writeFileSync(`reports/release-527m/name-save-headless${process.env.PL527M_BASELINE === '1' ? '-baseline' : ''}.json`, JSON.stringify(out, null, 2));
console.table(runs);

assert.equal(runs[0].fullCareerWrites, 1, '1. 1º salvamento (com recompensa) deve gravar a carreira uma única vez');
assert.ok(runs.slice(1).every((r) => r.fullCareerWrites === 1), '2. salvamentos seguintes devem gravar a carreira uma única vez');
assert.equal(reloaded.sport_name, 'Atleta Teste 5', '3. nome persiste após recarregar');
assert.equal(runs.filter((r) => r.coinsDelta > 0).length, 1, '4. recompensa do tutorial paga uma única vez');
assert.equal(errors.length, 0, `5. sem erros: ${errors.join('; ')}`);
console.log('test-name-save-android-path-v527m: 5/5 passaram');
process.exit(0);
