# Mobile M3 — Live Match Mobile + Match Checkpoint/Lifecycle

Data: 2026-08-14

Resolve o maior risco de produto encontrado na auditoria mobile: uma partida
ao vivo (treino ou torneio) existia somente em `state` React — se o Android
suspendesse a WebView, matasse o processo por pressão de memória, ou o
jogador simplesmente trocasse de app, a partida inteira desaparecia sem
deixar rastro. Ao mesmo tempo, corrige riscos concretos de mobile em
`LiveMatch` sem redesenhá-lo.

## 1. Arquitetura antes

`SimulationModal`/`TournamentModal` criam `teams` em `state` React;
`LiveMatch` cria o `state` do match engine via `createMatch()` e evolui via
`playPoint()`, também só em `state` React. Nada disso tocava disco durante a
partida — só no fim, quando `onFinished` chamava `finalizePracticeMatch`
(treino) ou o bloco de finalização de `TournamentModal` (torneio).

`TournamentModal` já tinha uma proteção parcial: o `tournament_run` (a
campanha/chave inteira) é persistido em `CalendarEvent.metadata` a cada
transição de fase (`persistRun`), então a CAMPANHA nunca se perdia. Mas se o
app fosse interrompido com uma rodada em andamento, o código existente
**descartava a partida e reiniciava a rodada do zero** (bloco "uma partida
interrompida pode ser reiniciada", em `TournamentModal.jsx`) — a campanha
sobrevivia, o placar ao vivo, não.

Treino (`SimulationModal`) não tinha proteção nenhuma: interrupção = partida
inteira perdida (sem custo de recursos, já que treino só debita algo no fim,
mas com custo de tempo/imersão do jogador).

## 2. Risco de perda de partida

Confirmado nos dois fluxos: `LiveMatch`'s `state` nunca tocava disco durante
o jogo. `visibilitychange`/`pagehide`/lifecycle do Android não tinham
tratamento nenhum — nenhum código pausava o autoplay ao ir para background.

## 3. Solução de checkpoint

Novo `MatchCheckpointRepository` (`src/careers/MatchCheckpointRepository.js`),
usando a MESMA infraestrutura de arquivo já validada em Android físico pelas
fases M1/M2 (`GameStorage` → `TauriStorage` → `$APPDATA`) — não usa
`localStorage`, não cria storage paralela.

## 4. Formato

```js
{
  checkpoint_schema_version: 1,
  career_id,
  match_id,             // treino: uuid gerado ao iniciar; torneio: o mesmo id
                          // estável da partida no bracket (currentMatch.id)
  type: 'practice' | 'tournament',
  tournament_id,          // só torneio
  started_at, updated_at,
  engine_state,            // o state INTEIRO do match engine — já contém
                            // teams/participantes/placar/narração/liveCoach
}
```

O `engine_state` não precisa de nenhum "contexto" adicional: `createMatch()`
já embute o roster completo (jogador, parceiro, bots rivais, com todos os
atributos) dentro do próprio `state.teams`. Restaurar a partida não chama
`createMatch()` de novo — usa o `engine_state` salvo diretamente como state
inicial de `LiveMatch` (prop nova `initialState`).

## 5. Localização do storage

Arquivo próprio por carreira: **`active-matches/<careerId>.json`** — não
dentro do save principal da carreira. Decisão (Parte 4 do enunciado):

- **Atomicidade/clareza**: reaproveita o padrão seguro de escrita do
  `GameStorage` (tmp file + rename + verificação) sem competir pelo lock de
  escrita do save principal.
- **Custo**: checkpoints são gravados bem mais vezes que o save da carreira
  (a cada game) — reescrever o save inteiro a cada game seria I/O
  desnecessário.
- **Isolamento**: detectar/limpar um checkpoint nunca lê nem revalida o save
  inteiro; um checkpoint corrompido nunca arrisca o save principal.

## 6. Frequência

Checkpoint em pontos seguros e semanticamente relevantes — **nunca a cada
ponto/frame**:

- início da partida (primeiro `state`, antes de qualquer ponto);
- fim de cada game/set (mudança em `gamesA`/`gamesB`/`setsA`/`setsB`);
- mudança de tática (própria ou decisão do técnico — `tacticsTimeline`/
  `liveCoach.decisions`);
- ida para background (`visibilitychange` → hidden), forçado independente da
  assinatura acima.

Implementado como uma assinatura curta (`setsA:setsB:gamesA:gamesB:
tacticsTimeline.length:decisions.length`) comparada a cada mudança de
`state` — só dispara `onCheckpoint` quando a assinatura muda.

## 7. Lifecycle (background/foreground)

`LiveMatch` ganhou um listener de `visibilitychange`: ao ficar oculto,
`autoPlay` vira `false` (o timer de autoplay já se auto-cancela quando
`autoPlay` muda — não precisou de lógica de cleanup nova) e um checkpoint é
forçado. Ao voltar ao foreground, a partida **permanece pausada** — o
jogador decide quando continuar (Parte 21 do enunciado, preferência
explícita por não retomar sozinho "recuperando o tempo perdido").

## 8. Timers

Auditado: o timer de autoplay já era um único `setTimeout` encadeado
(dependente de `state`/`autoPlay`/`speed`, com cleanup via o retorno do
`useEffect`) — nunca havia risco de dois timers simultâneos. A pausa por
`visibilitychange` reaproveita esse mesmo mecanismo (só desliga `autoPlay`),
sem introduzir um segundo sistema de timer.

## 9. Recovery

Ao abrir `SimulationModal`/`TournamentModal`, cada um verifica se existe um
checkpoint correspondente (treino: `type==='practice'`; torneio:
`type==='tournament' && tournament_id && match_id` batendo com a rodada
atual do bracket). Se existir, mostra um prompt explícito — nunca restaura
silenciosamente:

```
Partida em andamento
Uma partida foi interrompida antes de terminar.
[ Continuar partida ]
[ Descartar / Reiniciar esta rodada do zero ]
```

"Descartar" é tratado como mecanismo técnico (limpa o checkpoint; torneio
volta ao fallback pré-existente de reiniciar a rodada do zero) — **nenhuma
penalidade esportiva nova foi criada**.

Como o jogador pode estar em qualquer página quando reabre o app, um aviso
global (`ActiveMatchRecoveryBanner`, montado na Home/`CareerHub`) aparece
sempre que existir checkpoint ativo, com um botão "Continuar partida" que
navega para `/game/matches` ou `/game/tournaments` — a página de destino já
detecta o mesmo checkpoint e reabre o modal certo automaticamente (o prompt
de confirmação acima ainda aparece lá, nunca pula direto para o meio do
jogo).

## 10. Treino

`SimulationModal` gera um `match_id` (uuid) ao iniciar uma partida nova;
salva/atualiza o checkpoint a cada callback de `LiveMatch`; limpa o
checkpoint assim que `handleFinished` é chamado (antes mesmo de tentar
finalizar — a partida já não está mais "em andamento" independente do
resultado do finalizador).

## 11. Torneio

O bloco que antes descartava incondicionalmente uma rodada "playing" ao
reabrir foi modificado: agora primeiro verifica se existe um checkpoint do
engine batendo com `tournament_id` + `match_id` (o id estável da rodada no
bracket, `tournament-match-<profileId>-<tournamentId>-<stage>-<round>`). Se
existir, o status `playing` é preservado e a fase vira
`match_resume_prompt`; só cai para o fallback antigo (reverter para
`scheduled`, reiniciar do zero) quando não há checkpoint válido para aquela
rodada específica — o mesmo comportamento de antes, agora como *fallback*
em vez de comportamento único.

## 12. Idempotência

**Já existia e continua intacta** — não foi necessário criar um novo
mecanismo:

- Treino: `finalizePracticeMatch` deriva `finalizationKey` de
  `profile.id + profile.career_date + matchState.seed`
  (`makeMatchFinalizationKey`). Como o checkpoint restaura o `engine_state`
  ORIGINAL (mesmo `seed`, nunca recriado via `createMatch()` de novo), a
  chave é idêntica antes e depois de uma interrupção — verificado com teste
  comportamental real (engine real, sem mocks) em
  `scripts/test-mobile-m3-live-match.mjs`.
- Torneio: a recompensa já era protegida por `freshMatch.id` (o mesmo id
  estável do bracket) via `processed_match_keys`/`buildMatchRewardsPatch`.
- Ambos os casos passam por `CareerEntityRepository.batch(...,
  {idempotencyKey})`, que verifica `processed_match_finalizations` no save
  da carreira ANTES e DENTRO da mutação atômica — uma segunda chamada com a
  mesma chave retorna `skipped:true, writes:0` sem tocar em XP/moedas/
  ranking/histórico de novo.

O `match_id` do checkpoint em si (Parte 11 do enunciado) existe para
identidade/posse do checkpoint (isolamento entre carreiras, correspondência
com a rodada certa) — não é de onde vem a proteção contra recompensa
duplicada, que já é garantida pelo mecanismo acima.

## 13. Corrupção

`MatchCheckpointRepository.read()` nunca lança para a UI. JSON inválido,
schema de versão incompatível, `engine_state` incompleto/malformado, ou uma
partida já marcada `finished:true` (não é "em andamento") são todos tratados
como "sem checkpoint válido" — o arquivo corrompido é removido do disco
(best-effort) e a função retorna `null`. O save principal da carreira nunca
é tocado nesse caminho. Coberto por 3 testes comportamentais reais
(schema incompatível, forma inválida, partida já finalizada).

## 14. Versionamento

`checkpoint_schema_version` (atualmente `1`) é um campo próprio,
desacoplado do `CAREER_SAVE_SCHEMA_VERSION` da carreira — migração futura do
formato do checkpoint não precisa (e não deve) mexer no schema do save.

## 15-17. Mudanças de UI mobile / touch targets / landscape

- Tabs de painel (Jogo/Tática/Técnico/Ao vivo), botão Pausar/Continuar,
  velocidades (1x/2x/5x/10x) e SkipButton (Ponto/Game/Set/Fim) ganharam os
  marcadores mobile-only do M1 (`pl-tab-trigger`/`pl-btn-tap`/`pl-icon-tap`)
  — hitbox de 44px só em telas ≤767px, tamanho desktop inalterado (densidade
  visual preservada, nenhum botão "gigante").
- Cadeia de altura (`shrink-0` scoreboard/tabs/controles + `min-h-0 flex-1
  overflow-hidden` no conteúdo do painel) auditada e confirmada já robusta
  — coberta por teste estrutural; nenhuma mudança de CSS/`sticky` foi
  necessária.
- Narração: limite de 120 eventos e auto-scroll preservados sem alteração.
- Landscape curto (800×360 a 915×412): a mesma cadeia flex já prioriza
  placar → painel ativo → controles sem esconder função nenhuma; não exigiu
  mudança específica de breakpoint.

## 18. Android Back durante partida

`SimulationModal` já gatava `closeOnBackdrop`/`closeOnEscape` (e, por
extensão, o Android Back via `useOverlayBehavior`) por fase — preservado.
**Gap real encontrado**: `TournamentModal` nunca tinha essa proteção —
backdrop, Escape e Android Back fechavam a modal incondicionalmente mesmo
durante `phase==='match'`. Corrigido com o mesmo padrão de
`SimulationModal` (`closeOnBackdrop={phase !== 'match'}`).

O botão **X** do `ModalShell` não tem gating próprio em nenhum consumidor do
app (decisão consciente: não alterar o componente compartilhado só para
este caso, evitando regressão em todos os outros modais) — fechar pelo X
durante uma partida continua possível, mas agora é seguro por construção: o
checkpoint mais recente (no máximo o game/tática anterior) já está em disco,
e o aviso global na Home deixa claro que existe uma partida pendente,
satisfazendo a exigência do enunciado ("se checkpoint existir, fechar pode
ser seguro, mas UX deve deixar claro que existe partida pendente").

## 19. Arquivos alterados

Novos: `src/careers/MatchCheckpointRepository.js`,
`src/hooks/useActiveMatchCheckpoint.js`,
`src/components/career/ActiveMatchRecoveryBanner.jsx`,
`scripts/test-mobile-m3-live-match.mjs`.

Modificados: `src/components/matches/LiveMatch.jsx` (checkpoint hooks,
touch targets, pausa em background), `src/components/matches/
SimulationModal.jsx` (match_id, checkpoint save/clear, resume-prompt),
`src/components/tournaments/TournamentModal.jsx` (idem + fix do gap de
closeOnBackdrop/Escape), `src/pages/Matches.jsx` (auto-reabertura),
`src/pages/Tournaments.jsx` (auto-reabertura do torneio certo),
`src/pages/CalendarPage.jsx`/`src/pages/Tournaments.jsx` (prop `careerId`
via `useCareer()`), `src/pages/CareerHub.jsx` (banner global), `package.json`.

**Não tocados**: match engine (`src/engine/match/*` — confirmado por teste),
Home/StaffPanel/PartnerOffersPanel/TrainingCenter/Ranking/calendário/loja/
mundo/economia/progressão/missões/tutorial além da integração estritamente
necessária listada acima.

## 20. Testes

`test:mobile-m3-live-match` (novo) — 44 verificações: estruturais (touch
targets, wiring de checkpoint, UX de recovery, proteção de fechamento,
freeze do engine) + comportamentais reais executando o match engine e o
`MatchCheckpointRepository` de verdade (storage falsa em memória no lugar do
plugin Tauri, indisponível fora do runtime Tauri):

- checkpoint + resume produz sequência **idêntica** a uma partida sem
  interrupção com o mesmo seed (Parte 30);
- state é JSON-serializável de ponta a ponta;
- save/read/clear do checkpoint funcionam e são isolados por `career_id`;
- checkpoint corrompido (schema incompatível, forma inválida, partida já
  finalizada) é descartado com segurança, nunca vaza para a UI;
- `makeMatchFinalizationKey` produz a MESMA chave antes e depois de um
  round-trip de checkpoint (a base real da proteção contra recompensa
  duplicada, Parte 31).

Não foi construída uma simulação de ponta a ponta de
`finalizePracticeMatch`/`recordTournamentMatchResult` completos (dependem
do singleton `gameRepository`, ligado à árvore de storage real do app) —
em vez disso, a proteção contra duplicação foi verificada na camada de onde
ela realmente vem (`processed_match_finalizations` em
`CareerEntityRepository.batch`, já validado por
`test:match-finalization-performance` que roda no PIPELINE atual —
`"singleIdempotentFinalization": true`), e na estabilidade da chave que a
alimenta.

Regressão executada (Parte 32): `lint`, `typecheck` (2527 linhas, idêntico
ao baseline), `build`, `test:mobile-foundation`, `test:mobile-m1-hotfix`,
`test:mobile-m2-shell`, `test:mobile-m2-device-hotfix`,
`test:match-integrity`, `test:match-balance`, `test:match-playback`,
`test:match-realism-rc`, `test:match-finalization-performance`,
`test:live-coach`, `test:tournament-flow-rc`, `test:tournament-registration`,
`test:career-systems`, `test:fatigue-integrity`,
`test:post-match-interviews` — todos passando.

## 21. Riscos residuais

- Fechar pelo X mid-game (entre dois checkpoints) pode perder no máximo os
  pontos jogados desde o último game/tática — aceito explicitamente pelo
  próprio enunciado ("não é obrigatório preservar cada ponto").
- Uma partida treino interrompida que atravessa a virada do dia de carreira
  (jogador avança o calendário antes de retomar) finaliza com uma
  `finalizationKey` diferente da que teria sido gerada sem interrupção (usa
  `career_date` no momento do finish, não no do início) — não quebra
  idempotência (só nunca colide com a tentativa original, que nunca chegou
  a se completar), só é cosmético.
- Validação definitiva do lifecycle (Android real matando o processo) fica
  condicionada ao teste físico — checklist abaixo.

## 22. Checklist Android físico (`npm run android:dev`)

### Treino
1. iniciar treino → iniciar partida → jogar alguns games;
2. apertar Home do Android, esperar, voltar;
3. confirmar que a partida está intacta e pausada;
4. continuar e finalizar — recompensa concedida uma única vez.

### Process kill
5. iniciar partida → background → matar o app pelo seletor de apps;
6. abrir de novo, carregar a carreira;
7. confirmar o aviso "Partida em andamento" (Home) e/ou o prompt ao abrir
   Partidas;
8. continuar → finalizar → confirmar recompensas uma única vez.

### Torneio
9. iniciar partida de torneio → interromper (background/process kill);
10. reabrir → confirmar prompt de retomada da rodada certa;
11. continuar → finalizar → confirmar chave/ranking/premiação corretos e
    sem duplicação.

### UI
12. velocidades 1x/2x/5x/10x; pular ponto/game/set/fim; abas Técnico/
    Tática/Ao vivo; portrait; landscape; rotação durante a partida (state
    não deve resetar nem duplicar timer).
