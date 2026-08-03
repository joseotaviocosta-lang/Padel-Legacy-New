import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultCareerData } from '../../careers/careerDefaults.js';
import { migrateCareer } from '../../careers/CareerMigration.js';
import {
  applyTutorialSide,
  canChooseTutorialStyle,
  shouldDeliverMissionReward,
  sideMissionRepair,
} from '../../lib/tutorialSideState.js';

const newCareer = createDefaultCareerData({ saveName: 'Teste', playerName: 'A' });
assert.equal(newCareer.metadata.court_side, null, 'new career has no duplicated side selector/default');

const selected = applyTutorialSide({ id: 'p1', play_style: 'controle' }, 'direita');
assert.equal(selected.court_side, 'direita', 'tutorial saves the selected side');
assert.equal(sideMissionRepair(selected, null), 'complete', 'mission completes after side selection');
assert.equal(sideMissionRepair({ court_side: 'esquerda' }, { completed: false, claimed: false }), 'complete', 'existing side auto-completes pending mission');
assert.equal(shouldDeliverMissionReward({ claimed: true, reward_delivered: true }), false, 'completed mission does not reward twice');
assert.equal(shouldDeliverMissionReward({ claimed: false, reward_delivered: true }), false, 'reopened mission does not reward twice');

const careers = [applyTutorialSide({ id: 'a' }, 'direita'), applyTutorialSide({ id: 'b' }, 'esquerda')];
assert.deepEqual(careers.map(item => item.court_side), ['direita', 'esquerda'], 'different careers keep independent sides');
assert.equal(canChooseTutorialStyle({ court_side: null }, { claimed: true }), false, 'style mission remains locked until side exists');
assert.equal(canChooseTutorialStyle({ court_side: 'direita' }, { claimed: true }), true);

const legacy = {
  ...newCareer,
  save_schema_version: 2,
  metadata: { ...newCareer.metadata, court_side: 'direita', side_selected: false },
  player: { id: 'legacy', position: 'esquerda' },
};
const migrated = migrateCareer(legacy).data;
assert.equal(migrated.player.court_side, 'esquerda');
assert.equal('position' in migrated.player, false);

const careerHubSource = fs.readFileSync(new URL('../../pages/CareerHub.jsx', import.meta.url), 'utf8');
assert.equal(careerHubSource.includes('PositionSelection'), false, 'career tab must not mount the legacy selector');

console.log('TutorialSideFlowTest: 7 cenários obrigatórios aprovados.');
