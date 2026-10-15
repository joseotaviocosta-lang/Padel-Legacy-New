// Playthrough 5.24, Parte C — AUTORIDADE ÚNICA de PAÍSES.
//
// Causa raiz da divergência (header do Ranking × página de Países): cada
// superfície contava países a partir de uma fonte diferente.
//   - Ranking.jsx contava países distintos dentro de `buildWorldRankingSnapshot`
//     (que deduplica atletas por nome, exclui inativos e ainda inclui o
//     jogador), então o número não batia com o diretório.
//   - Countries.jsx contava a partir de `AthleteProfile.list(1500)` + `Club`,
//     incluindo também países que só têm clube.
//
// Critério canônico (uma só regra, usada por TODOS os pontos):
//   "país = unidade de país de ao menos 1 atleta ATIVO (não aposentado) do
//    circuito OU de ao menos 1 clube mapeado."
// A contagem é `buildCountryDirectory(...).length`, sempre a partir das
// MESMAS listas (AthleteProfile ativos + Club), então header e página não
// podem divergir por construção.
export const COUNTRY_FALLBACK = 'Internacional';

export function countryOf(entity) {
  return entity?.country || entity?.nationality || COUNTRY_FALLBACK;
}

export function buildCountryDirectory(athletes = [], clubs = []) {
  const map = new Map();
  const activeAthletes = (athletes || []).filter((athlete) => athlete && !athlete.retired);
  const totalAthletes = activeAthletes.length || 1;

  const ensure = (name) => {
    const key = name || COUNTRY_FALLBACK;
    if (!map.has(key)) map.set(key, { name: key, athletes: 0, clubs: 0, totalPoints: 0, topAthletes: [] });
    return map.get(key);
  };

  for (const athlete of activeAthletes) {
    const entry = ensure(countryOf(athlete));
    entry.athletes += 1;
    entry.totalPoints += Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0;
    entry.topAthletes.push({
      id: athlete.id,
      name: athlete.name || athlete.sport_name || 'Atleta',
      points: Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0,
    });
  }

  for (const club of clubs || []) {
    const entry = ensure(countryOf(club));
    entry.clubs += 1;
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      representation: Math.round((entry.athletes / totalAthletes) * 1000) / 10,
      topAthletes: entry.topAthletes.sort((a, b) => b.points - a.points).slice(0, 3),
    }))
    .sort((a, b) => b.athletes - a.athletes || b.totalPoints - a.totalPoints || a.name.localeCompare(b.name, 'pt-BR'));
}

export function countCountries(athletes = [], clubs = []) {
  return buildCountryDirectory(athletes, clubs).length;
}
