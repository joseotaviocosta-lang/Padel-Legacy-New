# Validação rápida de release — Playthrough 5.27-K

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push.

**Veredito: RELEASE CANDIDATE READY — SIM.**

- **Bloqueadores de release:** nenhum.
- **Partida, save e reload:** funcionam no app desktop e no APK Android gerado
  nesta fase.
- **Equilíbrio:** está dentro das faixas de release.
- **Lifecycle, motor, ranking e torneio:** íntegros.
- **Bug corrigido:** o smoke Android achou um bug de UX que fazia o jogo parecer
  travado (Torneios com estado antigo). Foi corrigido com uma mudança pequena
  na tela e verificado nas duas plataformas.

Esta fase **não buscou precisão estatística**: 3 carreiras Normal só para
detectar desequilíbrio grosseiro.

## 1. Estado congelado (`frozen-config.json`)

Congelado antes de rodar:
- Balanced-E, Silver 15%, lifecycle 5.27-J;
- Normal v3, Otimizador v4;
- motor e ranking da 5.27-F, táticas neutras da 5.27-G, adaptação da IA OFF;
- economia, moedas iniciais e atributos iniciais.

Blocos de balanceamento idênticos aos da 5.27-J. Nenhum tuning nesta fase.

## 2. Carreiras Normal (`normal-fast-runs.json`)

Seeds novas 6, 7, 8; Balanced-E; 2 anos.

| | s6 | s7 | s8 | **Agregado** | Faixa de release |
|---|---|---|---|---|---|
| Easy | 40,4 | 51,0 | 64,5 | **53,1** (160) | 45–75 ✓ |
| Medium | 47,1 | 42,2 | 25,8 | **40,2** (127) | 30–60 ✓ |
| Hard | 41,2 | 35,3 | 22,2 | **32,7** (52) | 15–50 ✓ |
| R1 | 33,8 | 45,3 | 43,8 | **40,8** (196) | ≥ 40 ✓ |
| Bronze / Silver / Gold / Platinum (main) | 32 / 50 / 46,7 / 47,2 | 46,2 / 56 / 30,8 / 46,9 | 62,5 / 68,2 / 23,1 / 27,8 | **49,5 / 58,0 / 34,1 / 43,0** | |
| Rank 6m / 1a / 2a | 728 / 280 / 18 | 633 / 257 / 16 | 616 / 209 / 71 | **633 / 257 / 18** | ⚑ 2a rápido |
| 1º top100 (dia) | 623 | 581 | 630 | ~ fim do 2º ano | |
| Top10 / #1 | não | não | não | não | ✓ |
| Títulos Y1 / Y2 acum. | 2 / 3 | 2 / 2 | 5 / 5 | **2 / 3** | ✓ |
| Parceiro OVR 6m / 1a / 2a | 34 / 82 / 82 | 34 / 79 / 80 | 34 / 79 / 79 | | |
| OVR da dupla (mediana) | 73,5 | 73,5 | 45 | | |
| Energia na partida (mediana) | 100 | 100 | 100 | | |
| Sponsor Y1 / Prize Y1 | 48,2 / 15,8 | 42,8 / 18,3 | 37,9 / 19,8 | **42,8 / 18,3** | ≤ 60 / ≥ 10 ✓ |
| Caixa 6m / 1a / 2a | 8.004 / 6.738 / 7.592 | 8.012 / 781 / 5.108 | 12.123 / 10.564 / 13.942 | | |
| Eventos de dívida | 0 | 0 | 0 | **0** | ✓ |
| Custo de staff/técnico (% da despesa) | 17,2 | 23,1 | 18,9 | | |
| Saídas de parceria / limbo (dias) | 1 / 27 | 3 / 27, 31, 10 | 3 / 27, 22, 22 | | |
| Extensão ilegítima | 0 | 0 | 0 | **0** | ✓ |
| Erros / falhas de avanço / soft-lock | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | | ✓ |

**Parei em 3 seeds.** Não há outlier grotesco:
- a variação por seed é a esperada nesse tamanho de amostra;
- o Hard está longe do limite (32,7);
- títulos e ranking variam pouco.

O Hard de 54,7 do smoke da 5.27-J não se repetiu: era ruído de 5 carreiras. A
5.27-J tinha as mesmas seeds da 5.27-I; estas são novas.

## 3. Smokes de perfil

- **Casual** (1 ano, `casual-smoke.json`):
  - 19 inscrições, 27 partidas;
  - parceiro 27, caixa 10.908 em 6m e 5.596 em 1a;
  - 0 dívida, 0 soft-lock, 0 erro.
  - **Sem bloqueador.**
- **Otimizador v4** (1 ano, `optimizer-smoke.json`):
  - parceiros 22 → **82 no dia 211** → 91 no dia 270;
  - maior trecho com gap > 30: **0 dias**.
  - **Passa.**

## 4. Regressões críticas (`critical-regressions.json`) — 20/20 em 21,5 min

| Grupo | Testes |
|---|---|
| Lifecycle | saída pendente, nenhum compromisso novo que estenda, compromisso anterior preservado, expiração com compromisso (5.17), save/reload com separação pendente |
| Motor | paridade de times idênticos, sensibilidade à energia, aplicação única |
| Ranking | pontos de derrota cedo Gold+, soma do TeamRanking, reset da Race |
| Torneio | prazo de inscrição (D-4), BYE visível desde o sorteio (D-3), Masters 24 com 8 BYEs, settlement pelo roster persistido, autoridade do resultado |
| Parceria | Normal v3, Otimizador v4, proteção contra re-sign |
| Persistência | atomicidade de recompensa |

Depois da correção em Torneios também passaram:
- `test-tournament-registration-v2`, `test-tournament-flow-rc`,
  `test-draw-ui-independent-persistence`, `test-bracket-cta-availability-v516`.

`test-core-gameplay-ui` (auditoria estática) falha em Treinos, Calendário e
Partidas, em arquivos que esta fase não tocou (`Matches.jsx` modificado em
12/09). É preexistente, não relacionado.

## 5. Smoke web e Android

- **Web** (`web-smoke.md`): o jogo exige Tauri (no Chrome puro não cria
  carreira). O smoke foi feito no **app desktop real** (`npm run app:dev`,
  WebView2 dirigido por puppeteer).
  - Fluxo coberto: criar carreira → 6 telas → formar dupla → inscrever →
    avançar → sorteio → jogar → liquidar → reload.
  - **Resultado:** verde, 0 erro de JS.
- **Android** (`android-smoke.md`): **APK gerado nesta fase** (debug, x86_64),
  emulador API 37, toques reais.
  - Fluxo coberto: abrir → criar → navegar → dupla → inscrever → avançar →
    sorteio → jogar → reinstalar → **force-stop/reabrir** → avançar.
  - **Resultado:** verde, **0 crash, 0 ANR**.
  - Tempos de debug + GPU por software: não é medida de desempenho.

## 6. Bugs achados nos smokes

| Bug | Gravidade | Ação |
|---|---|---|
| **Torneios com estado antigo**: avançando dias sem sair de Torneios, no dia do torneio "Ir para o torneio" abria os detalhes antigos ("Aguardando sorteio"), parecendo travado | alta para playtest (parece soft-lock; sai e volta resolve) | **Corrigido** em `src/pages/Tournaments.jsx`: recarrega lista, inscrições e campanhas quando a data muda. Verificado no desktop (17 dias sem sair da página) e no APK novo |
| Card "**Não participante**" num torneio disputado (inscrição vira `completed`) | cosmético | **Corrigido** no mesmo arquivo (o card usa a inscrição de qualquer status; mostra "CONCLUÍDO") |
| `console.error('[CareerDayAdvance]')` a cada "Avançar" num dia bloqueado: o bloqueio é exceção de propósito e o `catch` trata como falha (log, diagnóstico beta, rollback inócuo) | ruído | registrado, não corrigido |
| Chip **DUPLA** do cabeçalho leva ao ranking de duplas | UX | pergunta no checklist |

## 7. Pacote de playtest

- `PLAYTEST_CHECKLIST.md`: perguntas simples em 8 blocos, mais "onde estamos de
  olho" (ranking rápido, títulos, chip DUPLA).
- `PLAYTEST_FEEDBACK_TEMPLATE.md`: aparelho, plataforma, dias, rank, OVR,
  parceiro, dinheiro, reclamação, ponto positivo, gravidade do bug, print/vídeo.
- **Build RC:** o APK desta fase é **debug x86_64 (emulador)**. Para os testers
  falta gerar o **release ARM assinado**: `npm run android:build`, keystore já
  configurado em `src-tauri/gen/android/keystore.properties`. Marcar como
  **TEST/RC**, não versão final. Não gerei o release sem pedido explícito, por
  causa da assinatura.

## 8. Respostas (40)

1. Carreiras Normal rodadas: **3** (seeds 6, 7, 8).
2. Foram necessárias 5? **Não.**
3. Easy por seed: **40,4 · 51,0 · 64,5**.
4. Easy agregado: **53,1%**.
5. Medium por seed: **47,1 · 42,2 · 25,8**.
6. Medium agregado: **40,2%**.
7. Hard por seed: **41,2 · 35,3 · 22,2**.
8. Hard agregado: **32,7%** (52 partidas).
9. R1 por seed: **33,8 · 45,3 · 43,8**.
10. R1 agregado: **40,8%**.
11. Bronze: **49,5%**.
12. Silver: **58,0%** (⚑ acima do Bronze no agregado, com seed 6 Bronze 32 / n pequeno).
13. Gold: **34,1%**.
14. Platinum: **43,0%**.
15. Rank @6m: **633** (mediana; 616–728).
16. Rank @1a: **257** (209–280).
17. Rank @2a: **18** (16–71) ⚑ rápido.
18. Top100 apareceu quando: dias **581–630** (fim do 2º ano).
19. Top10 apareceu? **Não.**
20. #1 apareceu? **Não.**
21. Títulos Y1: mediana **2** (2–5).
22. Títulos Y2 acumulado: mediana **3** (2–5).
23. Sponsor share Y1: **42,8%**.
24. Prize share Y1: **18,3%**.
25. Dívida Normal: **0** eventos.
26. Smoke Casual passou? **Sim.**
27. Smoke Otimizador passou? **Sim** (82 no dia 211; gap > 30 por 0 dias).
28. Lifecycle de parceria passou? **Sim.**
29. Houve extensão ilegítima? **Não** (0).
30. Paridade do motor passou? **Sim.**
31. Regressões de ranking passaram? **Sim.**
32. Lifecycle de torneio passou? **Sim** (D-4, D-3, BYEs, settlement).
33. Save/reload passou? **Sim** (testes + desktop + Android force-stop).
34. Smoke web passou? **Sim** (app desktop Tauri).
35. Smoke Android passou? **Sim** (APK novo, emulador, 0 crash/ANR).
36. Algum bloqueador de release? **Não** (o estado antigo de Torneios foi corrigido).
37. Avisos leves que ficam:
    - ranking do 2º ano rápido (#18);
    - Silver um pouco mais fácil que Bronze no agregado de 3 seeds;
    - variação de Medium entre seeds (25,8–47,1);
    - ruído de `console.error` no avanço bloqueado;
    - chip DUPLA.
38. Checklist de playtest criado? **Sim** (+ template de feedback).
39. Regressões críticas **20/20** · testes de torneio pós-correção **4/4** ·
    lint ✓ · build ✓ · diff-check ✓ · commit ✗ · push ✗.
40. **VEREDITO: RELEASE CANDIDATE READY — SIM** (falta só gerar o APK
    release assinado para os testers).

## Observações

- **Carreiras de teste nos saves locais (apagar pela tela Carreiras):**
  - "Smoke 527K — pode apagar", no app desktop;
  - "Smoke Android 527K", no emulador.
- **Código alterado nesta fase:** só `src/pages/Tournaments.jsx`. Mais os
  scripts de análise e smoke (`scripts/analyze-release-527k.mjs`,
  `scripts/run-critical-regressions-527k.mjs`,
  `reports/release-validation-527k/web/*.mjs`).
