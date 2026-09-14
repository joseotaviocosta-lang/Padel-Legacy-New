// Aparência — Fase B: sugestão (não trava) de altura/biotipo por estilo de
// jogo já escolhido no onboarding. A tabela e os nudges de lado/mão são
// ancorados nos MESMOS combos que evaluateBuildAffinity() (initialCareerProfiles.js)
// já usa pra bônus/penalidade de afinidade — este teste prova que a
// extensão física não diverge dessa lógica, cobre os 7 estilos, os 4 combos
// de nudge, e o guard de "sem sugestão" quando estilo/lado/mão ainda não
// foram escolhidos (relevante porque /character não tem gate de acesso).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { STYLE_PHYSICAL_PROFILES, getSuggestedPhysicalRange } =
    await vite.ssrLoadModule('/src/lib/characterPhysicalSuggestion.js');
  const { COURT_SIDE_OPTIONS, PLAY_STYLE_OPTIONS } =
    await vite.ssrLoadModule('/src/lib/initialCareerProfiles.js');

  // ─── Cobertura exaustiva dos 7 estilos reais (vocabulário canônico) ─────
  const realStyleIds = PLAY_STYLE_OPTIONS.map(s => s.id);
  gate('São exatamente 7 estilos no vocabulário canônico (initialCareerProfiles.js)', realStyleIds.length === 7);
  gate('STYLE_PHYSICAL_PROFILES cobre todos os 7 estilos reais, nenhum a mais nem a menos',
    realStyleIds.every(id => STYLE_PHYSICAL_PROFILES[id]) &&
    Object.keys(STYLE_PHYSICAL_PROFILES).length === realStyleIds.length);

  // ─── Nenhuma faixa idêntica byte a byte entre estilos (correção confirmada) ─
  const ranges = Object.entries(STYLE_PHYSICAL_PROFILES).map(([id, p]) => ({ id, key: p.heightRange.join('-') }));
  const uniqueRangeKeys = new Set(ranges.map(r => r.key));
  gate('Nenhum par de estilos tem heightRange idêntico byte a byte (construtor/contra_ataque e controle/defensivo foram diferenciados)',
    uniqueRangeKeys.size === ranges.length);

  // ─── Sobreposição intencional entre estilos vizinhos (não é bug) ────────
  const overlaps = (a, b) => a[0] <= b[1] && b[0] <= a[1];
  gate('equilibrado e construtor têm faixas que se cruzam (vizinhos de tática, sem fronteira rígida)',
    overlaps(STYLE_PHYSICAL_PROFILES.equilibrado.heightRange, STYLE_PHYSICAL_PROFILES.construtor.heightRange));
  gate('controle e defensivo têm faixas que se cruzam (ambos no tier compacto/defesa)',
    overlaps(STYLE_PHYSICAL_PROFILES.controle.heightRange, STYLE_PHYSICAL_PROFILES.defensivo.heightRange));

  // ─── Ordenação tática: potência > neutro > compacto (nenhuma inversão) ──
  gate('finalizador (potência) tem teto de altura maior que defensivo (compacto)',
    STYLE_PHYSICAL_PROFILES.finalizador.heightRange[1] > STYLE_PHYSICAL_PROFILES.defensivo.heightRange[1]);
  gate('ofensivo (potência) tem piso de altura maior que controle (compacto)',
    STYLE_PHYSICAL_PROFILES.ofensivo.heightRange[0] > STYLE_PHYSICAL_PROFILES.controle.heightRange[0]);

  // ─── Os 4 combos de nudge de lado/mão, ancorados em evaluateBuildAffinity() ─
  const semNudgeOfensivo = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'esquerda', playStyle: 'construtor' });
  // baseline sem nudge pra comparação: construtor destro-versátil
  const baseConstrutor = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'versatil', playStyle: 'construtor' });

  const canhotoDireitaOfensivo = getSuggestedPhysicalRange({ handedness: 'left', preferredSide: 'direita', playStyle: 'ofensivo' });
  const baseOfensivoDireita = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: 'ofensivo' });
  gate('Combo 1 — canhoto na direita + ofensivo: +3cm sobre a faixa base (mesmo combo de +14 de afinidade no jogo)',
    canhotoDireitaOfensivo.heightRange[0] === baseOfensivoDireita.heightRange[0] + 3 &&
    canhotoDireitaOfensivo.heightRange[1] === baseOfensivoDireita.heightRange[1] + 3);
  gate('Combo 1 tem sideNote explicando o ângulo de ataque pelo centro', typeof canhotoDireitaOfensivo.sideNote === 'string' && canhotoDireitaOfensivo.sideNote.length > 0);

  const esquerdaFinalizador = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'esquerda', playStyle: 'finalizador' });
  const baseFinalizadorDireita = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: 'finalizador' });
  gate('Combo 2 — lado esquerda + finalizador: +2cm sobre a faixa base (mesmo combo de +10 de afinidade no jogo)',
    esquerdaFinalizador.heightRange[0] === baseFinalizadorDireita.heightRange[0] + 2 &&
    esquerdaFinalizador.heightRange[1] === baseFinalizadorDireita.heightRange[1] + 2);

  const direitaControle = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle' });
  const baseControleVersatil = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'versatil', playStyle: 'controle' });
  gate('Combo 3 — lado direita + controle: -2cm sobre a faixa base (mesmo combo de +10 de afinidade no jogo, reforça compacidade)',
    direitaControle.heightRange[0] === baseControleVersatil.heightRange[0] - 2 &&
    direitaControle.heightRange[1] === baseControleVersatil.heightRange[1] - 2);
  const direitaConstrutor = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: 'construtor' });
  gate('Combo 3 também vale para construtor', direitaConstrutor.heightRange[0] === baseConstrutor.heightRange[0] - 2);
  const direitaDefensivo = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: 'defensivo' });
  const baseDefensivoVersatil = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'versatil', playStyle: 'defensivo' });
  gate('Combo 3 também vale para defensivo', direitaDefensivo.heightRange[0] === baseDefensivoVersatil.heightRange[0] - 2);

  const versatilOfensivo = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'versatil', playStyle: 'ofensivo' });
  gate('Combo 4 — lado versátil: sem nudge (flexibilidade tática, não físico) — sideNote nulo',
    versatilOfensivo.sideNote === null && versatilOfensivo.heightRange[0] === STYLE_PHYSICAL_PROFILES.ofensivo.heightRange[0]);

  // ─── equilibrado e contra_ataque deliberadamente sem nudge de lado ──────
  const todosOsLados = COURT_SIDE_OPTIONS.map(s => s.id);
  for (const side of todosOsLados) {
    const eq = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: side, playStyle: 'equilibrado' });
    gate(`equilibrado + lado ${side}: nenhum nudge (sem combo de afinidade correspondente) — sideNote nulo`, eq.sideNote === null);
    const ca = getSuggestedPhysicalRange({ handedness: 'left', preferredSide: side, playStyle: 'contra_ataque' });
    gate(`contra_ataque + lado ${side} (canhoto): nenhum nudge (sem combo de afinidade correspondente) — sideNote nulo`, ca.sideNote === null);
  }

  // ─── Clamp no range técnico do slider (155-210) ─────────────────────────
  gate('Toda faixa sugerida (mesmo com nudge) fica dentro do range técnico do slider [155,210]',
    Object.keys(STYLE_PHYSICAL_PROFILES).every(style =>
      todosOsLados.every(side => ['right', 'left'].every(hand => {
        const r = getSuggestedPhysicalRange({ handedness: hand, preferredSide: side, playStyle: style });
        return r.heightRange[0] >= 155 && r.heightRange[1] <= 210;
      }))));

  // ─── Guard: sem sugestão quando estilo/lado/mão ainda não escolhidos ────
  gate('Guard: play_style ausente → sem sugestão (null)', getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: null }) === null);
  gate('Guard: play_style ausente (undefined, nunca chamado ainda) → sem sugestão (null)', getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita' }) === null);
  gate('Guard: preferredSide ausente → sem sugestão (null)', getSuggestedPhysicalRange({ handedness: 'right', playStyle: 'ofensivo' }) === null);
  gate('Guard: handedness ausente → sem sugestão (null)', getSuggestedPhysicalRange({ preferredSide: 'direita', playStyle: 'ofensivo' }) === null);
  gate('Guard: nenhum argumento (chamada sem onboarding nenhum) → sem sugestão (null)', getSuggestedPhysicalRange() === null);
  gate('Guard: play_style inválido (não é um dos 7 reais) → sem sugestão (null)', getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'direita', playStyle: 'inexistente' }) === null);
  gate('Guard: preferredSide inválido (não é direita/esquerda/versatil) → sem sugestão (null)', getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'norte', playStyle: 'ofensivo' }) === null);
  gate('Guard: handedness inválido (não é right/left) → sem sugestão (null)', getSuggestedPhysicalRange({ handedness: 'ambos', preferredSide: 'direita', playStyle: 'ofensivo' }) === null);

  // ─── Toda sugestão real tem build primário válido e racional não vazio ──
  for (const style of realStyleIds) {
    const r = getSuggestedPhysicalRange({ handedness: 'right', preferredSide: 'versatil', playStyle: style });
    gate(`${style}: sugestão tem suggestedBuild não vazio e rationale explicando a lógica esportiva`,
      typeof r.suggestedBuild === 'string' && r.suggestedBuild.length > 0 &&
      typeof r.rationale === 'string' && r.rationale.length > 20);
  }

  console.log(`\n${gates} gates executados, todos PASS — Aparência Fase B (sugestão físico↔estilo).`);
} finally {
  await vite.close();
}
