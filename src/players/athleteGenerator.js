import { normalizeAthlete, stableHash } from './athleteSchema.js';

const NAMES = {
  Brasil: [['Caio', 'Davi', 'Enzo', 'João', 'Lucas', 'Rafael', 'Thiago', 'Vinícius'], ['Almeida', 'Costa', 'Ferreira', 'Martins', 'Oliveira', 'Pereira', 'Santos', 'Silva']],
  Argentina: [['Agustín', 'Facundo', 'Franco', 'Joaquín', 'Mateo', 'Nicolás', 'Tomás', 'Valentín'], ['Acosta', 'Benítez', 'Giménez', 'López', 'Romero', 'Ruiz', 'Sosa', 'Vega']],
  Espanha: [['Álvaro', 'Carlos', 'Hugo', 'Iker', 'Javier', 'Marcos', 'Pablo', 'Sergio'], ['Alonso', 'García', 'Iglesias', 'Martínez', 'Navarro', 'Ortega', 'Ramos', 'Torres']],
  Portugal: [['Afonso', 'Diogo', 'Gonçalo', 'Miguel', 'Nuno', 'Pedro', 'Rui', 'Tiago'], ['Cardoso', 'Correia', 'Fernandes', 'Mendes', 'Monteiro', 'Rocha', 'Sousa', 'Teixeira']],
  Itália: [['Alessio', 'Andrea', 'Davide', 'Lorenzo', 'Marco', 'Matteo', 'Riccardo', 'Simone'], ['Bianchi', 'Conti', 'Ferrari', 'Moretti', 'Ricci', 'Rossi', 'Romano', 'Villa']],
  França: [['Alexandre', 'Clément', 'Hugo', 'Julien', 'Louis', 'Mathis', 'Nathan', 'Théo'], ['Bernard', 'Dubois', 'Fontaine', 'Laurent', 'Leroy', 'Martin', 'Moreau', 'Petit']],
};
const COUNTRIES = Object.keys(NAMES);
const STYLES = ['Agressivo', 'Defensivo', 'Equilibrado', 'Tático', 'Potência'];
const PERSONALITIES = ['carismatico', 'reservado', 'competitivo', 'calmo', 'lider', 'perfeccionista'];
const ATTRIBUTES = ['serve', 'forehand', 'backhand', 'volley', 'lob', 'smash', 'bandeja', 'speed', 'stamina', 'strength', 'reflexes', 'tactics', 'positioning', 'concentration', 'resilience'];

function number(seed, min, max) { return min + (parseInt(stableHash(seed), 36) % (max - min + 1)); }

export function generateFictionalAthletes({ count = 240, seed = 'padel-legacy-world-v1' } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const country = COUNTRIES[number(`${seed}:${index}:country`, 0, COUNTRIES.length - 1)];
    const [firstNames, lastNames] = NAMES[country];
    const name = `${firstNames[number(`${seed}:${index}:first`, 0, firstNames.length - 1)]} ${lastNames[number(`${seed}:${index}:last`, 0, lastNames.length - 1)]}`;
    const tier = Math.min(5, Math.floor(index * 6 / count));
    const overall = number(`${seed}:${index}:overall`, 10 + tier * 14, 23 + tier * 14);
    const sideRoll = index % 20;
    const preferredSide = sideRoll < 9 ? 'right' : sideRoll < 18 ? 'left' : 'flex';
    const attributes = Object.fromEntries(ATTRIBUTES.map(key => [key, Math.max(1, Math.min(100, overall + number(`${seed}:${index}:${key}`, -7, 7)))]));
    const templateId = `bot:${seed}:${String(index + 1).padStart(4, '0')}`;
    return normalizeAthlete({
      template_id: templateId, source_type: 'fictional', name, country,
      preferred_side: preferredSide, handedness: number(`${seed}:${index}:hand`, 0, 9) === 0 ? 'left' : 'right',
      side_flexibility: preferredSide === 'flex' ? 0.88 : number(`${seed}:${index}:flex`, 12, 48) / 100,
      play_style: STYLES[number(`${seed}:${index}:style`, 0, STYLES.length - 1)],
      personality: PERSONALITIES[number(`${seed}:${index}:personality`, 0, PERSONALITIES.length - 1)],
      overall, overall_rating: overall, potential: Math.min(100, overall + number(`${seed}:${index}:potential`, 3, 18)),
      age: number(`${seed}:${index}:age`, 18, 37), attributes,
      ranking_position: 25 + index, world_rank: 25 + index, market_status: 'livre', career_status: 'ativo',
    });
  });
}
