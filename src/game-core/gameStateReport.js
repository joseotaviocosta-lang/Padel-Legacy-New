function isObject(value) {
  return Boolean(value) && typeof value === 'object';
}

/**
 * Mantém o relatório do GameState como um resumo, nunca como outro snapshot
 * completo da carreira. Resultados dos lifecycles usam `profile` para devolver
 * o perfil atualizado ao orquestrador; esse campo não faz parte do relatório
 * persistido e criava uma cadeia recursiva de saves entre dias consecutivos.
 */
export function compactGameStateReport(report) {
  if (!isObject(report)) return { report, changed: false };

  let changed = false;
  const visited = new WeakMap();

  const compact = (value) => {
    if (!isObject(value)) return value;
    if (visited.has(value)) return visited.get(value);

    const output = Array.isArray(value) ? [] : {};
    visited.set(value, output);

    if (Array.isArray(value)) {
      value.forEach((item) => output.push(compact(item)));
      return output;
    }

    Object.entries(value).forEach(([key, item]) => {
      if (key === 'profile') {
        changed = true;
        return;
      }
      output[key] = compact(item);
    });
    return output;
  };

  return { report: compact(report), changed };
}

