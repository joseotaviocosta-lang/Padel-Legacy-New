# CLOUD-6M — Mobile Performance & UX Stability (Targeted Hardening)

Branch `cloud/phase-6m-mobile-ux-hardening` (origem `cloud/phase-6l-silver-calibration-flag`, `58466e3`). Sem push, PR, merge ou rebase. Flag Silver, balanceamento, schema, saves, dependências e versão: intocados.

## Limitação de ambiente
Linux/Node, sem WebView e **sem Android físico**. Nenhum número de FPS/tempo real de Android foi medido nem é afirmado. A evidência abaixo é estrutural (leitura de código + contagem de instâncias montadas).

## 1. Problemas investigados
| # | Área | Resultado |
|---|---|---|
| 1 | Shell global (`AppLayout`): header mobile + barra desktop | **Comprovado** — ambos montados sempre; alternados só por CSS (`md:hidden` / `hidden md:flex`). **Corrigido.** |
| 2 | `CareerHeaderContext` recarrega `Tournament.list('-start_date', 2000)` a cada troca de rota | Real (intencional da 5.30-B); o custo era dobrado pelo item 1. Reduzido à metade pelo item 1; sem outra mudança. |
| 3 | `CalendarPage`: `Tournament.list(…, 2000)` + `getEventsForRange` 2026–2027 a cada abertura | Carga grande, mas por decisão documentada (hotfix de calendário). **Não alterado** — exige medição em aparelho. |
| 4 | Listeners/efeitos (Bell, HeaderContext, Calendar, AppLayout) | Todos com cleanup e debounce; sem vazamento encontrado. |
| 5 | Modais (inscrição em torneio, TournamentModal) | Usam `ModalShell`/`useOverlayBehavior` (scroll-lock, Back, safe-area). Sem defeito concreto. |
| 6 | Teclado virtual / bottom nav | `useKeyboardInset` já esconde a nav. Sem defeito concreto. |
| 7 | Avanço de calendário / simulação | Já tratado na CLOUD-5 (1 gravação/dia). Não reauditado. |

Apenas **1** problema com evidência concreta; os demais não atingem o critério de "comprovado" — ficam como diagnóstico.

## 2. Correção (Problema 1)
**Causa:** `AppLayout` renderizava `<header … md:hidden>` e `<div class="app-desktop-bar … hidden md:flex">` simultaneamente. No celular a barra desktop ficava `display:none` mas seguia montada, com seus próprios `CommunicationBell`, `CareerHeaderContext`, `HeaderRankShortcuts`, `CareerDayControl` e `CareerHud`.

**Evidência anterior (contagem de instâncias montadas, qualquer largura):**
- `CommunicationBell`: 2 (cada uma com 8 consultas + `ensureContextualCareerCommunications` por evento `profile-updated` / `communications-refresh` / `focus`; as duas reconciliações rodam concorrentes).
- `CareerHeaderContext`: 2 (cada uma com `Tournament.list(…, 2000)` + `CalendarEvent.filter` a cada troca de rota e `focus`).
- `HeaderRankShortcuts`, `CareerDayControl` (subscrição de avanço), `CareerHud`: 2/2/1 inertes.

**Alteração (mínima):** `src/components/AppLayout.jsx` — `isCompactShell = performanceProfile.compactViewport` (hook existente, `matchMedia('(max-width: 767px)')`, reativo, valor inicial síncrono, mesmo corte do `md:`). Header mobile monta só se compacto; barra desktop só se não compacto. Classes CSS mantidas.

**Resultado posterior (contagem):** `CommunicationBell` 1, `CareerHeaderContext` 1, etc. — **−50 %** de consultas do cabeçalho por navegação/evento, e sem reconciliação de comunicações duplicada. Em ≥768px o comportamento é idêntico ao anterior (uma barra).
Não medido: ganho em ms no aparelho.

## 3. Arquivos alterados
- `src/components/AppLayout.jsx`
- `scripts/test-cloud-6m-shell-single-mount.mjs` (novo) + script `test:cloud-6m-shell` em `package.json`
- este relatório

## 4. Testes
PASS: `test-cloud-6m-shell-single-mount`, `mobile-m2-shell`, `mobile-foundation`, `mobile-header-two-rows-v524`, `mobile-header-height-v524b`, `mobile-m2-1-device-hotfix`, `mobile-performance-m3-4`, `global-header-overlay-rc`, `header-calendar-shortcut`, `mobile-utility-access-v524b`, `ui-redesign`.
ESLint (arquivos alterados): limpo. `vite build`: OK.

FAIL **pré-existentes** (idênticos na base `58466e3`, confirmado com `git stash`), não relacionados:
- `test-desktop-no-duplicate-quick-actions-v524c` — exige evidência de screenshots não gerada.
- `test-mobile-performance-m3-5` — gate "Comparador de CareerHud restrito a energy/fatigue/coins/rank".

## 5. Riscos remanescentes
- Rotação (retrato↔paisagem 844×390 cruza 768px): header é remontado e recarrega dados uma vez; aceitável, validar no aparelho.
- Testes de shell são estáticos (sem DOM); montagem real só é verificável em WebView.
- Itens 2 e 3 permanecem como custo de dados potencial.

## 6. Validar no Android físico
1. Navegar entre 5–6 rotas e comparar fluidez antes/depois (`MobilePerformanceMonitor`, ação `navigate-route`).
2. Sino: avançar dia e confirmar que a notificação aparece uma vez, sem duplicata.
3. Chip de próximo torneio no header atualiza ao inscrever/cancelar.
4. Girar o aparelho e conferir header/barra.
5. Medir abertura do Calendário com carreira longa (item 3).

## 7. Próximo teste local
Build release no aparelho, sessão longa (30+ dias avançados) e comparação com o APK da CLOUD-6L; coletar `navigate-route` e contagem de renders (`useRenderCounter`).
