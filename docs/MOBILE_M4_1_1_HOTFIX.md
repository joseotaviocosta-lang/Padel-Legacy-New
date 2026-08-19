# Mobile M4.1.1 — continuidade de torneio e HUD compacto

## Escopo

Hotfix corretivo sobre a M4.1. Não altera gameplay, RNG, progressão, economia,
formato do save ou regras de inscrição.

## Continuidade temporal

A data oficial de uma pendência de torneio é, nesta ordem:

1. a partida em `tournament_run.matches[currentRound]`;
2. `metadata.next_round_date` para compatibilidade;
3. `CalendarEvent.start_date` para saves legados sem run.

O resolvedor classifica a pendência como `future`, `dueToday` ou `overdue` por
comparação de datas ISO de calendário, sem conversão de fuso. Um torneio futuro
não bloqueia. O avanço pode chegar à data oficial da rodada; nessa data, uma
nova tentativa de sair do dia é bloqueada até a partida ser resolvida.

Isso também impede que `processCalendarEvents` marque como perdida uma rodada
atual cuja data externa ficou desatualizada após R16 → QF → SF → F.

## HUD compartilhado

`GameHud` mantém ícone, valor e rótulo em nós distintos e com nome acessível.
Os espaçamentos e tamanhos vêm dos tokens `--game-hud-*`.

- Desktop: hero denso em linha, sem descrição ornamental, HUD sem wrap e com
  mini-itens estruturados.
- Mobile: faixa única com altura mínima de 44 px, separadores e scroll
  horizontal quando necessário.
- Calendário: data curta no padrão `08 JAN · Quinta`.

O ajuste é sistêmico: Home, Treinos, Partidas, Torneios, Ranking, Atletas,
Dupla, Comissão, Objetivos, Calendário, Técnicos, Mensagens e Imprensa usam o
mesmo primitive.

## Verificação visual física pendente

O ambiente automatizado não disponibilizou navegador. Assim, os contratos de
estrutura e responsividade são automatizados, mas a inspeção visual permanece
obrigatória no APK e no app Windows em 1366×768, 1920×1080, 390×800 e 360×800.
