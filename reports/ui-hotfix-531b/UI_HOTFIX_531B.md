# Hotfix 5.31-B — contenção mobile de abas/filtros + prioridade do nome no card de técnico

**Base:** `68cb1f9` (APK 9006). **Sem commit, push ou tag.**

**Validação:** app desktop real (Tauri/WebView2 + puppeteer), em 360×780, 390×844, 1280×800 e paisagem 780×360.
- **Com parceiro** ("Smoke 527K"), antes e depois.
- **Sem parceiro** ("Smoke 530B2"), depois.
- **Caso exato do Redmi 12** ("Caio Silva" + RECOMENDADO + MELHOR CUSTO-BENEFÍCIO + OVR 44): reproduzido com o **CSS real do app**, montando o card do APK 9006 (cópia temporária do HEAD, apagada ao fim) e o corrigido, lado a lado (`coach-card-repro.json`, `compare/coach-card-repro-*.png`).

**Princípio:** MOBILE CONTAINMENT FIRST · PRIMARY IDENTITY BEFORE DECORATIVE BADGES.

## Veredito: **A**

Os dois problemas do Android físico foram reproduzidos e corrigidos com mudança só de apresentação (5 arquivos, +51/−20).
- 0 overflow, 0 erro de JS, 0 regressão.
- 5 testes novos (63 gates).
- lint, build e diff-check verdes.

## O que foi medido (`before/` e `after/measurements.json`)

| Item (360/390) | Antes (9006) | Depois |
|---|---|---|
| Filtros da Caixa de entrada | chips espremidos e sobrepostos ("Toda", "Não lida", "Treinad…") | rolam; cada chip inteiro; último alcançável com folga de 20 px; ativo visível |
| Barra Treinador \| Comissão | de **0 a 360/390 px** (borda a borda) | dentro do respiro da página |
| Lado / Ordenar | "Ordenar: Compatibilid…" cortado, borda colada na margem de 8 px | legendas fixas + valor; dentro do contêiner |
| Nome "Caio Silva" com 2 selos | **0 px em 360 / 24 px em 390** (nome sumia / "C…") | **198 px / 229 px**, inteiro |
| Nome longo com 2 selos | truncado | inteiro (até 2 linhas) |
| Selo sobre OVR / selo cortado | — | 0 / 0 |
| Altura do card com 2 selos | 185 px | 225 px em 360 (+40 px, 1 linha de selos); +18 px em 390 |
| Overflow horizontal / fora da tela / erros de JS | 0 / 0 / 0 | **0 / 0 / 0** |

O único "botão cortado" que o medidor aponta em todas as telas, antes e depois, é a bolha "17" de notificações no header (preexistente, fora do escopo).

## Respostas (24)

1. **Grupos com problema:**
   - **filtros da Caixa de entrada** (Todas … Treinador): espremidos e sobrepostos;
   - **barra de abas dos hubs** (Treinador \| Comissão, e qualquer outro hub): de borda a borda no celular;
   - **select "Ordenar"**: valor longo encostando na margem.

   As abas principais (Visão geral / Mercado / Contrato / Histórico) e as sub-abas (Recebidas / Buscar / Caixa de entrada) já estavam dentro da margem e cabendo. Foram auditadas e ficaram como estavam.
2. **Causas:**
   - **Inbox:** os chips eram itens flex **encolhíveis** (sem `shrink-0`). Com `whitespace-nowrap`, o navegador os comprimia abaixo da largura do texto em vez de rolar a faixa, e o texto vazava sobre o chip vizinho.
   - **Hubs:** o `ConsolidatedHub` renderiza a barra **fora** do `<Page>`; o respiro lateral só existe dentro do painel.
   - **Ordenar:** o rótulo "Ordenar:" fazia parte do valor e a opção ficava mais larga que a coluna de 168 px.
3. **Viraram rolagem horizontal?** A faixa da inbox, **sim**: rolagem real (`overflow-x-auto`, overscroll contido, sem barra visível). As abas já rolam quando precisam (componente `Tabs`); hoje cabem.
4. **Ajuste de padding?** **Sim.**
   - Espaçador no fim da faixa da inbox, para o último chip entrar inteiro (folga medida de 20 px).
   - A barra dos hubs ganhou o mesmo respiro e largura máxima do `Page` (`--space-page-x`, `--space-page-y`, `max-w-[92rem]`).
5. **Aba ativa visível?** **Sim**: em todas as larguras e grupos medidos. Na inbox, tocar no último filtro (Treinador) o ativa e o mantém inteiro na vista (clique real). O chip tocado é trazido para a vista com `scrollIntoView({ inline: 'nearest' })`, sem sistema novo.
6. **Lado/Ordenar lado a lado?** **Sim**, em 360, 390, paisagem e desktop.
7. **Empilham em algum breakpoint?** **Não** foi preciso: em 360 cada coluna tem ~168 px e o valor mais longo ("Compatibilidade" / "Todos os lados") cabe inteiro com a legenda acima.
8. **Causa do nome cortado:** nome, "Recomendado", "Melhor custo-benefício" e OVR dividiam **a mesma linha**; os selos e o OVR não encolhem (`shrink-0`), então o nome era o único que cedia. Com os dois selos o nome chegava a **0 px** em 360.
9. **Nova hierarquia do card:**
   1. linha 1: **nome** (todo o espaço livre) + **OVR** à direita (largura fixa);
   2. linha 2: **selos** (quebram entre si);
   3. linha 3: especialidade · nível · cidade.

   O resto do card (efeito principal, custo, disponibilidade, ação) não mudou.
10. **Nome tem prioridade?** **Sim**: o nome nunca divide a linha com selos. Usa `min-w-0 flex-1`, quebra em até 2 linhas e só trunca como último recurso (nomes realmente enormes).
11. **OVR mantém espaço?** **Sim**: `w-10 shrink-0` (40 px), a mesma largura com e sem selos, sem sobreposição.
12. **Selos quebram para outra linha?** **Sim**: grupo com `flex-wrap`. Em 360, com os dois selos, cada um ocupa uma linha; em 390, ficam lado a lado.
13. **Algum selo removido?** **Não.** "Recomendado" continua antes de "Melhor custo-benefício" (prioridade); sem selo, nenhuma linha vazia é reservada.
14. **Outros cards precisaram do fix?**
    - **Sim, o card de proposta de parceiro** (nome + selo "Recomendado"/"Proposta" na mesma linha): agora o selo desce antes de o nome truncar.
    - Cards da comissão, do mercado de staff e da busca de parceiros não têm selo competindo com o nome (só um ícone pequeno). Varridos, sem mudança.
15. **360:** passou.
16. **390:** passou.
17. **desktop:** passou.
18. **paisagem:** passou.
19. **Overflow: 0** (todas as telas, larguras e estados medidos).
20. **Erros de JS: 0.**
21. **Testes novos passaram?** **Sim, 5/5 (63 gates):**
    - `test-partner-tabs-mobile-containment-v531b` (12);
    - `test-partner-inbox-filters-scroll-v531b` (13);
    - `test-partner-market-selects-v531b` (11);
    - `test-coach-card-name-priority-v531b` (15);
    - `test-coach-card-badges-wrap-v531b` (12);
    - kit: `scripts/lib/v531bKit.mjs`.
22. **Regressão?** **Não.** Seleção de 51 testes (os que leem `ConsolidatedHub`, `Tabs`, `InboxPanel`, `PartnerSearch`, `PartnerOffersPanel`, `CoachCard`, `TeamHub`, `PartnerHub`, `Coaches`, `StaffPanel`, mais os 10 da 5.31; sem simulações longas):
    - 39 passam;
    - 0 regressão;
    - 12 preexistentes, iguais no `68cb1f9` (`tests.json`).
23. **lint ✓ · build ✓ · `git diff --check` ✓.**
24. **VEREDITO FINAL: HOTFIX 5.31-B = A.**

## Arquivos (só apresentação, nenhuma lógica)

| Arquivo | Mudança |
|---|---|
| `src/components/navigation/ConsolidatedHub.jsx` | barra de abas dos hubs com o respiro e a largura do `Page` |
| `src/components/partner/InboxPanel.jsx` | chips `shrink-0`, faixa rolável com folga no fim, chip tocado trazido à vista, `aria-pressed` |
| `src/components/partner/PartnerSearch.jsx` | Lado / Ordenar com legenda fixa; o select mostra só o valor |
| `src/components/coaches/CoachCard.jsx` | nome + OVR (linha 1), selos que quebram (linha 2) |
| `src/components/partner/PartnerOffersPanel.jsx` | selo do card de proposta quebra antes de o nome truncar |

Mesmos filtros, valores, estados, selos e ações; nenhuma regra de parceria, mercado, técnico ou staff tocada.

## Avisos (não bloqueiam)

- Card de técnico com os dois selos fica +40 px em 360 (uma linha de selos), dentro do aceitável.
- A rolagem horizontal da inbox é necessária em 360/390 (6 filtros); ela é limpa e o último entra inteiro.
- A bolha "17" de notificações aparece no medidor de botões cortados (header, preexistente).
- No caso "Caio Silva", a evidência "antes" usa a cópia do card do HEAD `68cb1f9` montada com o CSS real; nenhuma carreira de teste tinha esse técnico com os dois selos.

## Evidências

- `before/`, `after/`: `<tela>-<estado>-<largura>.png` + `measurements.json`.
- `compare/`: 10 pares antes | depois + `coach-card-repro-360/390.png`.
- `coach-card-repro.json`.
- `tests.json`.
- `tools/` (`audit.mjs`, `coach-card-repro.mjs`, `compare.mjs`, `run-tests.mjs`, `tests.txt`).
