# Fechamento — espiral de exclusão de reais (Fase 7 → 7.4)

> Resumo executivo. Para o detalhe completo de cada medição, ver os
> relatórios de sub-fase referenciados na seção 5 — este documento não
> os substitui.

## 1 — O mecanismo

Uma dupla real que joga pouco fica presa numa espiral que se
auto-reforça inteiramente com peças de código já existentes, sem
nenhum bug isolado: pontos de ranking só vêm de jogar (não há
decaimento por inatividade), então uma dupla parada não perde pontos
mas também não ganha nenhum, enquanto todo o resto do mundo que
continua jogando sobe — a posição relativa dela piora mecanicamente a
cada temporada mesmo sem "nada acontecer" com ela; `applyEntryPriority`
prioriza as vagas principais por esse mesmo rank, então quanto pior a
posição relativa, menor a chance de ganhar uma vaga pra tentar reverter
a situação. Rank explicou 98,8% de quem fica ocioso, reproduzido de
forma independente em 3 cenários de calendário (Fase 7).

## 2 — A correção final em vigor hoje

`src/gameplay/worldTour/WorldTourLifecycle.js`, sempre ativo, sem
variáveis de ambiente de diagnóstico:

1. **Qualifying** (Fase 7.1) — metade da fatia de vagas reservadas
   (`QUALIFYING_SHARE = 0,5` de `ENTRY_RESERVED_SHARE`) não é mais
   concedida direto: vira um mini-bracket disputado por quem tem os
   PIORES ranks entre quem não ganhou vaga aberta nem reservada direta
   — uma segunda porta de entrada que não depende só do ranking
   corrente pra competir.
2. **Janela de prioridade** (Fase 7.3, permanente desde a Fase 7.4) —
   vencer o qualifying garante `PRIORITY_WINDOW_N = 4` aparições
   SEGUIDAS com entrada garantida, em vez de uma vitória pontual.
   Persistida em `Partnership.priority_window_remaining` — sobrevive a
   reinício de carreira real, não só ao harness de auditoria (ver
   achado da Fase 7.3 sobre o mecanismo original não sobreviver a
   `--resumeFrom`, corrigido na Fase 7.4 ao trocar o `Map` em memória
   por este campo persistido).
3. **Fator de escala do qualifying fixo** (`QUALIFYING_SCALE_FACTOR =
   1,4`, política "rate") — a fatia de qualifying dentro do
   `reservedSlots` é 1,4× maior que o padrão, desde o 1º torneio da
   carreira (não só a partir da 2ª temporada, como na medição
   original). Decisão deliberada: a Fase 7.3 testou duas formas de
   escalar esse fator — fixo ("rate") ou crescendo com o tamanho ATUAL
   do grupo `rank>300` ("group") — e a fixa venceu (0% de reincidência
   contra 40% da variante que escala com o grupo). Como o valor "rate"
   nunca dependeu do tamanho do grupo, aplicá-lo desde a temporada 1 em
   vez de esperar a 2ª (quando a medição original descobria esse
   tamanho pela primeira vez) não muda o mecanismo — só evita depender
   de um estado de sessão ("isto não é mais a primeira temporada") do
   mesmo tipo frágil que o Map em memória do item 2 era. A temporada 1
   é bootstrap universal (nenhum real fica de fora, em toda medição já
   feita) — a decisão não altera esse resultado, só remove uma
   dependência de estado desnecessária.

## 3 — Resultado validado

**Reincidência (dupla resgatada pelo qualifying que volta a cair em
`rank>300` na temporada seguinte) cai de 90-100% para 0%.**

- Baseline sem a janela (Fase 7.2, 6 transições medidas em 3 cenários
  de calendário): 90%, 90,9%, 100%, 100%, 100%, 100%.
- Com a janela N=4/rate, medida em modo diagnóstico (Fase 7.3): 0% em
  T4 (0/2) e 0% em T5 (0/2).
- Com a correção permanente, sem nenhuma flag de ambiente, no
  regime-check de 5 temporadas completas (Fase 7.4, mesma seed e
  população da medição diagnóstica): 0% em T4 (0/1) e 0% em T5 (0/2).

A diferença entre 90-100% e 0% é grande o bastante (quase uma ordem de
grandeza) para não depender de coincidência de seed — e o regime-check
confirmou que o número se mantém sem as flags de diagnóstico que
produziram a medição original.

## 4 — O que NÃO foi resolvido, e por quê

### 4.1 — Topo-76 descartado como cenário de dimensionamento de calendário

O cenário de calendário "topo-76" (`DIAG_TOP_EVENTS=76`) mostrou, com
uma única seed (Fase 7.2), uma inversão de sinal na curva de exclusão
(temporada 2→3: incremento de +11 para **-1** — uma queda real, não só
desaceleração) que nenhum outro cenário ou correção anterior tinha
produzido. Rodar mais duas seeds (Fase 7.3 e 7.4) para confirmar ou
refutar esse sinal revelou que ele **não é robusto**: das 3 seeds, uma
mostra reversão clara (-1), uma mostra patamar (0) e uma mostra
crescimento monotônico sem nenhuma parada (+8) — 2 formas
qualitativamente diferentes em 3 tentativas. Isso não é apenas
divergência de magnitude (o que seria esperado de ruído normal) — é
divergência de FORMA, o que indica que o padrão observado na 1ª seed
provavelmente era ruído específico daquela seed, não uma propriedade
estrutural do calendário topo-76.

**Decisão registrada**: o topo-76 está descartado como base para
qualquer decisão de dimensionamento de calendário que dependa do
FORMATO da curva de exclusão (se ela inverte, achata ou continua
subindo). As 3 seeds concordam razoavelmente no NÍVEL final (26-34
reais sem jogar na T5) e todas mostram crescimento, então o nível
absoluto é mais estável que a forma — mas qualquer decisão futura de
expandir o calendário (a Fase 7.2 §3 já mostrou que capacidade e
qualifying se reforçam mutuamente, valendo investir nos dois) deve se
apoiar no cenário atual ou no topo-120 — que teve o MELHOR nível final
medido entre os 3 cenários testados (24, contra 34-35) — e não no
topo-76. Nenhuma decisão de calendário foi de fato implementada em
produção ao longo desta linha de investigação; isso permanece uma
decisão em aberto, só que agora com uma opção a menos na mesa.

### 4.2 — Achados registrados e nunca revisitados

- **`eventRegion()` lê o campo errado** (Fase 7 §2, reafirmado na Fase
  7.1 §4) — `WorldTourLifecycle.js` compõe a região do evento a partir
  de `tournament.region`/`tournament.continent`/`tournament.country`
  (nenhum dos dois primeiros existe em `Tournament`; sempre cai no
  país), enquanto `TournamentSelectionAI.js:28` compara contra
  `tournament.world_region` — duas granularidades incompatíveis
  (país vs. região) que nunca vão bater. Bug de código real, ainda
  presente no arquivo hoje (linha 283) — **nunca corrigido**, por
  decisão explícita de escopo em toda a linha de investigação (medir
  o efeito isolado, sem o qualifying/janela no meio, quando essa
  sub-fase for aberta). A Fase 7 mediu que esse bug tem efeito
  provavelmente pequeno e parcialmente confundido com o próprio rank —
  não é uma causa principal do problema já resolvido, mas é uma
  correção de qualidade de dados pendente, independente desta linha.
- **Wildcard (Opção B, Fase 7.1 §1.3)** — concessão direta de 1-2 vagas
  por torneio para as duplas de pior rank, sem exigir disputa. Proposta
  e deliberadamente NÃO implementada na Fase 7.1 (decisão de medir uma
  correção de cada vez), reservada como possível complemento "se o
  qualifying sozinho não for suficiente pro grupo mais extremo". Com a
  janela de prioridade zerando a reincidência (§3), essa condição não
  se materializou — **superada pelo resultado, não pendente**: não há
  evidência de que algum subgrupo continue precisando de uma porta sem
  mérito. Registrado aqui só para não deixar a opção "esquecida" sem
  explicação.
- **Hipótese A (escalar `QUALIFYING_SHARE` com o tamanho do grupo
  `rank>300`), Fase 7.2 §1.6** — a própria Fase 7.2 recomendou testar
  a hipótese B (janela) primeiro, e só reavaliar A depois. Isso
  aconteceu: a Fase 7.3 testou A e B juntas, com A na variante "group"
  (escalando com o tamanho do grupo) contra a variante fixa "rate" —
  "group" teve reincidência de 40% na T5, pior que os 0% de "rate".
  **Resposta obtida**: a folga liberada pela janela (B) já é suficiente
  sem precisar escalar o qualifying pelo tamanho do grupo (A) — a
  fatia fixa e maior (1,4×) já basta. Considerado fechado.

## 5 — Histórico completo (para detalhe, não resumido aqui)

| Fase | Relatório | Commit | O que fez |
|---|---|---|---|
| 7 | [FASE-7-RELATORIO.md](FASE-7-RELATORIO.md) | `31d67aa` | Identificou o mecanismo (rank, 98,8% de acurácia); diagnosticou `eventRegion()` como bug secundário |
| 7.1 | [FASE-7.1-RELATORIO.md](FASE-7.1-RELATORIO.md) | `9b41d65` | Implementou qualifying; corrigiu o critério do pool de qualifying no meio da própria medição; propôs e descartou wildcard por ora |
| 7.2 | [FASE-7.2-RELATORIO.md](FASE-7.2-RELATORIO.md) | `90cd94e` | Diagnosticou a reincidência de 90-100% como causa dominante do afunilamento; recomendou testar a janela (B) antes de escalar vagas (A); remediu calendário com qualifying em vigor (capacidade + qualifying se somam) |
| 7.3 | [FASE-7.3-RELATORIO.md](FASE-7.3-RELATORIO.md) | `63d3357` (checkpoint parcial) → `fd6f934` (fechamento) | Implementou e mediu a janela de prioridade em 3 configurações (N=2/rate, N=4/rate, N=4/group) — N=4/rate zera a reincidência; rodou 2ª seed do topo-76 (resultado ambíguo, motivou a 3ª seed) |
| 7.4 | [FASE-7.4-RELATORIO.md](FASE-7.4-RELATORIO.md) | `5582d11` | Promoveu a janela a produção (persistida, sem flags); regime-check confirmou 0% de reincidência sem diagnóstico; 3ª seed do topo-76 (diverge em forma — motivou o descarte do §4.1) |

## Entrega

1. Este documento de fechamento
2. Commit
