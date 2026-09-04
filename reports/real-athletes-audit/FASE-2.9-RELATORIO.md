# Fase 2.9 — Correção do #20, contaminação da poda e políticas de acumulação

> Pré-requisito: Fase 2.8 entregue (causa raiz do vazamento de memória
> encontrada — achado #20 — checkpoint por temporada no harness, dívida
> de conteúdo editorial registrada). Ver
> [FASE-2.8-RELATORIO.md](FASE-2.8-RELATORIO.md).
>
> Diferente da Fase 2.8, este bloco toca `src/` de produção — validação
> de build/Tauri incluída na Seção 5, não pulada.

## 1 — Achado #20 corrigido: rotação por padrão de nome, não nome estável

A causa raiz (Fase 2.8): `backupFileName` embute um timestamp único em
CADA gravação, então a rotação de `BackupManager.backupFile`
(`maxBackups=3`, procurando por sufixos numéricos `.2`/`.3` sobre um
caminho REUSADO) nunca encontrava nada pra rotacionar — o caminho nunca
se repete de propósito.

**Fix**: preserva o timestamp no nome (a feature "3 backups históricos
por data" continua existindo — a alternativa óbvia, nome estável, a
degradaria pra "1 backup só"). Corrige a ROTAÇÃO: `BackupManager.
pruneOldBackups(directory, prefix, {maxBackups})` lista o diretório,
filtra por padrão de nome (`${prefix}-*-backup.json`, mesmo padrão que
`GameStorage.tryRestoreFromBackup` já usava pra achar backups na
restauração), ordena (timestamp ISO no nome já ordena
lexicograficamente = cronologicamente) e remove tudo além dos
`maxBackups` mais recentes. `GameStorage.writeJsonUnlocked` passa
`prefix: getFileName(normalizedPath)` na chamada existente.

### Divergência MemoryStorage vs. TauriStorage corrigida

Aviso explícito antes de validar: "confirme que a listagem por padrão
funciona igual no `MemoryStorage` do harness e no storage real do Tauri
— se as duas camadas divergirem, o teste passa e a produção continua
vazando". Achado real: o `MemoryStorage` de
`scripts/audit-real-athletes-simulation.mjs` retornava chaves de string
CRUAS de `.list()`, ignorando o diretório pedido — divergindo do
contrato real de `TauriStorage.list()` (entradas `{name, isDirectory}`,
escopadas ao diretório, não-recursivas — confirmado por leitura direta
de `TauriStorage.js`, incluindo `stat()`/`remove()`/`copy()`/`exists()`,
todos com assinatura compatível com o que `pruneOldBackups` chama).
Corrigido no `MemoryStorage` do harness antes de validar qualquer coisa.

### Teste: N gravações consecutivas

[scripts/test-backup-rotation-fase29.mjs](../../scripts/test-backup-rotation-fase29.mjs)
(`npm run test:backup-rotation-fase29`, 6/6 PASS): 9 escritas
consecutivas da mesma carreira deixam exatamente 3 arquivos de backup —
confirmado que são os 3 mais recentes (não um subconjunto arbitrário),
nomes permanecem únicos, `pruneCareerBackups` é idempotente.

### Validação: reexecução do diagnóstico de 6 meses

Mesma configuração da medição da Fase 2.8 (`DIAG_SIZES=1
DIAG_MAX_MONTHS=6`), comparado direto:

| Mês | Antes (Fase 2.8, sem correção) | Depois (Fase 2.9) |
|---|---|---|
| 1 | 223 arquivos, 16,2MB | 6 arquivos, 6,7MB |
| 2 | — | 6 arquivos, 8,6MB |
| 3 | — | 6 arquivos, 10,6MB |
| 4 | — | 6 arquivos, 12,3MB |
| 5 | — | 6 arquivos, 14,1MB |
| 6 | 946 arquivos, 173,1MB | 6 arquivos, 15,5MB |

Contagem de arquivos **estável em 6 nos 6 meses** (2 arquivos
diferentes com backup automático — o save da carreira e o índice de
carreiras — × 3 mantidos cada). O crescimento em MB que ainda existe
(6,7MB→15,5MB) é só o tamanho do PRÓPRIO save individual crescendo
(`AthleteProfile` sozinho foi de 2,0MB a 4,5MB no mesmo período) — não é
mais um vazamento de contagem de arquivo.

(Nota operacional: uma primeira tentativa de reexecução foi corrompida
por um processo vite órfão de uma tentativa anterior mal-backgrounded,
segurando a porta 24678 — identificado via `netstat`/encerrado via
`taskkill`, reexecutado limpo. Registrado por transparência, não porque
afete o resultado final.)

## 1B — Limpeza de instalações já afetadas

A correção da rotação, sozinha, evita acúmulo NOVO — não remove os
milhares de arquivos que quem já testou versões anteriores já tem no
disco. Durante o desenho desta limpeza, descobertos DOIS acúmulos
IRMÃOS do mesmo formato, além do medido na Fase 2.8:

- **(B) `CareerRepository.writeBackup`** — usado pelo botão manual
  "Criar backup interno"/"Criar backup agora" do `BetaTools.jsx` e pelo
  backup de segurança automático antes de `applySafeRepairs`. Grava em
  `backups/career-<id>/backup-<timestamp>.json`, pasta própria por
  carreira — nunca teve NENHUMA rotação, desde sempre.
- **(C) O backup automático do PRÓPRIO índice de carreiras**
  (`careers-index.json`) — mesmo mecanismo do achado #20 original, mas
  um arquivo GLOBAL à instalação (gravado a cada criar/carregar/
  salvar/excluir QUALQUER carreira — mais frequente que qualquer
  carreira individual).

**Fix**: `BackupManager.pruneOldBackups` generalizado pra aceitar um
matcher customizado (não só o padrão `prefixo-*-backup.json`).
`GameStorage.pruneBackupsFor(relativePath)` (genérico) +
`pruneCareerBackups` (atalho pro arquivo da carreira, Store A).
`CareerRepository.pruneBackups` (Store B) + `pruneIndexBackups` (Store
C) + `pruneAllBackups` (combina os três, relatório único). Rodado
automaticamente e silenciosamente (best-effort, não bloqueia o load) em
`CareerManager.loadCareer()`. Botão manual novo "Limpar backups
antigos" em `BetaTools.jsx`, ao lado do painel "Backups internos
encontrados" existente.

### Medição: carreira de teste com acúmulo prévio simulado

[scripts/test-backup-cleanup-existing-installs-fase29.mjs](../../scripts/test-backup-cleanup-existing-installs-fase29.mjs)
(6/6 PASS): carreira de teste com 800 arquivos órfãos injetados nos três
armazéns (400 Store A + 250 Store B + 150 Store C) mais os poucos
gerados pela própria criação da carreira — **801 arquivos / 1,4MB antes
→ 9 arquivos (3+3+3) / <0,1MB depois de um único `loadCareer()`**,
792 arquivos removidos automaticamente, sem nenhuma ação do jogador.

## 2 — Contaminação da poda do harness em `TeamRanking`: investigada, não confirmada — corrigida por princípio mesmo assim

A poda mensal do PRÓPRIO harness (`scripts/audit-real-athletes-simulation.mjs`,
"Fase 0.1", uma técnica de gerência de memória do harness, não
comportamento de produção) apagava TODO `TeamRanking` cujo `.id` não
estivesse entre os 27 pares históricos seedados — inclusive pares de
bots ATIVOS, formados pelo mercado de parcerias no mês anterior, todo
mês, só por "não estar no set histórico".

**Mapeamento** (leitura direta do código de produção, não suposição):

- **Elegibilidade de entrada** (`EntryManager.js`/`WorldTourLifecycle.js`):
  pares em segundo plano usam `resolveEntryRank` sobre campos
  INDIVIDUAIS do atleta (`rank`/`teamRank`/`ranking_position`/etc.),
  nunca `TeamRanking` — comentário explícito no próprio código: "não
  existe um TeamRanking dedicado para pares do World Tour em segundo
  plano".
- **Composição de chave/seeding**: `pairScore`/`athleteScore`
  (`WorldTourLifecycle.js`) usam rating/form/energia do
  `AthleteProfile`, não `TeamRanking.ranking_points`.
- **Distribuição de títulos por tier**: usa `Partnership`
  (`champion_partnership_id`), não `TeamRanking`.
- **Top-20**: é athlete-level (`AthleteProfile.world_ranking_points`),
  não pair-level — nunca foi "top-20-duplas" de fato.
- `TeamRanking` só é lido pelo harness no SEED inicial, antes de
  qualquer poda rodar.

**Conclusão**: `docs/baseline-pre-fase3.json` **não estava contaminado**
— nenhuma métrica que ele reporta depende de `TeamRanking` depois do
seed. Não foi re-congelado.

O critério de poda foi corrigido mesmo assim (mesmo formato do #20: "não
está no set histórico" ≠ "dissolvido de verdade"), como pedido
explicitamente independente do resultado da investigação: só apaga um
`TeamRanking` quando não existe `Partnership` com `status:'ativa'`
entre os mesmos dois atletas (reaproveita a mesma leitura de
`Partnership` que a poda de parcerias mortas já fazia — sem query
extra).

## 3 — Política de acumulação: `PartnershipLegacy` + `TeamRanking` — achado #21

Dois casos confirmados do MESMO padrão "só marca, nunca remove" que o
#20 tinha antes da correção: `Partnership` dissolvida só seta `status`
(nunca apaga, ~150 dissoluções/ano) e `TeamRanking` de uma dupla
desfeita simplesmente nunca é tocado de novo.

**Decisão comunicada antes de implementar** (por pedido explícito):
agregar-e-remover pra `Partnership` (mesmo padrão de
`AthleteCareerLegacy`, Fase 2.6), apagar direto o `TeamRanking` — com
quatro ajustes de desenho recebidos e incorporados ANTES da
implementação:

### 3.1 — Migração dos dados existentes (feita junto)

Carreiras em andamento já têm parcerias dissolvidas gravadas na coleção
viva, de antes de `PartnershipLegacy` existir. Reapontar
`getPartnershipHistory` sem migrar faria esse histórico sumir do
`PartnerHub`. `migratePartnershipHistory(profileId)` roda ANTES de toda
leitura (dentro do próprio `getPartnershipHistory` — a única
consumidora original era essa função; `Legacy.jsx` também foi migrado,
ver 3.3), idempotente por construção (só migra uma linha viva cujo `id`
ainda não aparece como `original_partnership_id` em nenhuma linha de
legado já existente).

**Teste** (estende
[scripts/test-career-partnership-history.mjs](../../scripts/test-career-partnership-history.mjs),
19/19 PASS): cria uma `Partnership` já dissolvida DIRETO na coleção
(bypassa `endPartnership` de propósito — simula uma linha gravada pelo
código de ANTES desta fase), confirma que o histórico visível é
IDÊNTICO antes e depois da migração, confirma que a linha pré-existente
aparece com os campos certos, confirma que rodar a migração duas
seguidas não duplica nada.

### 3.2 — Escopo restrito: sem legado pra dissolução bot-bot

~12,5 dissoluções/mês (~150/ano, ~4.500 em 30 anos) — o dobro do
`AthleteCareerLegacy` — e ninguém lê esse dado
(`getPartnershipHistory` filtra por `profile_id` do JOGADOR).
`PartnershipLegacy` só é gravada quando a parceria envolve o jogador OU
um atleta REAL (`AthleteProfile.is_real` — campo já existente,
verificação em memória, sem custo extra de query); dissolução bot-bot
pura apaga a `TeamRanking` mas não grava legado — o registro narrativo
dessa separação já existe como `WorldEvent`.

### 3.3 — Referências órfãs: grep antes do delete definitivo

Grep por quem referencia `Partnership` por ID (não só por
`profile_id`): **`Tournament.champion_partnership_id`/
`runner_up_partnership_id`** (`WorldTourLifecycle.js`, produção,
gravado a cada torneio finalizado no mundo de fundo). Único leitor hoje
é o próprio harness de auditoria (resolve o campeão de volta pra
`Partnership.get(id)` pra classificar título 100%-reais/mista/100%-bots)
— nenhuma tela de produção lê esse id de volta ainda, mas o campo É de
produção, e o sintoma só apareceria numa carreira antiga, não em teste.

**Consequência no desenho**: a `Partnership` NUNCA é apagada na hora da
dissolução (nem pra jogador/real com legado, nem pra bot-bot) — vira um
soft-delete de verdade, com poda com carência de 24 meses
(`worldSimulationLifecycle.js:pruneOldDissolvedPartnerships`, mesmo
gatilho mensal e mesma janela de `pruneOldRetiredAthletes`, já vetada
pela Fase 2.6). Também descoberto e corrigido no mesmo grep:
`Legacy.jsx`/`Press.jsx` liam `Partnership` direto da coleção viva por
`profile_id` — `Press.jsx` só busca a parceria ATIVA (nunca podada, sem
risco); `Legacy.jsx` monta a timeline de carreira inteira e SOFRERIA o
mesmo "some da tela" que motivou o item 1 — migrado pra
`getFullPartnershipTimeline` (ativa + histórico via legado).

### 3.4 — `TeamRanking`: decisão de comportamento, registrada

`team_key` é derivada dos ids ORDENADOS dos dois atletas (Fase 2B) —
uma dupla que se separa e volta a se formar gera a MESMA chave. Apagar
na dissolução significa que ela recomeça do zero em pontos ao reformar.
**Decisão explícita, registrada no achado #21**: apaga imediatamente
(sem carência — grep confirmou que nada lê uma linha de `TeamRanking`
de dupla dissolvida por id ou histórico, só por `team_key` "ao vivo" ou
em listagens do líder do momento, então não há risco de referência
quebrada aqui como havia em `Partnership`). Justificativa: replica o
comportamento do circuito real, onde uma dupla refeita não herda
ranking anterior. **Sinalizado para a Fase 4**: quando o ranking
rolling de 52 semanas entrar, este comportamento precisa ser
RECONFIRMADO como decisão de design, não redescoberto como bug.

### Implementação

- `src/lib/partnershipSystem.js`: `buildPartnershipLegacyRow`,
  `deleteTeamRankingForPair`, `migratePartnershipHistory`,
  `getFullPartnershipTimeline` (novas); `endPartnership` grava
  `PartnershipLegacy` + apaga `TeamRanking` da dupla; `getPartnershipHistory`
  migra e lê de `PartnershipLegacy`.
- `src/game-core/aiPartnershipLifecycle.js`: `dissolvePartnerships` grava
  `PartnershipLegacy` só quando `athlete.is_real || partner.is_real`;
  apaga `TeamRanking` pra QUALQUER par dissolvido (bot-bot inclusive);
  `Partnership` continua só marcada, nunca apagada aqui.
- `src/game-core/worldSimulationLifecycle.js`: `pruneOldDissolvedPartnerships`
  (nova, mesmo padrão/carência de `pruneOldRetiredAthletes`), chamada
  no mesmo gatilho de virada de mês.
- `src/pages/Legacy.jsx`: migrado pra `getFullPartnershipTimeline`.

### Teste dedicado (caminho bot-bot, fora do jogador)

[scripts/test-partnership-legacy-scope-fase29.mjs](../../scripts/test-partnership-legacy-scope-fase29.mjs)
(11/11 PASS): dissolução bot-bot NÃO grava legado mas apaga
`TeamRanking`; dissolução envolvendo atleta real GRAVA legado; em ambos
os casos a `Partnership` só é marcada, nunca apagada na hora; a poda com
carência remove uma dissolução de >24 meses e preserva uma dentro da
janela; o `PartnershipLegacy` já gravado sobrevive à poda da linha viva.

## 4 — `ranking_history` registrado como entrada do achado #18

Não investigado agora, por instrução explícita — só registrado com o
enquadramento correto. `AthleteProfile.ranking_history` (array capado
em 51 semanas, `circuitLifecycle.js`) custa ~5-8KB/atleta no pico
(~5-8MB no total da população) — benigno isolado, mas vive DENTRO do
mesmo documento de save clonado a cada escrita (achado #18). Uma vez
que o histórico de todo atleta encha, isso sozinho aproximadamente
DOBRA o custo de toda transação futura. Adicionado como pergunta de
entrada pra quando o #18 for investigado: esse histórico precisa viver
no MESMO documento que fica no caminho quente de escrita, ou poderia
viver numa coleção separada, fora dele?

## 5 — Suíte, lint, build, Tauri

Diferente da Fase 2.8, este bloco toca `src/` de produção
(`src/storage/`, `src/careers/`, `src/game-core/`, `src/lib/`,
`src/pages/`, `src/components/system/BetaTools.jsx`) — validação
completa, não pulada.

- `npm run lint` — limpo, sem avisos.
- `npm run build` — OK, 39,76s (chunks de `Legacy`/`PartnerHub`
  emitidos normalmente; aviso de chunk >500kB é pré-existente, não
  novo).
- Contrato de storage vs. Tauri real: nenhuma mudança de INTERFACE — só
  chamadas a métodos que `TauriStorage.js` já implementa
  (`list`/`stat`/`remove`/`copy`/`exists`), com assinaturas conferidas
  linha a linha contra o arquivo real (não um mock). `npm run
  test:dev-server-config` — "porta sincronizada, diagnóstico, cleanup
  seguro e isolamento de produção aprovados".
- Suíte de regressão completa (10 scripts): `test:tournament-registration`,
  `test:ranking-consistency`, `test:tournament-flow-rc`,
  `test:partnerships-v29`, `test:living-partnership-market-phase15`,
  `test:world-partnership-dynamics`, `test:players`, `test:missions`,
  `test:ranking-race-season`, `test:simulation-population-cap-invariant`
  — **todos EXIT 0, todos com texto de PASS genuíno conferido**
  (`test:partnerships-v29`/`test:living-partnership-market-phase15`/
  `test:world-partnership-dynamics` exercitam exatamente o caminho de
  `dissolvePartnerships` modificado nesta fase).
- Testes novos desta fase, todos PASS: `test:backup-rotation-fase29`
  (6/6), `test:backup-cleanup-existing-installs-fase29` (6/6),
  `test:partnership-legacy-scope-fase29` (11/11),
  `test:career-partnership-history` estendido (19/19, era 9 antes desta
  fase).

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | #20 corrigido via rotação por padrão (não nome estável), com teste de N gravações | ✅ 6/6 PASS; validado por reexecução do diagnóstico de 6 meses — 223→946 arquivos vira estável em 6 |
| 2 | Limpeza de instalações existentes, com números concretos de arquivo/MB | ✅ 801 arquivos/1,4MB → 9 arquivos/<0,1MB após um único load; varredura automática + botão manual no BetaTools |
| 3 | Validação de 6 meses mostrando backups travados em 3 (por armazém) | ✅ confirmado — 6 = 2 arquivos × 3 mantidos, MB residual é só o save crescendo |
| 4 | Mapeamento da dependência de `TeamRanking` + baseline re-congelada se contaminada | ✅ investigado — baseline NÃO contaminada, não re-congelada; critério de poda corrigido por princípio mesmo assim |
| 5 | Poda do harness corrigida pra distinguir dupla dissolvida de "não histórica" | ✅ checa `Partnership.status==='ativa'` em vez de "está no set de 27" |
| 6 | Política de acumulação definida (comunicada ANTES de aplicar) e implementada, com os 4 ajustes | ✅ `PartnershipLegacy` (escopo jogador/real, migração idempotente, `Partnership` nunca apagada na hora — soft-delete com carência de 24 meses por causa do `champion_partnership_id`), `TeamRanking` apagado direto (decisão de comportamento registrada, sinalizada pra Fase 4) |
| 7 | `ranking_history` registrado como entrada do #18 (sem investigar) | ✅ achado #18 amendado |
| 8 | Suíte verde, lint, build e Tauri OK | ✅ tudo genuinamente verificado, não só exit code |

**Resumo executivo**: os dois blocos de correção desta fase (#20 e #21)
compartilham a mesma lição — "marcar em vez de remover" é seguro até
alguém medir a curva, e quando a curva aparece, a correção certa quase
sempre é agregar-o-que-é-visível-e-então-remover, nunca um delete
ingênuo. A diferença entre #20 (delete imediato seguro) e a metade
`Partnership` do #21 (delete precisou virar soft-delete com carência)
foi decidida por evidência de código (grep de referência por id), não
por precaução genérica — e é exatamente esse tipo de verificação que
evita reintroduzir, num achado novo, o mesmo formato de bug que motivou
a fase inteira.

O item 2 confirmou que `docs/baseline-pre-fase3.json` está limpo, e o
#20 está fechado e validado. Por decisão do usuário (mensagem que abriu
esta fase), **a Fase 3 começa em seguida**.
