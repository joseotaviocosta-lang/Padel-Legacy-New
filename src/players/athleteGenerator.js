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
const STYLES = ['controle', 'ofensivo', 'defensivo', 'equilibrado', 'contra_ataque', 'construtor', 'finalizador'];
const STYLE_ROLES = { controle: 'controlador', ofensivo: 'pressionador', defensivo: 'defensor', equilibrado: 'coringa', contra_ataque: 'defensor', construtor: 'construtor', finalizador: 'finalizador' };
const PERSONALITIES = ['carismatico', 'reservado', 'competitivo', 'calmo', 'lider', 'perfeccionista'];
const ATTRIBUTES = ['serve', 'forehand', 'backhand', 'volley', 'lob', 'smash', 'bandeja', 'speed', 'stamina', 'strength', 'reflexes', 'tactics', 'positioning', 'concentration', 'resilience'];

function number(seed, min, max) { return min + (parseInt(stableHash(seed), 36) % (max - min + 1)); }

export function generateFictionalAthletes({ count = 240, seed = 'padel-legacy-world-v1' } = {}) {
  // Hotfix — nomes coincidiam entre ENTIDADES DIFERENTES (ids distintos,
  // mesmo nome de exibição). Medido: com o hash direto abaixo, o índice de
  // `first`/`last` correlaciona fortemente com o índice de `country` (mesmo
  // prefixo `${seed}:${index}`, sufixo curto diferente) — cada país só
  // alcança ~4 dos 8 nomes/sobrenomes possíveis (16 combinações efetivas,
  // não 64), e ~40 atletas/país esgotam isso muitas vezes (até 13
  // repetições do mesmo nome). Isso é a causa raiz do bug "sorteio coloca o
  // jogador contra a própria dupla": duas entidades DIFERENTES (ids
  // distintos, corretamente excluídas uma da outra por id) podem ter o
  // MESMO nome de exibição — a tela mostra o mesmo nome nos dois lados da
  // partida, mesmo a lógica de exclusão por id estando correta. Corrigido
  // por unicidade explícita, garantida por construção (ver varredura linear
  // abaixo) — não por reamostrar o hash com um sufixo diferente, que
  // reintroduz a MESMA correlação (medido, ainda sobravam colisões).
  const usedNamesByCountry = new Map();
  return Array.from({ length: count }, (_, index) => {
    const country = COUNTRIES[number(`${seed}:${index}:country`, 0, COUNTRIES.length - 1)];
    const [firstNames, lastNames] = NAMES[country];
    const usedNames = usedNamesByCountry.get(country) || new Set();
    usedNamesByCountry.set(country, usedNames);
    // Amostrar o hash de novo com um sufixo diferente ("retry1", "retry2"...)
    // não resolve: a MESMA correlação estrutural entre sufixos curtos e
    // parecidos reaparece (medido — ainda sobravam colisões). Em vez disso,
    // varredura linear DETERMINÍSTICA sobre o espaço completo de combinações
    // (firstNames.length × lastNames.length), começando no par natural do
    // hash — não depende da qualidade do hash pra garantir unicidade, só do
    // tamanho do espaço (64 combinações, bem acima dos ~40 atletas/país).
    const totalCombos = firstNames.length * lastNames.length;
    const naturalCombo = number(`${seed}:${index}:first`, 0, firstNames.length - 1) * lastNames.length
      + number(`${seed}:${index}:last`, 0, lastNames.length - 1);
    let name;
    for (let offset = 0; offset < totalCombos; offset += 1) {
      const combo = (naturalCombo + offset) % totalCombos;
      name = `${firstNames[Math.floor(combo / lastNames.length)]} ${lastNames[combo % lastNames.length]}`;
      if (!usedNames.has(name)) break;
    }
    usedNames.add(name);
    const tier = Math.min(5, Math.floor(index * 6 / count));
    const overall = number(`${seed}:${index}:overall`, 10 + tier * 14, 23 + tier * 14);
    const sideRoll = index % 20;
    const preferredSide = sideRoll < 9 ? 'right' : sideRoll < 18 ? 'left' : 'flex';
    const attributes = Object.fromEntries(ATTRIBUTES.map(key => [key, Math.max(1, Math.min(100, overall + number(`${seed}:${index}:${key}`, -7, 7)))]));
    const templateId = `bot:${seed}:${String(index + 1).padStart(4, '0')}`;
    let playStyle = STYLES[number(`${seed}:${index}:style`, 0, STYLES.length - 1)];
    const handedness = number(`${seed}:${index}:hand`, 0, 9) === 0 ? 'left' : 'right';
    if (handedness === 'left' && preferredSide === 'right' && index % 3 === 0) playStyle = index % 2 ? 'ofensivo' : 'finalizador';
    return normalizeAthlete({
      template_id: templateId, source_type: 'fictional', name, country,
      preferred_side: preferredSide, handedness,
      side_flexibility: preferredSide === 'flex' ? 0.88 : number(`${seed}:${index}:flex`, 12, 48) / 100,
      play_style: playStyle, tactical_role: STYLE_ROLES[playStyle], archetype_id: `${preferredSide}-${handedness}-${STYLE_ROLES[playStyle]}`,
      personality: PERSONALITIES[number(`${seed}:${index}:personality`, 0, PERSONALITIES.length - 1)],
      overall, overall_rating: overall, potential: Math.min(100, overall + number(`${seed}:${index}:potential`, 3, 18)),
      age: number(`${seed}:${index}:age`, 18, 37), attributes,
      ranking_position: 25 + index, world_rank: 25 + index, market_status: 'livre', career_status: 'ativo',
    });
  });
}
