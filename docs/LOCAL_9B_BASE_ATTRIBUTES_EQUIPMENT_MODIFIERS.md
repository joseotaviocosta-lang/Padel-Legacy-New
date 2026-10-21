# LOCAL-9B — Atributo-base, modificadores de equipamento e integridade da progressão

Branch `integracao/cloud-6o` · base `09acfcc` (LOCAL-9A consolidada) · validação final na LOCAL-9B-R1 (decisões D1–D4).

Corrige o achado **9A-01 (P1)**: o bônus de equipamento era gravado no atributo do perfil e consumia a margem do teto de treino. Não mexe em Loja, preços, catálogo, patrocínios, curva de treino, motor de partida nem ranking.

## 1. Arquitetura anterior

Um único número por atributo no `PlayerProfile`, já com o equipamento somado:

- `Inventory.jsx toggleEquip()` somava `attribute_bonus` ao atributo gravado (piso 0, teto 100) e guardava o delta real em `PlayerInventory.applied_bonus`. Desequipar subtraía esse delta.
- O motor lia o atributo gravado (`{...profile}` → `createMatch` → `normalizePlayer`).
- O treino (`applyAttributeGains`, `getDevelopmentWindow`), o bônus de vitória (`buildMatchRewardsPatch`) e o envelhecimento liam e gravavam o mesmo número.

## 2. Causa raiz

O teto natural de desenvolvimento (`attributeCeiling.js`, 65–98) era aplicado sobre `base + bônus`. Equipar cedo ocupava a margem que o treino daria. A vantagem sumia e o atleta parava de desenvolver a base. Medido na 9A e reproduzido aqui com o kit D (+8,8 OVR declarado):

| Sessões | Sem equipamento | Antigo: base | Antigo: vantagem | Antigo: base perdida |
|---:|---:|---:|---:|---:|
| 1.000 | 60,2 | 54,2 | +2,8 | 6,0 |
| 6.000 | 77,9 | 70,1 | +1,0 | 7,8 |

## 3. Arquitetura corrigida

| Conceito | Onde vive | Quem altera |
|---|---|---|
| **Atributo-base** | campos do `PlayerProfile` (`serve`, `smash`…), como antes | treino, bônus de vitória, envelhecimento |
| **Itens equipados** | `PlayerInventory.equipped` (um por categoria) | equipar/desequipar |
| **Modificador** | derivado, nunca gravado: soma do `attribute_bonus` do `ShopItem` de cada item equipado | — |
| **Atributo efetivo** | calculado: `clamp(base + modificador, 0, 100)` | — |

Não há cache de efetivo nem segunda fonte de verdade. `applied_bonus` deixa de ser usado e é zerado nas linhas tocadas.

## 4. Fonte canônica dos atributos

O atributo-base é o campo do perfil. O teto natural continua `getAttributeDevelopmentCeiling` (sem alteração).

## 5. Fonte canônica dos modificadores

`src/lib/equipmentModifiers.js` (puro, sem I/O):

- `resolveEquippedItems` / `computeEquipmentModifiers(inventory, shopItems)`: só itens `equipped === true`, com `ShopItem` existente, de uma das 9 categorias de slot (pela categoria do catálogo). Um item por categoria; com mais de um equipado (save inconsistente), vale o de menor id, nunca a soma. Linhas duplicadas são contadas uma vez. Chaves de bônus que não são atributo são ignoradas.
- `planEquipToggle`: plano puro de equipar/desequipar. Só muda flags e o nome da raquete.

`src/game-core/equipmentLifecycle.js` (I/O): `loadEquipmentState`, `loadEquipmentModifiers`, `loadEffectivePlayerProfile`, `toggleEquipItem`. Ler não grava nada.

## 6. Cálculo do efetivo

`applyEquipmentModifiers(profile, modifiers)` devolve uma cópia com `base + modificador` em `[0, 100]` por atributo e marca `_attribute_basis: 'effective'`. Um perfil já efetivo não recebe o bônus de novo. `describeAttribute(base, mod)` devolve `{ base, modifier, effective, applied }`.

## 7. Matriz de produtores e consumidores

| Ponto | Lê | Antes | Agora |
|---|---|---|---|
| `trainingSystemV2` (ganho, janela, teto) | base | gravado (com bônus) | **base** — corrige 9A-01 |
| `buildMatchRewardsPatch` (bônus de vitória, teto) | base | gravado | **base** |
| Envelhecimento (`career.js`) | base | gravado | **base** |
| Equipar/desequipar (`Inventory.jsx` → `toggleEquipItem`) | — | gravava atributo | **só flags** |
| Partida treino (`practiceMatchSession`) | efetivo | gravado | **efetivo** |
| Partida de torneio, exibição e Pré-Temporada (`TournamentModal.playerForMatch`, reinício da rodada) | efetivo | gravado | **efetivo** |
| Partida retomada (checkpoint) | snapshot | snapshot | snapshot do `engine_state` (sem mudança) |
| Parceiro e adversários (IA) | próprios | sem equipamento | sem equipamento |
| Conquistas "Alcance 100" / "todos 100" | efetivo | gravado | **efetivo** (§10) |
| OVR no cabeçalho, Perfil, Estatísticas, Legado, ranking (exibição) | base | gravado | **base** (natural); o Perfil mostra o bônus à parte |
| Desempate do ranking individual por OVR (`compareRankingEntries`, pontos iguais) | efetivo | gravado | **efetivo** (`tiebreakRating`) — R1/D3: mesma ordem de antes da 9B |
| OVR na preparação da partida (treino e torneio) | efetivo | gravado | **efetivo** (o que entra em quadra) |
| Interesse de parceiros, compatibilidade, negociação, log de OVR do treinador, `final_overall` do legado | base | gravado | **base** — equipamento não altera a reputação esportiva natural |
| Dificuldade da partida treino (`getDifficultyForPlayer`) | XP | XP | XP (sem mudança) |
| Inscrição e chave | ranking | ranking | ranking (sem mudança) |
| Harness de decisões (`v526Actions.buyAndEquip`, `v526Tournament`) | — | réplica do modelo antigo | usa `toggleEquipItem` e `loadEffectivePlayerProfile` |
| Harness CLOUD-7C | — | sem Loja | sem Loja (sem mudança) |

## 8. Integração com treino

Nenhuma linha de `trainingSystemV2.js` ou `attributeCeiling.js` mudou. Eles já liam o perfil gravado, que agora é só a base. Treino manual e automático usam a mesma função (`executeTraining`).

## 9. Integração com partidas

O efetivo é aplicado só ao montar o jogador da partida. `createMatch` copia os atributos para o `engine_state` (snapshot). Trocar equipamento depois só vale na próxima partida; partidas concluídas e checkpoints não mudam. As duas telas só deixam iniciar a partida depois de carregar o equipamento (botão desabilitado enquanto carrega), então a partida nunca sai sem o bônus. Fórmulas do motor intactas.

## 10. Limites

| Pergunta | Resposta |
|---|---|
| 1. A base pode chegar a 100? | Não pelo treino nem pela vitória: o teto natural vai até 98. Saves antigos acima do teto são preservados (regra existente) |
| 2. O efetivo pode passar de 100? | Não. Limite `[0, 100]`, o mesmo que o equipar antigo aplicava ao gravar |
| 3. O motor aceita > 100? | `normalizePlayer` não limita atributos individuais (só o OVR, em 100). Como o efetivo é limitado antes, o motor nunca recebe > 100 |
| 4. Clamps diferentes entre interface e motor? | Não. Barra da interface `max=100`; efetivo limitado a 100 antes do motor |
| 5. OVR e atributos usam o mesmo limite? | Sim, 100 |
| 6. Limite por atributo ou por OVR? | Por atributo (como antes) |
| 7. Base 98 + item +10? | Efetivo 100 (aplicado +2). Igual ao modelo antigo. Base continua 98 |
| 8. Conquistas "Alcance 100" | Avaliam o **efetivo** (decisão D1, aprovada). A descrição diz "(equipamentos contam)". Limiar continua 100 |

Efeito do limite de 100: com o kit D, a vantagem cai de +8,8 para +7,2 OVR depois de 6.000 sessões, porque o kit põe +21 em controle emocional e estratégia e a base treinada fica perto do teto nesses atributos. É corte do limite, não perda de desenvolvimento (o teste separa as duas coisas).

## 11. OVR e interface

- O OVR do perfil passa a ser o **natural** (base). O Perfil mostra `Overall X (+Y equip.)` e o cartão "Natural · Z com equipamento".
- As barras de atributo mostram `base +bônus = efetivo` (ex.: `72 +5 = 77`); a barra continua na base.
- A preparação da partida (treino e torneio) mostra o OVR efetivo.
- Inventário: "Bônus total" passou a ser o que o equipamento realmente acrescenta (um item por categoria, limite 100), não a soma bruta declarada (9A-12).
- Loja, comparação de itens e Treino não mudaram (os dois primeiros mostram bônus declarado; o Treino mostra a base, que é o que ele desenvolve).

## 12. Persistência

- Novos campos: `PlayerProfile.attribute_model_version = 2` e, nos saves migrados com bônus removido, `attribute_model_migration` (o que foi subtraído).
- `applied_bonus` deixa de ser gravado (fica `null`).

## 13. Compatibilidade de saves

`CAREER_SAVE_SCHEMA_VERSION` 21 → **22**. Migração (`CareerMigration.js`, `version < 22`):

- base = gravado − `applied_bonus` de cada item equipado (ou − bônus declarado, em linhas anteriores ao hotfix 15.5.3), piso 0. É exatamente o que o jogo fazia ao desequipar. Os itens continuam equipados.
- Determinística, sem perda: o efetivo depois da migração é o mesmo de antes, exceto em linhas sem `applied_bonus` com atributo encostado em 100 (o mesmo desvio que o desequipar antigo tinha).
- O desenvolvimento que o modelo antigo já impediu não é reconstruído: não há como saber quanto o atleta teria treinado a mais. Nada é inventado.
- A leitura do save migra e grava com backup (fluxo existente). Nada é apagado.
- `importCareer` e `saveCareer` passaram a migrar um payload de versão **anterior** antes da validação estrita, o mesmo contrato da leitura. Antes recusavam qualquer save anterior (só funcionava porque fixtures e saves externos eram da versão atual; com o 22, sete testes de persistência que injetam fixtures v21 quebraram por isso). O jogo sempre grava a versão atual, então a gravação de rotina não muda nem faz cópia extra. Save de versão futura continua recusado com erro explícito.

- A mesma migração atualiza, na cópia do catálogo de conquistas guardada no save (entidade `Achievement`), só a descrição das 11 conquistas de atributo 100. Progresso e desbloqueios (`PlayerAchievement`) não mudam.

Não houve invalidação: a migração simples é confiável.

## 14. Testes

`node scripts/test-local-9b-attribute-equipment-foundation.mjs` — **71/71** (`reports/local-9b-attribute-equipment-foundation/results.json`; 400 partidas por cenário, 6.000 sessões).

| Invariante | Como | Resultado |
|---|---|---|
| I1 independência do treino | carreiras gêmeas (mesma seed, mesmas compras; só uma equipa 9 itens), 40 treinos reais + 20 avanços de dia | base idêntica (41,8 × 41,8); efetivo 41,8 × 50,6 |
| I2 ordem | treinar→equipar × equipar→treinar, caminho real; e funções puras 6.000 sessões | base, efetivo e itens idênticos |
| I3 reversibilidade | equipar → desequipar tudo, 3 estágios | base intacta; efetivo volta à base |
| I4 sem duplicação | reequipar, cópia duplicada, duas raquetes equipadas, item sem catálogo/categoria inválida | sem acúmulo |
| I5 persistência | save → load, 3 estágios | base, itens, modificadores e efetivo idênticos |
| I6 determinismo | mesmas seeds: 400 partidas × 3 fixtures; carreira gêmea repetida | idênticos |
| I7 limites | 98 + 10, piso 0, motor com 5 kits em base 98 | efetivo ≤ 100; base ≤ teto |
| I8 isolamento | troca de kit após partida concluída | partida e snapshot inalterados |

**Treino prolongado (kit D, atleta 40, potencial 80):**

| Sessões | Sem equip. | Novo: base | Novo: efetivo | Novo: vantagem | Antigo: vantagem |
|---:|---:|---:|---:|---:|---:|
| 0 | 40,0 | 40,0 | 48,8 | +8,8 | +8,8 |
| 1.000 | 60,2 | 60,2 | 68,1 | +7,9 | +2,8 |
| 6.000 | 77,9 | 77,9 | 85,1 | +7,2 | +1,0 |

**Impacto nas partidas** (400 seeds pareadas; parceiro e adversários no nível do atleta, até 90):

| Fixture | B básicos | C épico | D melhor catálogo | D2 com relíquias |
|---|---:|---:|---:|---:|
| médio 60 | +3,3 pp | +12,8 pp | +16,8 pp | +39,3 pp |
| elite 85 | +4,3 pp | +15,0 pp | +19,3 pp | +30,0 pp |
| base 98 | +1,0 pp | +7,5 pp | +4,3 pp | 0,0 pp |

Depois de 6.000 sessões (base 78): sem kit 45,3%, kit D 73,5%. No modelo antigo o kit quase não fazia diferença nesse ponto.

Na base 98 o efetivo já encosta em 100 com qualquer kit: o equipamento tem pouco efeito (limite preservado, §10).

**Carreira** (iniciante 22, intermediário 55, próximo ao teto 84): compra, equipar, treino real (ganho idêntico ao calculado sobre a base), avanço de dia, partida treino (motor recebe o efetivo), save/load, troca para o melhor kit, desequipar tudo e continuação, sem erro.

**Regressões:** ver relatório final da fase (bateria comparada com o HEAD limpo).

### LOCAL-9B-R1 — decisões do proprietário

`node scripts/test-local-9b-r1-validation.mjs` — **25/25** (`reports/local-9b-attribute-equipment-foundation/r1-validation.json`).

| Decisão | Implementação | Prova |
|---|---|---|
| D1 conquistas pelo efetivo | descrição "Alcance 100 em X (equipamentos contam)." nas 11; `attribute_key` continua derivado do texto; limiar 100 | base 95 sem equipamento não desbloqueia; equipado (efetivo 100) desbloqueia no fechamento do dia, sem abrir a tela; mais dias + save/load: 1 desbloqueio e 1 pagamento; desequipar não revoga nem paga de novo |
| D2 parceiros pelo OVR natural | sem mudança de código: `getSuggestedPartnerTerms`, `getNegotiationPreview`, `computeCompatibility` recebem o perfil gravado | resultado igual com e sem equipamento; o teste é sensível (com efetivo mudaria); nenhum arquivo de parceiro aplica equipamento |
| D3 ranking por pontos | **regressão da 9B corrigida**: o desempate por OVR em pontos iguais passou a ver o OVR natural; agora usa `tiebreakRating` (efetivo, o valor de antes). Exibição continua natural | empate de pontos: sem equipamento abaixo do rival, equipado acima (como antes); pontos inalterados; inscrição, entrada e pontos não leem OVR |
| D4 migração 21 → 22 | `loadCareer`, `saveCareer` e `importCareer` | v21 → base natural pelos 3 caminhos; v22 inalterado; 5 ciclos load→save idênticos; migração repetida não subtrai de novo; determinística; v21 original preservado em backup; versão futura recusada |

## 15. Desempenho

- `loadEquipmentModifiers`: 2,5 ms na 1ª chamada, 0,04 ms depois (saves de 37 e 64 MB).
- Treino, avanço de dia e motor: sem código novo no caminho quente.
- Migração 21→22: uma vez por save (0,4 s em 37 MB e 0,7 s em 64 MB, dominado pela cópia do save).

## 16. Riscos

- **Balanceamento:** o equipamento agora mantém o efeito a carreira toda. Kit D dá +17 a +19 pp, relíquias +30 a +39 pp (9A-04, fora do escopo). Balanceamento a revisar na fase do Mercado.
- **Reputação esportiva:** interesse de parceiros, negociação e ranking passam a ver o OVR natural; quem tinha equipamento equipado vê esses valores mais baixos que antes.
- **Saves migrados:** a perda de desenvolvimento já sofrida não volta.
- **Linhas pré-15.5.3** perto de 100: herdam o desvio do desequipar antigo.

## 17. Pendências

- Compra (`Shop.jsx buy()`) continua no componente (sem checagem de estoque/duplicado, 9A-08).
- `applied_bonus` continua no esquema da entidade, sempre `null`.
- Ferramenta `equipment-impact.mjs` da 9A replica o modelo antigo (evidência histórica, não foi alterada).

## 18. Próxima fase recomendada

1. Extrair a compra para o domínio (estoque e duplicado), como foi feito com o equipar.
2. Rebalancear relíquias e degraus de raridade com o modelo novo (o efeito agora é estável).
3. Só então o Mercado Vivo de marcas e patrocínios.
