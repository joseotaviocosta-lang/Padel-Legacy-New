# Fase 5.32-C.1 — Idade e informações essenciais na escolha de parceiros

Branch `integracao/cloud-6o` · HEAD `7f9d8fd` · sem commit (aguardando validação). A 5.32-C segue intacta e sem commit.

## Causa

- **Tela real do início de carreira:** `/partners?view=offers` → `PartnerHub` → `PartnerOffersPanel` ("Escolha sua dupla · N propostas"), cartão `OfferCard`. Verificado no fluxo real (carreira criada pela UI em perfil temporário).
- **Regressão introduzida no commit `68cb1f9`** (5.31, "redesign partner and staff management screens", 16/10), não na 5.32-C: o card antigo exibia `país · N anos · OVR · nível`; o redesign reescreveu o card para `OVR · lado · estilo` / `Interesse · dias · %` e **removeu país e idade**. A análise (modal) e a comparação também não tinham idade.
- **O dado nunca sumiu**: `candidate_snapshot` (o registro do atleta gravado na proposta) traz `age` e, quando existe, `birth_date`. Era só a interface.
- Sem relação com CSS, cálculo ou `ensureAthleteProfiles`/`generateRelationships` (o fluxo de propostas não passa pelo diretório).

## Correção (mínima)

| Arquivo | Mudança |
|---|---|
| `src/lib/candidateDisplay.js` (novo) | `candidateAgeAt(candidate, careerDate)`: com `birth_date` → `ageAtDate` (a regra de idade do jogo, `lib/padel.js`) na **data da carreira**; sem ela → idade gravada; sem nada → `null` (não exibe; `ageAtDate` cairia em 16). `candidateIdentityLine` = país · idade · lado. |
| `src/components/partner/PartnerOffersPanel.jsx` | card: linha 1 **país · N anos · lado**, linha 2 **OVR · estilo · Interesse**, linha 3 dias · %; análise ganha **Idade** e **País**; comparação ganha a linha **Idade**. Ordem, recomendação, elegibilidade e textos de interesse/termos preservados. |
| `src/components/career/PartnerSelection.jsx` | linha país · idade · lado nos candidatos (o seletor da Home/Torneios nunca mostrou idade). |
| `scripts/test-partner-choice-age-v532c1.mjs` (novo) | 49 verificações (regra + render + navegador). |

Exemplo real (390px): "Tomás Acosta · Argentina · **18 anos** · Versátil / OVR 34 · Defensivo · Interesse baixo / 30 dias · você 58%".

## Telas de parceria auditadas

| Tela | Componente | Idade antes | Ação |
|---|---|---|---|
| Escolha da 1ª dupla / propostas recebidas | `PartnerOffersPanel` | **não** (removida em 68cb1f9) | corrigido (card, análise, comparação) |
| Seletor "Escolher parceiro" (Home/Torneios) | `PartnerSelection` | não (nunca teve) | linha país · idade · lado. Na carreira nova criada pela UI o jogador ainda não tem lado de quadra e a lista vem vazia por regra existente (`getAvailablePartners`) — no início de carreira a escolha real é a de propostas |
| Busca de parceiro | `PartnerSearch` | sim (`AthleteProfile.age`) | sem mudança |
| Dupla atual / contrato | `PartnerOverview` | sim | sem mudança |
| Mercado mundial | `WorldMarket` | sim | sem mudança |
| Negociação / caixa de entrada / conselheiro | `PartnerNegotiationModal`, `InboxPanel`, `AdvisorPanel` | não listam candidatos para comparar | sem mudança |

## Testes

- `test-partner-choice-age-v532c1`: **49 PASS** — regra (data da carreira, jovem 16/18, veterano 37/38, sem dado → nada), render das propostas (país, idade, lado, OVR; ordem/recomendação), PartnerSelection (regra), e no navegador real: 6 larguras (360/390/768/1366/1600/paisagem) com idade visível sem truncar em **todo** candidato, idade = registro na data da carreira (idades 18/21/21/31), 0 overflow, comparação e análise com idade, **aceitar a proposta registra a dupla escolhida** (Partnership ativa com o mesmo atleta) e a Home mostra a nova dupla, 0 erro de JS. Falha se a idade sumir de qualquer card.
- Regressão direcionada (45 testes: parcerias, onboarding/criação de carreira, 1ª dupla, Home, Ranking/Mundo/Atletas 5.32): todos passam exceto 3 **preexistentes** — `test-home-redesign` e `test-phase15-5-4-critical-mobile-qa` (mesma mensagem registrada como preexistente na 5.32-C) e `test-phase15-3-economy-progression-navigation` (4/66 gates, **idêntico com os dois arquivos de parceria na versão do HEAD**).
- Uma falha nova encontrada e corrigida no caminho: `test-partner-market-cards-v531` exige "Interesse" (o card tinha passado a "interesse") — restaurado; 17/17.
- Gates: lint ✓ · build ✓ · validate:architecture ✓ · `git diff --check` ✓.

## Evidências

`partner-choice/before/` e `partner-choice/after/` (fluxo real, 6 larguras; PNGs ignorados pelo Git, `measurements.json` versionável), `partner-choice/compare/` (390, 360, 768, 1366, paisagem), `partner-choice.log`.

## Limitações / observações

- Na carreira nova as propostas mudaram entre a 1ª e a 2ª visita a `/partners` (Thiago Martins/Oliveira → Tomás Acosta/Lucas Silva aparecem juntos como 4 pendentes). Comportamento de geração de propostas, fora do escopo; não alterado.
- O detalhe da proposta mostra "Ranking" pelo `ranking_position` gravado (autoridade divergente, ver 5.32-C §3) — fora do escopo deste hotfix, não alterado.
- Pendência funcional LOCAL-8C (escritas na montagem do diretório) não tem relação com este fluxo.
