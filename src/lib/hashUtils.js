// Fase 0.3, item 3 da auditoria de atletas reais vs. bots — extração pura
// (sem mudança de algoritmo) do hash FNV-1a-variante que estava duplicado
// em 29 arquivos de produção (grep de `2166136261`, a constante de offset
// básico do FNV-1a de 32 bits). A medição da Fase 1C (10.000 ids no
// formato real de produção, teste de coorte com poder estatístico
// adequado) não encontrou concentração significativa nesta função — a
// extração aqui é só remoção de duplicação, não uma troca de algoritmo.
//
// Cada chamador mantém sua PRÓPRIA normalização de entrada (String(x||''),
// String(x), etc.) e sua PRÓPRIA transformação de saída (toString(16),
// toString(36), /4294967295, % intervalo, Math.abs — que é sempre um no-op
// aqui, já que `value >>> 0` nunca é negativo) — só o núcleo do laço
// XOR-then-multiply foi centralizado.
//
// Nota sobre a forma do laço: a maioria das implementações duplicadas
// usava `for (const char of texto)` (itera por CODE POINT Unicode);
// algumas usavam `for (let i=0;i<texto.length;i+=1)` (itera por CODE UNIT
// UTF-16). As duas formas só divergem para caracteres fora do plano
// básico multilíngue (emoji, alguns CJK de extensão) — nenhuma entrada
// real deste hash (ids, datas, chaves de mês, nomes em pt/es) usa esses
// caracteres, então a unificação abaixo (indexado, por code unit — a forma
// mais comum e a mais simples de auditar) não muda nenhum resultado
// observável em produção. Confirmado por scripts/test-hash-utils-parity.mjs
// contra uma bateria de strings reais extraídas do jogo.
export function fnv1aHash(str) {
  let value = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    value ^= str.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

// LOCAL-8F — gerador pseudoaleatório semeado por texto (FNV-1a + mulberry32,
// o mesmo par já usado em rankingPopulation.js). Para geração que precisa
// ser reproduzível a partir de uma chave estável (ex.: data da carreira).
export function seededRandom(seedText) {
  let a = fnv1aHash(String(seedText)) >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
