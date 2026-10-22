# LOCAL-9E.1-H1 — Integridade da renovação de patrocínio (E1-01) e revisão R1 (E1-01b)

Branch `integracao/cloud-6o`, base `633298b`. Hotfix isolado: corrige a renovação de patrocínio (H1) e a reassinatura após rescisão voluntária, a assinatura idempotente e a integridade do saldo (R1, §15), sem mexer em valores, durações, metas, propostas ou outros sistemas.

Evidências: `reports/local-9e1-h1-sponsorship-renewal/`.

## 1. Causa-raiz

Toda a renovação estava em `renewContract(contract, sponsor, profile)` (`src/lib/sponsors.js`), chamada pela tela de Economia (`src/pages/Economy.jsx` → `SponsorPanel.onRenew`) e pelo simulador da 9E.1. A função:

1. só verificava `contract.is_renewable`, do **objeto recebido do chamador**;
2. não tinha janela: renovava em qualquer data, inclusive no dia da assinatura;
3. não olhava `is_active`: contrato rescindido, vencido ou já renovado também renovava;
4. encerrava o contrato antigo e **criava outro com id aleatório** (`makeUniqueId`);
5. creditava `profile.coins + luvas` a partir do **perfil recebido** (possivelmente desatualizado);
6. gravava o extrato com id `sponsor-renewal-<id do contrato antigo>-<data>`, que muda a cada contrato novo;
7. fazia tudo em gravações separadas (update, create, notícia, update do perfil, extrato).

Como cada renovação gerava um contrato novo com id novo, e nada impedia renovar esse contrato novo, a ação podia ser repetida sem limite. O id do extrato também mudava a cada ciclo, então a deduplicação dele nunca atuava.

### Respostas da investigação (§2)

| # | Pergunta | Resposta (HEAD `633298b`) |
|---|---|---|
| 1 | Função que renova | `renewContract` em `src/lib/sponsors.js` |
| 2 | Função que paga as luvas | A própria `renewContract` (`PlayerProfile.update` + `recordFinancialEntry`). Na assinatura, `signSponsorContract` |
| 3 | Verificações antes de renovar | Só `contract.is_renewable`, do objeto do chamador |
| 4 | Modifica ou cria? | Desativa o antigo (`termination_reason: 'Renovado'`) e **cria outro** |
| 5 | Identidade do contrato | `id` aleatório do repositório; `sponsor_id` aponta para o catálogo |
| 6 | Vencimento | `end_date = data da carreira + contract_duration_months` (na assinatura e na renovação) |
| 7 | Período mínimo | Nenhum |
| 8 | Renovar longe do vencimento? | Sim, inclusive no dia da assinatura |
| 9 | Proteção contra pagamento duplicado | Nenhuma no saldo. O extrato usa `upsert` por id, mas o id muda a cada contrato |
| 10 | Save/load entre renovações | O novo contrato é persistido e pode ser renovado de novo após carregar |
| 11 | Mesma ação duas vezes | Paga duas vezes. Com objeto desatualizado, cria dois contratos ativos do mesmo patrocinador |
| 12 | Outros caminhos | Sim: **rescindir e reassinar** o mesmo patrocinador paga luvas de assinatura de novo (E1-01b, §13). O fechamento mensal (`processMonthlyFinances`) é protegido por `monthly_close` no mês, e a avaliação mensal (`evaluateSponsorContracts`) por `last_evaluated_month`. Nenhum dos dois paga luvas |

Fluxos que tocam contratos de patrocínio:

- **Assinatura:** `signSponsorContract`: `canSign`, um contrato ativo por patrocinador, `validateSponsorSlot`, `negotiateOffer`, luvas e extrato `sponsor-signing-<perfil>-<patrocinador>-<data>`.
- **Salário mensal:** `processMonthlyFinances` (`src/lib/economy.js`), chamado na virada do mês (`src/lib/career.js`). Antes de pagar, expira os contratos com `end_date < career_date`.
- **Metas e satisfação:** `evaluateSponsorContracts` (`src/game-core/sponsorLifecycle.js`), disparada pelo botão "Avaliar contratos". Pode encerrar o contrato.
- **Rescisão:** `terminateSponsorContract`, sem multa.
- **Save/migração:** `PlayerContract` não tem validação de campos no schema 22 (`src/careers/careerSchema.js`). Campos opcionais novos não exigem migração.

## 2. Reprodução

`scripts/test-local-9e1-h1-sponsorship-renewal.mjs`, rodado contra uma cópia isolada do HEAD `633298b` (`repro-head-633298b.json`). Resultado: **5/23** (os casos G e H usam a API nova e não rodam no HEAD):

- **P (sonda da 9E.1):** 3 renovações no dia da assinatura pagaram `[398, 398, 398]` e criaram 4 contratos.
- **A:** contrato antigo, objeto forjado e contrato novo renovam de novo (4×).
- **C:** após save/load, a renovação anterior repete e paga.
- **F:** contrato vencido, contrato rescindido e contrato encerrado pelo fechamento mensal renovam e pagam.
- **I:** 5 chamadas simultâneas criaram **5 contratos ativos** do mesmo patrocinador. O saldo subiu só 398 porque cada chamada sobrescreveu o saldo com o mesmo perfil desatualizado.

## 3. Fluxo corrigido

```
Tela (SponsorPanel) / simulador
  └─ renewContract(contract, sponsor, profile)       ← porta antiga, mesma assinatura
       ├─ sponsor.id ≠ contract.sponsor_id → recusa ('sponsor-mismatch')
       └─ renewSponsorContract(profileId, contractId) ← domínio
            1. relê perfil e contrato do save (ignora o objeto da tela)
            2. getSponsorRenewalEligibility(contrato, career_date, { profileId })
               → recusa explícita { ok:false, status:'refused'|'duplicate', code, reason }
            3. patrocinador do CATÁLOGO pelo sponsor_id; negotiateOffer com o perfil relido
            4. localGame.batch([...], { idempotencyKey: 'sponsor-renewal:<id antigo>' })
                 create  PlayerContract <raiz>-renewal-<n>
                 update  contrato antigo: is_active:false, 'Renovado', renewed_to_contract_id
                 playerIncrement coins += luvas   (R1: soma dentro da gravação; H1 usava playerUpdate absoluto)
                 upsert  FinancialTransaction sponsor-renewal-<id antigo>-<data>
            5. notícia (publishContractEvent, upsert por id)
            → { ok:true, status:'renewed', profile, contract, bonus }
```

`renewContract` lança `Error(reason)` com `code` quando a renovação é recusada. A tela mostra o erro e não o sucesso (`Economy.handle`). O simulador registra a recusa.

## 4. Regra de elegibilidade

`getSponsorRenewalEligibility(contract, careerDate, { profileId })`, função pura exportada por `src/lib/sponsors.js`. Ordem das verificações:

| Código | Condição |
|---|---|
| `missing-contract` | contrato inexistente |
| `wrong-profile` | `contract.profile_id` ≠ atleta |
| `already-renewed` | `renewed_to_contract_id` presente ou `termination_reason === 'Renovado'` |
| `inactive` | `is_active` falso (rescindido, expirado no fechamento, encerrado por metas) |
| `not-renewable` | `is_renewable` falso |
| `unknown-sponsor` | `sponsor_id` fora do catálogo. Sem `sponsor_id`, busca por nome, como a tela já fazia para contratos legados |
| `no-end-date` / `invalid-date` | sem data de fim ou data da carreira inválida |
| `expired` | data da carreira > `end_date` (vencido, ainda não fechado pelo mês) |
| `too-early` | data da carreira < `end_date − 30 dias` |
| `eligible` | janela **[end_date − 30, end_date]**, inclusive |

### Por que 30 dias (decisão conservadora)

O jogo não tinha janela de renovação para patrocínio. Opções avaliadas:

| Alternativa | Avaliação |
|---|---|
| **A. Janela nos últimos 30 dias, uma renovação por contrato** (adotada) | O patrocínio é mensal em tudo: o mercado muda por mês, a avaliação de metas é mensal e o salário é pago no fechamento do mês. 30 dias é um ciclo de pagamento, menor que o contrato mais curto do catálogo (4 meses), e é a mesma janela que a política do simulador da 9E.1 já usava. Não muda valores, durações nem a data de início do novo contrato |
| B. Renovar a qualquer momento, luvas só no último mês | Mantém o botão sempre ativo, mas permite renovar cedo e "zerar" a duração para fugir de metas. Cria dois tipos de renovação |
| C. Renovar só após o vencimento, com carência (como a parceria de dupla, +7 dias) | Exige mudar o fechamento mensal, que hoje expira no dia 1. Altera o ciclo de vida do contrato |
| D. Uma renovação por patrocinador por ano | Regra nova sem paralelo no jogo |

A janela é a constante `SPONSOR_RENEWAL_WINDOW_DAYS = 30`. Mudá-la é decisão da LOCAL-9D.

A renovação mantém o comportamento anterior: o novo contrato começa na data da renovação, com a duração do catálogo. Os dias restantes do contrato antigo (no máximo 30) não se somam.

## 5. Identidade da renovação

- **Ciclo contratual = contrato.** Cada contrato renova no máximo uma vez. Depois disso, o antigo fica com `renewed_to_contract_id`.
- **Contrato novo com id determinístico:** `<renewal_root_id>-renewal-<renewal_sequence>`, com raiz = id do primeiro contrato da cadeia. O ciclo seguinte tem outro id (sequência + 1), então uma renovação futura legítima não colide com a anterior, e a repetição da anterior colide.
- **Chave de idempotência:** `sponsor-renewal:<id do contrato antigo>`, no mecanismo existente do repositório (`batch(..., { idempotencyKey })`, o mesmo da finalização de partidas), verificada **dentro** da gravação serializada.
- **Extrato:** mantém o formato `sponsor-renewal-<id antigo>-<data>`. Como o contrato antigo só renova uma vez, o id é único por ciclo.
- O nome do patrocinador não é usado como identidade.

## 6. Regra de pagamento

As luvas de renovação mantêm a fórmula (`sign_bonus` negociado × (1 + `renewal_bonus_pct`)), calculada com o patrocinador **do catálogo** e o perfil **relido**. Valores enviados pelo chamador são ignorados: o caso H testa um patrocinador forjado com `renewal_bonus_pct: 5000`, e o valor pago é o do catálogo. O pagamento só ocorre na mesma gravação que cria o contrato novo e encerra o antigo. Recusa não paga.

## 7. Idempotência e falhas

Três proteções independentes:

1. **Estado do contrato** (durável): o antigo fica inativo e com `renewed_to_contract_id` → `already-renewed`.
2. **Chave de idempotência** no lote, verificada dentro da fila de gravação (`ActiveCareerAdapter.writeChain`). Barra chamadas que leram o mesmo estado antes da primeira gravar.
3. **Id determinístico** do contrato novo: um `create` repetido falha ("já existe") e vira `duplicate`.

**Atomicidade:** `localGame.batch` aplica as operações num rascunho clonado e faz **uma** gravação física. Qualquer erro descarta o rascunho (`ActiveCareerAdapter.mutateActiveCareer`). Não há estado em que o contrato foi renovado sem o pagamento, nem o contrato antigo encerrado sem o novo, nem o extrato divergente do saldo. A notícia fica fora do lote: é cosmética, `upsert` por id, e engole falhas por desenho.

## 8. Persistência e compatibilidade de saves

- **Schema 22 mantido**, sem migração e sem invalidar carreiras.
- Campos opcionais novos em `PlayerContract`: `renewed_to_contract_id` (no antigo), `renewed_from_contract_id`, `renewal_root_id` e `renewal_sequence` (no novo). O contrato renovado também preserva `sponsor_category`, que a versão anterior perdia (o slot já caía no catálogo, sem efeito prático).
- A chave de idempotência usa o campo existente `player.processed_match_finalizations` (limitado aos 250 últimos). Se a chave sair da lista, as proteções 1 e 3 continuam valendo.
- **Saves antigos:** contratos legados não têm os campos novos. Os já renovados estão inativos com `'Renovado'` e continuam bloqueados. Um contrato ativo legado entra na regra nova pela data de fim. Dinheiro já obtido pelo exploit **não é estornado**: seria uma mutação retroativa do save, e o pedido proíbe alterar saves reais.
- Nenhum save, backup ou IndexedDB real foi lido ou gravado. Os testes usam carreiras em memória.

## 9. Interface

`SponsorPanel.jsx`: o botão "Renovar" continua onde estava, com o mesmo estilo, e consulta `getSponsorRenewalEligibility`:

- **fora da janela:** desabilitado, com a nota "Renovação a partir de dd/mm/aaaa";
- **na janela:** habilitado, com "Janela de renovação aberta · vence em N dia(s)";
- **vencido ou outra recusa:** desabilitado, com o motivo do domínio.

O sucesso só aparece quando o domínio confirma. Na recusa, a tela mostra o motivo como erro. A tela não credita nada.

## 10. Simulador LOCAL-9E.1

- `sim-local-9e1-decisions.mjs` consulta a elegibilidade do jogo antes da política e registra uma recusa como `renew: false, reason: 'recusada:<código>'`, sem abortar o passo. A política (`shouldRenewSponsor`) não mudou.
- Na sonda de `test-local-9e1-decision-simulator.mjs`, a recusa (que agora lança) passou a ser capturada e registrada em `renewalOutcomes`. A asserção original continua a mesma (`activeAfter === 1`). Resultado da sonda: `[398, 398, 398]` → `[0, 0, 0]`, com `too-early` nas três.
- As evidências da 9E.1 (`reports/local-9e1-decision-simulator/`) ficaram intactas. As novas estão na pasta do H1.

## 11. Testes de exploração

`node scripts/test-local-9e1-h1-sponsorship-renewal.mjs`: **30/30** (`tests.json`). No HEAD: **5/23** (os casos G e H usam a API nova e não rodam no HEAD).

| Caso | Verifica | HEAD | Corrigido |
|---|---|---|---|
| P | Sonda 9E.1: 3× no dia da assinatura | +398 ×3, 4 contratos | 0 ×3, 1 contrato |
| A | Repetir no mesmo dia (objeto antigo, forjado, contrato novo ×2) | renova 4× | `already-renewed` ×2, `too-early` ×2, nada muda |
| B | Fora da janela (dia 0 e fim − 31) | renova | `too-early`, nada muda |
| C | Save/load entre renovações | repete e paga | recusado. Saldo, contratos e extrato idênticos após 2 loads |
| D | Dois contratos na janela | — | cada um renova uma vez e paga só as suas luvas |
| E | Segundo ciclo | renova cedo | fim − 31 recusa, fim − 3 aceita, paga uma vez, ids `raiz-renewal-1/2` |
| F | Vencido / rescindido / expirado no fechamento | renovam e pagam | `expired` / `inactive` / `inactive`, extrato vazio |
| G | Falha dentro e antes do lote, reload, nova tentativa | (API nova) | nenhum efeito parcial. A nova tentativa renova uma vez, a seguinte é recusada |
| H | Domínio sem a tela, regra pura, patrocinador forjado | (API nova) | resultado explícito. Janela [fim−30, fim]. Valor do catálogo |
| I | 5 chamadas simultâneas, mesmo estado | 5 contratos ativos | 1 renovação, 4 `already-renewed`, 1 linha de extrato |

As datas são posicionadas direto no perfil (fixture). O avanço real de dias com renovações é exercido pelo simulador (§12).

## 12. Regressões e resultado econômico

Rodadas no HEAD `633298b` (baseline) e com a correção, com os mesmos comandos (`TZ=UTC node --max-old-space-size=6144 scripts/<suíte>.mjs`):

| Suíte | HEAD | Corrigido |
|---|---|---|
| test-local-9e1-decision-simulator (LOCAL-9E.1) | 48/48 | 48/48 (sonda: `[398,398,398]` → `[0,0,0]`) |
| test-local-9b-attribute-equipment-foundation (9B) | 71/71 | 71/71 |
| test-local-9b-r1-validation (9B-R1) | 25/25 | 25/25 |
| test-local-8g1-preseason-initialization (8G.1) | 24 PASS, 0 FAIL | 24 PASS, 0 FAIL |
| test-local-8g-navigation-stability (8G) | 31 PASS, 0 FAIL | 31 PASS, 0 FAIL |
| test-local-8c-save-integrity | 23 ✓ | 23 ✓ |
| test-career-persistence-integrity | 54 ✓ | 54 ✓ |
| test-cloud-7b2a-determinism | 10/10 | 10/10 |
| test-achievement-save-migration | 28 ✓ | 28 ✓ |
| test-all-sponsors-reachable-v526c, test-sponsor-scaling-v527b, test-sponsor-share-distribution-v527c | ok | ok |
| test-financial-flow-dates/reconciliation-v527m, test-reward-ledger-balance-v527m | ok | ok |
| **Preexistentes (falham igual no HEAD)** | | |
| test-sponsor-eligibility-authority-v526c | 4 ✗ | os mesmos 4 ✗ |
| test-sponsor-tier-age-progression-v526b | 2 ✗ | os mesmos 2 ✗ |
| test-sports-economy-v26 | erro (`Clubs.jsx` não integrado) | idem |
| test-cloud-7b1-save-pipeline | equivalência byte a byte com baseline histórico | idem |
| test-phase15-3-economy-progression-navigation | exit 1 | idem |
| test-tier-ladder-migration-fase3 | 1 ✗ | o mesmo 1 ✗ |
| test-no-balance-mutation-v527d | 2 ✗ (`codeHash` congelado de fase antiga + diff de balanço) | os mesmos 2 ✗ (só o hash do código muda) |

O conjunto de verificações que falham é **idêntico** linha a linha entre HEAD e correção. **Nenhuma regressão nova.** Lint (`eslint . --quiet`), `validate:architecture`, `vite build` e `git diff --check` passaram.

Simulador da 9E.1 com o código corrigido, mesmos perfis, seeds e comando (`economy-before-after.json`).

**Antes da primeira renovação, nada muda.** As 9 carreiras de 30 dias (3 perfis × seeds 1–3) têm `resultHash` **idêntico** ao da 9E.1. A primeira renovação acontece entre os dias 126 e 189.

**365 dias:** 67 renovações em 9 carreiras (baseline: 69). Todas com 24 a 30 dias restantes, todas pagas uma vez, 0 recusas do jogo (a política já renovava só nos últimos 30 dias), 0 erros, 0 violações, save/load ok.

Médias por perfil (365 d, seeds 1–3), baseline 9E.1 → corrigido:

| Perfil | Caixa final | Patrimônio | Luvas de renovação | Renovações | Luvas de assinatura | Salário de patrocínio | Ranking |
|---|---|---|---|---|---|---|---|
| Econômico | 8.890 → 9.112 | 36.868 → 37.597 | 2.562 → 2.618 | 8 → 7 | 1.366 → 1.480 | 16.248 → 17.131 | 373 → 379 |
| Equilibrado | 14.613 → 12.686 | 25.504 → 23.108 | 2.570 → 2.545 | 8 → 7 | 1.366 → 1.484 | 16.252 → 16.716 | 244 → 316 |
| Competitivo | 4.666 → 4.705 | 4.666 → 4.705 | 2.609 → 2.609 | 8 → 8 | 1.366 → 1.366 | 16.398 → 16.398 | 248 → 246 |

Por que os hashes de 365 dias mudam: o `create` antigo gerava o id do contrato com `makeId`, que consome `Math.random`, e no simulador esse é o fluxo determinístico da carreira. O id determinístico não consome. Da primeira renovação em diante, a sequência aleatória se desloca e partidas e eventos seguintes divergem. No competitivo, as renovações são idênticas em número e valor. A diferença do equilibrado vem quase toda da seed 3 (ranking 163 → 312), variação esportiva caótica da mesma ordem que a 9E.1 já registrava entre seeds. Não é efeito econômico da regra.

**O simulador nunca explorou o defeito** (a política só renovava na janela). Por isso a diferença econômica relevante está na sonda e nos casos A/C/F/I: o ganho ilimitado (+398 por clique) desapareceu. Nenhum valor foi rebalanceado.

## 13. Riscos residuais e limitações

Atualizado na R1 (ver §15.8).

- **E1-01b** e **assinatura dupla simultânea**: corrigidos na R1 (§15).
- **Saldo absoluto**: assinatura e renovação de patrocínio agora somam dentro da gravação serializada (`playerIncrement`). Outros fluxos do jogo (fechamento mensal, compras, treinador etc.) continuam gravando saldo absoluto via `PlayerProfile.update`. Uma dessas gravações concorrente com uma assinatura ainda pode sobrescrever um crédito. Fora do escopo: seria a refatoração geral do sistema financeiro.
- **Dinheiro já obtido pelos exploits** em saves existentes não é estornado.
- `evaluateSponsorContracts` continua fora do loop do jogo (achado da 9E.1). As metas não mudaram.
- A janela de 30 dias foi aprovada (D1) e a carência de 90 dias também (D2).

## 14. Recomendações para a LOCAL-9D

1. Avaliar se a renovação deve começar no fim do contrato atual (somar os dias restantes) em vez da data da renovação.
2. Levar `playerIncrement` aos demais créditos e débitos do jogo, quando o sistema financeiro for revisto.
3. Decidir se a rescisão voluntária deve ter multa, além da carência.
4. Reavaliar E1-08 (todos ficam no Bronze) com assinatura e renovação já íntegras.

## 15. LOCAL-9E.1-H1-R1 — assinatura, carência e integridade do saldo

Decisões aprovadas: **D1** janela de renovação de 30 dias (mantida da H1), **D2** carência de 90 dias para reassinar após rescisão voluntária, **D3** assinatura idempotente, **D4** saldo atualizado dentro da operação serializada.

### 15.1 Investigação

| # | Pergunta | Resposta (antes da R1) |
|---|---|---|
| 1 | Como a rescisão voluntária é identificada | Só pelo caminho `terminateSponsorContract` (botão "Rescindir" do `SponsorPanel`), com motivo padrão `'Rescisão voluntária'`. Os outros encerramentos têm motivos próprios: `'Contrato expirado'` (`processMonthlyFinances`), `'Metas comerciais e desempenho insuficientes'` (`evaluateSponsorContracts`) e `'Renovado'` |
| 2 | Data e motivo persistidos? | O motivo, sim. A **data da carreira, não**: só existe `updated_date`, do relógio real, que muda em qualquer atualização |
| 3 | Identidade do patrocinador | `sponsor_id` = id do `SPONSOR_CATALOG`. Contratos legados podem ter só `sponsor_name`/`brand_name` |
| 4 | Contratos encerrados ficam no histórico? | Sim. Nenhum fluxo apaga ou compacta `PlayerContract`. Os relatórios mensal e anual leem o histórico |
| 5 | Contratos simultâneos com o mesmo patrocinador? | Não pela regra (`signSponsorContract` recusa se houver um ativo), mas a checagem era feita fora da gravação: 5 chamadas simultâneas criavam 5 ativos |
| 6 | Como a assinatura grava | 4 gravações separadas: `PlayerContract.create`, notícia, `PlayerProfile.update({ coins: profile.coins + luvas })` com o perfil **recebido**, e extrato `sponsor-signing-<perfil>-<patrocinador>-<data>` |
| 7 | Idempotência? | Nenhuma no contrato nem no saldo. O extrato deduplicava por data e por isso **escondia** o segundo pagamento (T2 no HEAD: saldo +372, extrato com 1 linha) |
| 8 | Outros caminhos para reassinar | Só `signSponsorContract` (tela via `SponsorNegotiationModal` → `Economy.onSign`, e `v526Actions.signSponsor` do simulador). O simulador nunca rescinde |

### 15.2 Causa-raiz do E1-01b

`terminateSponsorContract` encerrava sem multa e sem data da carreira, e `signSponsorContract` só barrava contrato **ativo** do mesmo patrocinador. Assinar → rescindir → assinar pagava luvas a cada ciclo, inclusive no mesmo dia: `[372, 372, 372]`. Como a assinatura não era atômica nem idempotente e gravava saldo absoluto, chamadas simultâneas criavam contratos duplicados (T8) e créditos de operações distintas se sobrescreviam (T9 no HEAD: +509 em vez de +1.102).

### 15.3 Regra de carência (D2)

- `terminateSponsorContract` relê o contrato. Só rescinde contrato **ativo**: repetir não move a data nem reescreve "Renovado"/"Contrato expirado". Grava `voluntary_termination_on` com a **data da carreira** do perfil dono.
- `getSponsorResignCooldown(sponsorId, contratos, dataDaCarreira)` é uma função pura. Pega a rescisão voluntária mais recente do patrocinador, identificado pelo **id canônico do catálogo** (`findContractSponsor`: `sponsor_id`, com fallback por nome para contratos legados), em **qualquer** contrato da cadeia: assinatura, renovado, reassinado. Bloqueia enquanto `data < rescisão + 90`. **Dia 89: bloqueado. Dia 90: liberado.**
- Ids novos não contornam: a regra olha o patrocinador, não o contrato (T6). Uma nova rescisão reabre a carência pela nova data.
- **Encerramentos naturais não geram carência**: vencimento, encerramento pelo patrocinador por metas e renovação não gravam `voluntary_termination_on` (T10). Nenhuma regra existente justificava estendê-la a eles.
- A tela consulta a mesma função (`SponsorPanel`, com o histórico carregado pelo `Economy`) e mostra "Contrato rescindido em dd/mm/aaaa: nova assinatura com este patrocinador a partir de dd/mm/aaaa". O domínio é a autoridade: a assinatura recusa com `code: 'resign-cooldown'`.

### 15.4 Assinatura idempotente (D3)

`signSponsorContract` agora:

1. Relê perfil e histórico do save.
2. Valida, nesta ordem: `canSign`, contrato ativo do mesmo patrocinador (`already-active`), carência (`resign-cooldown`) e slot (`slot`).
3. Grava contrato, `playerIncrement` das luvas e extrato num **único `localGame.batch`**, com `idempotencyKey: sponsor-signing:<patrocinador>:<n>`, onde `n` = nº de contratos daquele patrocinador no histórico + 1.

Chamadas que leram o mesmo histórico disputam a mesma chave, verificada dentro da fila de gravação, e só a primeira grava. As demais recebem `code: 'duplicate'`, sem efeito (T8: 1 contrato, 1 pagamento). Uma assinatura legítima posterior tem `n` maior e outra chave.

O extrato mantém o formato antigo para a 1ª assinatura do patrocinador. Da 2ª em diante ganha o sufixo `-<n>`, para não colidir com a linha de uma assinatura anterior na mesma data. O id do contrato continua gerado pelo repositório, como antes.

### 15.5 Integridade do saldo (D4)

Novo tipo de operação no lote do repositório: `playerIncrement` (`CareerEntityRepository.batch`). Ele soma sobre o valor **atual** do perfil dentro da gravação serializada (`ActiveCareerAdapter.writeChain`), em vez de gravar um valor absoluto lido antes. Assinatura e renovação usam esse incremento. O T9 executa 2 assinaturas e 1 renovação simultâneas a partir do mesmo perfil antigo: o saldo final é a soma exata dos três créditos, com 3 linhas de extrato. É uma extensão aditiva: `playerUpdate` e os demais fluxos não mudaram.

### 15.6 Persistência e compatibilidade

- Schema 22 mantido, sem migração. Único campo persistido novo: `voluntary_termination_on` (contrato rescindido pelo jogador).
- Saves antigos (T11): contratos sem os campos novos carregam sem perda (contratos, histórico e dinheiro iguais após reload). Um contrato ativo legado renova pela regra de janela. Rescisões voluntárias **anteriores à R1** não têm data da carreira e **não geram carência**, porque não há como datá-las sem usar o relógio real. É a opção conservadora: não bloqueia ninguém indevidamente nem altera saves.
- As chaves de idempotência usam o campo existente `player.processed_match_finalizations` (os 250 últimos). Fora dessa janela continuam valendo as proteções duráveis: contrato ativo, carência e estado do contrato renovado.

### 15.7 Testes

`node scripts/test-local-9e1-h1-r1-sponsorship-signing.mjs` (`r1-tests.json`): **19/19**. No HEAD `633298b` (`r1-repro-head-633298b.json`): **6/18**. A verificação pura do T3 só existe com a API nova.

| Teste | HEAD `633298b` | Corrigido |
|---|---|---|
| T1 três renovações imediatas | +398 ×3, 4 contratos | 0 ×3 |
| T2 rescindir e reassinar no mesmo dia | paga de novo (+372), sem data gravada | recusado, sem efeito; data da carreira gravada |
| T3 89 / 90 dias | — (reassinou no dia 0) | 89 bloqueia, 90 libera e paga uma vez; regra pura 88–91 |
| T4 patrocinador diferente | — | B assina no mesmo dia; A segue bloqueado |
| T5 save/load nos dias 0, 45 e 89 | reassinou após o load | 3 recusas, nada muda |
| T6 contrato renovado / id novo | reassinou | bloqueia pelo patrocinador; nova rescisão reabre a carência |
| T7 assinatura repetida | ok (sequencial já era recusada) | recusada |
| T8 5 assinaturas simultâneas | 5 contratos ativos | 1 contrato, 1 pagamento |
| T9 2 assinaturas + 1 renovação simultâneas | +509 (esperado 1.102) | soma exata |
| T10 vencimento e metas | sem carência | sem carência |
| T11 save antigo | carrega | carrega; legado renova pela janela |
| T12 determinismo | ok | ok (saldo, contratos e extrato idênticos) |

O teste da H1 continua em **31/31**. O caso X, antes um registro sem asserção, agora verifica `[372, 0, 0]`.

### 15.8 Regressões

Mesmas 22 suítes da H1, contra a baseline do HEAD `633298b`. O conjunto de verificações que falham é **idêntico** linha a linha: as mesmas 7 suítes preexistentes da §12. **Nenhuma regressão nova.** LOCAL-9E.1 ficou em 48/48 (sonda `[0, 0, 0]`), 9B em 71/71, 9B-R1 em 25/25, 8G.1 em 24/0, 8G em 31/0 e determinismo em 10/10. Lint, `validate:architecture`, `vite build` e `git diff --check` passaram.

**Hashes de 30 dias do simulador** (`r1-simulator-check.json`): agora diferem da 9E.1, embora nenhuma carreira assine patrocínio em 30 dias. A causa é do harness: o simulador não define `PL527D_ISOLATE_VITE_RNG`, então o carregamento de módulos do Vite consome o `Math.random` determinístico da carreira. A R1 removeu de `sponsors.js` um import que ficou sem uso (`financialLedger.js`), e isso muda a ordem de carregamento. Prova: com o import recolocado, o hash da carreira econômico/seed 1 volta a ser **idêntico** (`9e3985140ab3378f`). O import foi mantido removido. O determinismo dentro da mesma versão do código continua garantido (teste da 9E.1: mesma seed → mesmo hash).

### 15.9 Arquivo não rastreado regravado pela suíte 8G

Durante a baseline da H1, `scripts/test-local-8g-navigation-stability.mjs` regravou `reports/local-8g-navigation-stability/stability-working-tree.json`, um arquivo **não rastreado e preexistente** de fase anterior. O conteúdo original **não pôde ser recuperado** (não está versionado). O conteúdo atual é o daquela execução, feita com o código do HEAD. Na R1, o arquivo foi copiado com hash antes da bateria e restaurado depois, junto com os demais não rastreados preexistentes (hashes conferidos). **Esse arquivo não deve entrar em commit.**

Os scripts de regressão também regravam relatórios **versionados** (`reports/local-8c-…/save-integrity.json`, `local-9b-…/r1-validation.json` e `results.json`, `local-9e1-decision-simulator/tests.json`, `phase15-3-simulation.json`, `progression-clean-526c/sponsors-reachability.json`, `rebalance-527d/stage1-decision.json`) e criam artefatos (`local-8g1-…/working-tree.json`, `rebalance-527d/analysis/`, `scripts/.sportsEconomyV26.test.mjs`). Todos estavam limpos ou ausentes antes de cada execução. Depois de cada uma, os versionados foram restaurados ao HEAD e os artefatos removidos.

### 15.10 Riscos residuais

- Outros fluxos de saldo (fechamento mensal, compras, treinador, staff etc.) ainda gravam valor absoluto. Uma dessas gravações, se concorrente com uma assinatura ou renovação, pode sobrescrever o crédito. A correção completa é a revisão geral do sistema financeiro, fora do escopo.
- O slot é validado antes do lote: duas assinaturas simultâneas de patrocinadores **diferentes** na mesma categoria podem exceder o limite do slot. Na tela, o modal fecha ao assinar e a ação fica `busy`.
- Rescisões voluntárias anteriores à R1 não geram carência (§15.6).
- Dinheiro já obtido pelos exploits em saves existentes não é estornado.
