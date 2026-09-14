# Fase 8.8 — CareerEntityRepository: id participa de resultado, mas já está corretamente neutralizado desde a Fase 0.1

> **COMPLETA — diagnóstico, sem correção.** O achado da Fase 8.7 estava
> **parcialmente errado**: `CareerEntityRepository.js:13` (`makeId()`,
> `Date.now()`/`Math.random()`) NÃO é uma fonte de drift ativa. O `id`
> gerado ali de fato **participa de decisões que afetam resultado**
> (usado dentro de `hash()` para pareamento e para modificador de
> performance por partida — o mesmo padrão de risco do achado #27) — mas
> esse risco específico já foi identificado e corrigido na **Fase 0.1**,
> a fase fundacional desta auditoria, muito antes da Fase 8. O harness já
> neutraliza `Date.now()`/`Math.random()` globalmente (`installDeterminism`)
> ANTES de qualquer criação de entidade, tornando o conteúdo do `id`
> perfeitamente reproduzível. Confirmado empiricamente nesta fase: duas
> execuções frescas, mesma seed, código atual — `tournament-results.csv`
> **byte a byte idêntico** nas duas. O achado da Fase 8.7 é uma
> redescoberta equivocada de um problema já resolvido — corrigido aqui
> por registro, não requer mudança de código.

## 1 — Mecanismo exato

### 1.1 — O id NÃO é "só um identificador" — participa de resultado

Confirmado por leitura de código: `athlete.id` (e `pair.id`) entram
DIRETAMENTE em cálculos que decidem quem vence:

```js
// WorldTourLifecycle.js:27 — modificador de performance por partida
return rating * 1.8 + form * 0.25 + energy * 0.12 + (hash(`${athlete.id}:${tournament.id}`) % 2400) / 100;

// WorldTourLifecycle.js:42 — modificador de química de dupla
return base + Number(pair.chemistry || 50) * 0.08 + (hash(`${pair.id}:${tournament.id}:pair`) % 900) / 100;

// aiPartnershipLifecycle.js:168-169, 181 — selectPair, decide quem forma dupla com quem
const scoreA = hash(`${month}:${pairIndex}:${a.id}`);
const scoreB = hash(`${month}:${pairIndex}:${b.id}`);
```

Isso responde à pergunta 1.1 do pedido: **não** é "só uma string nunca
lida por lógica de jogo" — é usado como semente de hash em decisões reais
(quem forma dupla, quanto cada atleta rende numa partida). Se o CONTEÚDO
do `id` variasse entre execuções, o resultado esportivo variaria junto —
exatamente o padrão do achado #27 (`clubs.js`), não o padrão inofensivo
da Fase 4.2.

### 1.2 — Chamada síncrona, sem concorrência que reordene consumo

`makeId()` é chamada de dentro de `create`/`bulkCreate`/`upsert`/`batch`
em `CareerEntityRepository.js` — todos os laços de criação (`for` sobre
`data`/`operations`) são síncronos internamente, mesmo dentro de uma
função `async`. O único `Promise.all` no caminho da IA
(`WorldTourLifecycle.js:350`, `resolveCompletedWorldTourEvents`) é
estritamente de LEITURA (`entities.X.list(...)`) — não cria nem muta
entidades, não consome `Math.random()`/relógio. Não há concorrência real
que possa reordenar o consumo do PRNG/relógio compartilhado — resposta à
pergunta 1.2, mesmo raciocínio que resolveu o achado #27, resultado
diferente (aqui não há concorrência a temer).

### 1.3 — Teste direto: duas execuções, mesma seed, comparação byte a byte

Rodado com o código de produção ATUAL (pós-Fase 8.7, topo-120 já em
produção): duas execuções frescas e independentes,
`--seasons=1 --seed=official-900-100-s1 --proceduralAthletes=900 --proceduralTeams=450`,
sem nenhuma flag de diagnóstico:

```
diff tournament-results.csv (execução A) tournament-results.csv (execução B)
→ 0 linhas de diferença — arquivos byte a byte idênticos
```

**Mesmas entidades (por nome/atributo estável), mesmos ids
(`athleteprofile-<timestamp-seedado>-<sufixo-seedado>`), mesmos
campeões, em TODAS as 160 chaves da temporada.** Isso confirma sem
ambiguidade: sob `installDeterminism()`, o `id` gerado por `makeId()` é
100% reproduzível — o teste que a própria Fase 8.7 deveria ter rodado
antes de reportar o achado como confirmado.

## 2 — Por que isso já estava resolvido: Fase 0.1

`scripts/audit-real-athletes-simulation.mjs:111-136` já documenta este
EXATO mecanismo, com o nome "Fase 0.1, achado crítico" — a fase
FUNDACIONAL desta auditoria inteira, muito anterior à linha 8.x:

- `FASE-0.1-VALIDACAO-HARNESS.md` §1.1 mediu, com o harness de produção
  completo, que forçar `id` pro formato curto (`bot_id`/`team_key`, em
  vez do fallback real `makeId()`) muda o pareamento de reais no mês 1
  de 0/24 pra 6/24, e no mês 12 de 8/24 pra 21/24 — **o mesmo código, a
  mesma seed, só o FORMATO do id muda**, porque o hash FNV-1a usado em
  `selectPair` é sensível a comprimento/formato de string, não só ao
  valor semântico.
- **Correção já aplicada desde então**: o harness NUNCA passa `id`
  explícito pra `AthleteProfile`/`TeamRanking`/`Tournament` — deixa o
  próprio fallback `makeId()` DE PRODUÇÃO rodar (mesmo formato que o
  jogo real usa), com `Math.random`/relógio seedados
  (`installDeterminism`, instalado ANTES de qualquer criação de
  entidade) pra tornar esse `id` reproduzível SEM mudar seu formato.
- Isso é a arquitetura CORRETA, não um acidente: produção mantém
  `Date.now()`/`Math.random()` reais (decisão da Fase 4.2 — o jogo não
  deve ser determinístico por save, conteúdo de id novo não deveria
  precisar ser prevísivel numa partida real), e o HARNESS DE TESTE, não
  o jogo, assume a responsabilidade de neutralizar isso quando
  reprodutibilidade importa.

**A Fase 8.7 redescobriu esse mesmo mecanismo sem verificar se o
contexto de chamada (o harness) já o neutralizava** — via leitura
isolada do arquivo-fonte, sem checar `installDeterminism` nem consultar
`FASE-0.1-VALIDACAO-HARNESS.md`. O achado foi reportado como "causando
drift" sem o teste do item 1.3 acima, que já existia como precedente
(a própria Fase 0.1 já tinha rodado exatamente esse teste: "Determinismo
foi reconfirmado nesta versão também (mesma seed → saída idêntica)").

## 3 — Contaminação retroativa: nenhuma

Como o mecanismo está confirmado determinístico (não “dentro da margem
seguro” — literalmente sem nenhuma variação, §1.3), **não há
contaminação a avaliar**. Nenhuma medição desta auditoria — incluindo as
comparações seed-a-seed da linha 8.2-8.5 e o regime-check de topo-120 da
Fase 8.7 — foi afetada por este mecanismo especificamente. O item 2 do
pedido ("se timing, listar decisões em risco") não se aplica.

### 3.1 — Nota: a divergência original da Fase 8.7 continua sem causa identificada, mas não é esta

A Fase 8.7 comparou sua própria medição contra a medição diagnóstica
original da Fase 8 (`f8-topo120/`) e encontrou números de T2-T5
diferentes (ex.: 31/100 vs. 47/100 na T2). Esta fase **prova que a causa
não é `CareerEntityRepository.js`** (mecanismo confirmado determinístico
agora). A causa real dessa divergência específica permanece
não-identificada — mas como (a) o veredito da Fase 8.7 (adotar topo-120)
não dependia da precisão exata desses números, e (b) o escopo desta fase
era confirmar/refutar um mecanismo específico, não reabrir aquela
investigação, isso fica registrado como um fio solto de precisão
numérica entre duas execuções em commits diferentes — não uma
prioridade, e claramente não o mesmo problema que motivou este
diagnóstico.

## 4 — Proposta de correção: nenhuma mudança de comportamento necessária

**Não implementar nada em `CareerEntityRepository.js` nem em nenhum
arquivo de produção** — a arquitetura atual é a correta e já validada
(§2). Trocar `makeId()` por um wrapper seedado DENTRO do arquivo de
produção reintroduziria exatamente o problema que a Fase 0.1 evitou:
determinismo forçado em produção não é desejado (Fase 4.2), e mudar o
FORMATO do id (mesmo que "mais determinístico") arrisca o mesmo efeito
colateral medido na Fase 0.1 (sensibilidade de `selectPair` a formato de
string).

**Único ajuste de custo trivial, sugerido, não implementado nesta
fase**: um comentário de uma linha em `CareerEntityRepository.js:13`
apontando pra `installDeterminism` (`audit-real-athletes-simulation.mjs`)
e pra `FASE-0.1-VALIDACAO-HARNESS.md`, deixando explícito que esse
`Date.now()`/`Math.random()` É INTENCIONAL em produção e é neutralizado
pelo HARNESS quando reprodutibilidade importa — para que uma terceira
sessão futura não repita o mesmo diagnóstico equivocado da Fase 8.7.
Esforço estimado: **~5 minutos, comentário isolado, zero mudança de
comportamento**. Aguardo decisão sobre se vale a pena nem esse comentário
trivial, ou se o registro neste relatório já é suficiente.

## 5 — Correção ao registro da Fase 8.7

O achado da Fase 8.7 (§1.2 daquele relatório) deve ser lido como
**refutado por esta fase**: `CareerEntityRepository.js:13` não causa
drift sob o harness atual — confirmado por teste direto (§1.3). A
observação de que os números de T2-T5 divergiam entre execuções
permanece verdadeira e sem causa identificada (§3.1), mas a atribuição
específica a essa linha de código estava incorreta.

## Entrega

| # | Item | Resposta |
|---|---|---|
| 1 | Confirmação: conteúdo de id ou timing de resolução? | **Nenhum dos dois, no sentido de "problema ativo"** — o id PARTICIPA de decisões que afetam resultado (padrão de risco do achado #27), mas já está corretamente neutralizado desde a Fase 0.1 (`installDeterminism`, confirmado por teste direto: 2 execuções, 0 diferenças) |
| 2 | Se timing: decisões em risco de margem pequena | Não se aplica — mecanismo confirmado determinístico, sem contaminação retroativa (§3) |
| 3 | Se conteúdo: confirmação de benignidade | Não se aplica diretamente (não é "conteúdo nunca lido") — mas o resultado prático é equivalente a benigno, pela arquitetura já existente (Fase 0.1) |
| 4 | Proposta de correção, com esforço estimado | **Nenhuma mudança de comportamento necessária.** Ajuste opcional trivial (comentário de 1 linha, ~5 min) pra evitar uma terceira redescoberta do mesmo não-problema |

**Recomendação**: registrar como fechado, sem dívida técnica real
pendente — o "achado" da Fase 8.7 não sobrevive a este diagnóstico.
