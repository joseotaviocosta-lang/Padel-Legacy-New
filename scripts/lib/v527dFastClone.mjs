// Playthrough 5.27-D (Bloco Q) — otimização do HARNESS, não do jogo.
//
// O profiling mostrou ~48% do tempo de uma carreira simulada em
// structuredClone (ActiveCareerAdapter clona o estado inteiro da carreira a
// cada mutação). No Node, structuredClone serializa/deserializa via V8; para
// árvores de dados simples (o estado da carreira é JSON persistido) uma cópia
// recursiva produz o MESMO resultado bem mais rápido.
//
// Equivalência com structuredClone, para o que o estado contém:
//  - primitivos, undefined, null, -0, NaN: idênticos;
//  - arrays e objetos simples: mesmas chaves, mesma ordem;
//  - Date: nova Date com o mesmo tempo;
//  - aliasing/ciclos: preservados (memo por identidade, como o algoritmo HTML);
//  - qualquer outra coisa (Map, Set, typed arrays, classes, funções...):
//    delega ao structuredClone nativo, inclusive o erro para funções.
// Opt-in pelo ambiente (PL527D_FASTCLONE=1) e só instalado pelo harness. A
// prova de que não muda nenhum resultado é test-job-determinism-v527d.
const nativeStructuredClone = globalThis.structuredClone;

function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function fastClone(value, memo = new Map()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') return nativeStructuredClone(value);
    return value;
  }
  const seen = memo.get(value);
  if (seen !== undefined) return seen;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return nativeStructuredClone(value);
    const out = new Array(value.length);
    memo.set(value, out);
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) continue; // buraco continua buraco
      out[i] = fastClone(value[i], memo);
    }
    return out;
  }
  if (value instanceof Date) {
    const out = new Date(value.getTime());
    memo.set(value, out);
    return out;
  }
  if (!isPlainObject(value)) {
    const out = nativeStructuredClone(value);
    memo.set(value, out);
    return out;
  }
  const out = {};
  memo.set(value, out);
  for (const key of Object.keys(value)) out[key] = fastClone(value[key], memo);
  return out;
}

export function installFastClone() {
  if (process.env.PL527D_FASTCLONE !== '1' || globalThis.__pl527dFastClone) return false;
  globalThis.structuredClone = function structuredClone(value, options) {
    if (options && options.transfer && options.transfer.length) return nativeStructuredClone(value, options);
    return fastClone(value);
  };
  globalThis.__pl527dFastClone = true;
  return true;
}
