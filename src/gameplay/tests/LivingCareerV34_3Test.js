import assert from 'node:assert/strict';
import { buildCareerTimeline, buildSeasonRetrospectives } from '../../lib/careerStory.js';

const profile = { id: 'p1', sport_name: 'José', career_date: '2028-08-01', xp: 32000, ranking_position: 87, matches_played: 3, wins: 2, tournaments_won: 1, titles: ['Future Porto Alegre'], partner_id: 'a2', partner_name: 'Miguel', coach_id: 'c1', coach_name: 'Carlos' };
const matches = [
  { id: 'm1', profile_id: 'p1', date: '2026-02-01', winner_profile_id: 'p1', tournament_name: 'Future Curitiba' },
  { id: 'm2', profile_id: 'p1', date: '2026-03-01', winner_profile_id: 'x', tournament_name: 'Future Recife' },
  { id: 'm3', profile_id: 'p1', date: '2027-04-01', winner_profile_id: 'p1', tournament_name: 'Future Porto Alegre', round: 'Final' },
];
const timeline = buildCareerTimeline(profile, matches);
assert(timeline.some((event) => event.id.startsWith('first-match')));
assert(timeline.some((event) => event.id.startsWith('first-win')));
assert(timeline.some((event) => event.id === 'rank-100'));
assert(timeline.some((event) => event.type === 'partnership'));
const seasons = buildSeasonRetrospectives(profile, matches);
assert.equal(seasons.length, 2);
assert.equal(seasons.find((season) => season.year === 2027).titles, 1);
assert.equal(seasons.find((season) => season.year === 2026).matches, 2);
console.log('LivingCareerV34_3Test: PASS (timeline + retrospectives)');
