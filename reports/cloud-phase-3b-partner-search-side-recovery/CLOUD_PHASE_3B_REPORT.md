# CLOUD-3B — Partner Search: Undefined Court Side Recovery

Branch: `cloud/phase-3b-partner-search-side-recovery` (origem: `cloud/phase-3a-deterministic-market-test` @ `c604ee2`)

## 1. Causa confirmada
Carreira nova tem `court_side` indefinido (`null`/ausente; `ensureMyProfile` grava `court_side: null`). Três funções em `src/lib/career.js` tinham o guard
`if (!profile?.court_side) return [];` — `getAvailablePartners`, `getLockedPartners` e `getRealPartnerCandidates` (guard introduzido na Fase 9.4/anterior).
A busca manual (`PartnerSearch.jsx`) depende das três, então a lista de candidatos **e** a seção "Ainda fora de alcance" ficavam vazias.
Não é filtro de compatibilidade: `computeCompatibility`/`calculatePartnershipInterest` já tratam lado indefinido como `flex` sem erro.
O filtro "Lado" da tela filtra o lado *preferido do candidato*, não o do jogador.

Reprodução: `scripts/test-partner-search-undefined-side-3b.mjs` falha no código anterior
(`busca manual deve listar candidatos sem lado`) e passa após a correção.

## 2. Arquivos modificados
- `src/lib/career.js` — as 3 funções ganham 2º parâmetro opcional `{ allowUndefinedSide = false }`; padrão idêntico ao anterior.
- `src/components/partner/PartnerSearch.jsx` — passa `allowUndefinedSide: true` (constante `SEARCH_OPTIONS`); aviso quando não há lado; botão "Convidar" só com lado definido.
- `scripts/test-partner-search-undefined-side-3b.mjs` (novo) e script `test:partner-search-side-3b` em `package.json`.
- Este relatório.

## 3. Antes e depois
| Cenário | Antes | Depois |
|---|---|---|
| Sem lado, busca manual | lista vazia | candidatos elegíveis + "fora de alcance"; aviso pedindo escolher direita/esquerda; "Convidar" oculto |
| Lado direita/esquerda | candidatos normais | idêntico (resultado igual com e sem a opção) |
| Ofertas automáticas / onboarding (`PartnerHub` ofertas, `PartnerSelection`, mercado) | `[]` sem lado | inalterado (`[]` sem lado; opção é opt-in) |
| Sem candidatos elegíveis de verdade | vazio | vazio (portões de nível e interesse intactos) |

Nenhum lado é atribuído ao jogador. Convidar continua exigindo lado (regra anterior de fato); agora com orientação visível.

## 4. Testes executados (apenas relacionados)
Todos PASS: `test-partner-search-undefined-side-3b` (novo: sem lado [undefined/null/''], direita/esquerda/right/left, paridade de pool, aposentados/bloqueados, regras de convite/ofertas), `test-partner-day1-gate`,
`test-career-opportunity-progression` (ainda afirma que o padrão sem lado é vazio), `test-partner-market-ui-contract-v518`, `test-player-partner-offer-flow-v518`, `test-partner-offers-v2`, `test-partner-market-cards-v531`.
ESLint direcionado nos 3 arquivos alterados/novos: OK. Build e suíte completa não executados (mudança de UI mínima, sem necessidade).
Limite: `getRealPartnerCandidates` com a opção só tem a regressão de padrão coberta; o caminho assíncrono de reais depende de `AthleteProfile` e não foi exercitado com dados.
`npm ci --ignore-scripts` foi necessário para rodar os testes (node_modules ignorado pelo Git).

## 5. Riscos de regressão
Baixos: parâmetro opt-in, padrão preservado; único chamador com a opção é `PartnerSearch`. Risco residual: quem chamar os helpers com a opção no futuro verá candidatos sem lado.
Se `handleInvite` for chamado por outra via sem lado, comportamento permanece o anterior (não alterado).

## 6. Compatibilidade com saves
Sem mudança de schema, sem migração, nenhum dado persistido é lido de nova forma ou alterado. Versão do app inalterada.

## 7. Validação manual pendente (Windows e Android)
- Carreira nova sem lado: aba Mercado → Buscar mostra candidatos, aviso âmbar legível, sem botão Convidar.
- Escolher lado na missão → aviso some, "Convidar" aparece.
- Carreira com lado definido: lista igual à anterior; filtros/ordenação funcionando.
- Layout do aviso no Android (Redmi 12, 360px).

## 8. Commit e Git
Commit específico CLOUD-3B na branch `cloud/phase-3b-partner-search-side-recovery`; worktree limpo; sem push/merge/PR.
