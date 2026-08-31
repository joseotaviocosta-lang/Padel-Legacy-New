import React from 'react';
import { Surface } from '@/components/design-system';

// Correção UI/cronologia — Fase 4 (unificação treino × torneio): o bloco
// "Treinador ao vivo" (toggle + frequência das sugestões + "Permitir somente
// ajustes automáticos leves") e o seletor "Modo da partida" (Completa/
// Resumida/Momentos) só existiam na preparação do treino (SimulationModal),
// nunca na preparação do torneio (TournamentModal) — mesmo os dois
// compartilhando o MESMO LiveMatch.jsx ao vivo, que já lê liveCoachSettings e
// displayMode como props. Extraído aqui como o único lugar onde esse bloco é
// escrito, usado pelos dois contextos sem duplicar JSX — diferenças entre
// treino e torneio (se algum dia houver) entram por prop, nunca por uma
// segunda cópia deste componente.
export default function MatchPreparationControls({
  coach,
  liveCoachSettings,
  onChangeLiveCoachSettings,
  displayMode,
  onChangeDisplayMode,
}) {
  return (
    <>
      <Surface variant="elevated" padding="compact" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold">Treinador ao vivo</p>
            <p className="text-[10px] text-muted-foreground">{coach ? `${coach.name} · ${coach.specialty}` : 'Sem treinador: apenas métricas básicas'}</p>
          </div>
          <button
            aria-pressed={liveCoachSettings.liveCoachEnabled}
            onClick={() => onChangeLiveCoachSettings({ liveCoachEnabled: !liveCoachSettings.liveCoachEnabled })}
            className={`rounded-full px-3 py-1 text-[10px] font-bold ${liveCoachSettings.liveCoachEnabled ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
          >
            {liveCoachSettings.liveCoachEnabled ? 'Ativo' : 'Desativado'}
          </button>
        </div>
        <select
          aria-label="Frequência das sugestões"
          value={liveCoachSettings.suggestionFrequency}
          onChange={(event) => onChangeLiveCoachSettings({ suggestionFrequency: event.target.value })}
          className="w-full rounded-lg bg-secondary/60 px-2 py-2 text-xs"
        >
          <option value="minimal">Mínima</option>
          <option value="normal">Normal</option>
          <option value="frequent">Frequente</option>
          <option value="sets_only">Apenas entre sets</option>
          <option value="disabled">Desativada</option>
        </select>
        <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={liveCoachSettings.allowMinorAutoAdjustments}
            onChange={(event) => onChangeLiveCoachSettings({ allowMinorAutoAdjustments: event.target.checked })}
          />
          Permitir somente ajustes automáticos leves
        </label>
      </Surface>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Modo da partida</p>
        <div className="grid grid-cols-3 gap-2">
          {[['text', 'Completa'], ['summary', 'Resumida'], ['important', 'Momentos']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => onChangeDisplayMode(id)}
              className={`rounded-xl px-2 py-2 text-xs font-bold ${displayMode === id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
