# Smoke Android — 5.27-K

## Ambiente

| | |
|---|---|
| APK | **gerado nesta fase com o código atual**: `npx tauri android build --debug --target x86_64 --apk` (`app-universal-debug.apk`; Rust em cache, ~minutos) |
| Aparelho | emulador `Medium_Phone_API_37.0` (Android API 37, x86_64), headless, GPU por software (`swiftshader_indirect`), 2 GB |
| Automação | WebView do APK debug via `adb forward … webview_devtools_remote_<pid>` + `puppeteer-core`, com **toques reais** (`touchscreen.tap`) |

**Ressalva de desempenho:** é build **debug** num emulador com GPU por
**software**. Os tempos abaixo não representam o APK release num aparelho real
(o desempenho mobile do release foi tratado nas fases M3/M4). Esta fase não é
de performance.

## Roteiro e resultado

| Passo | Resultado |
|---|---|
| Instalar e abrir | ✓ app abre (`com.padellegacy.game`), sem FATAL |
| Criar carreira "Smoke Android 527K" | ✓ |
| Navegar (barra inferior: Início, Carreira, Competir → Torneios/Ranking) | ✓ telas carregam (Torneios ~17 s no debug/emulador) |
| Formar dupla (Carreira → Minha dupla → Analisar → Aceitar) | ✓ "Dupla ativa" |
| Inscrição (Torneios → Inscrever → CONFIRMAR INSCRIÇÃO) | ✓ "INSCRITO" |
| Avançar 01/01 → 12/01 | ✓ ~7–13 s por dia (debug/emulador); bloqueia no dia do torneio com o toast "Partida de torneio pendente → Ir para o torneio" |
| Sorteio | ✓ campanha criada ("vs Enzo Iglesias & Nicolás Martínez") |
| Jogar Quartas | ✓ partida até o fim (~2,5 min): eliminado 0–2, +11 moedas, +14 XP |
| Reinstalar APK novo por cima | ✓ o save sobreviveu (o app reabriu direto na carreira) |
| **force-stop → reabrir** (save/reload real) | ✓ mesma data (12/01), moedas (6.360) e dupla |
| Avançar depois da partida | ✓ 12/01 → 13/01 |
| ANR / crash | ✓ **0** (`logcat`: nenhum FATAL/ANR do app; `dumpsys`: 0 "not responding") |

Não verificado no Android: a linha da partida na lista de histórico (a busca
rápida não achou o item nesse formato de lista). O histórico após o reload foi
verificado no desktop (`web-smoke.md`), e o resultado aparece na tela de fim de
partida no Android.

## Bug encontrado aqui e corrigido nesta fase

**Torneios com estado antigo depois de avançar dias sem sair da página.**

- **Sintoma (Android):** jogador inscrito avança até o dia do torneio estando em
  Torneios; o avanço bloqueia ("Você precisa disputar Quartas de Final"), mas
  "Ir para o torneio" abre os detalhes antigos ("Aguardando sorteio",
  "Inscrições abertas") sem botão de jogar. **Parece travado.** Saindo e
  voltando para Torneios, a campanha aparece normalmente ("VOCÊ ESTÁ
  DISPUTANDO … Preparar").
- **Causa:** `Tournaments.jsx` carregava lista de torneios, inscrições e
  campanhas sorteadas (`activeRunEvents`) **só ao montar**. Um hotfix antigo
  atualizava só o perfil (a data) no avanço.
- **Correção (mínima):** recarregar esse estado quando a data da carreira muda
  (`refreshCampaignState` + efeito por `career_date`).
- **Verificado:**
  - Desktop: inscrição em Londres e 17 dias avançados sem sair de Torneios; no
    dia 29/01 a página mostra "VOCÊ ESTÁ DISPUTANDO Londres Challenge · Oitavas
    · Preparar".
  - Android: o APK novo foi gerado e instalado com a correção, e a partida
    seguinte foi jogada normalmente.
- **Junto:** o card de um torneio disputado deixou de mostrar "Não
  participante". Ele usa a inscrição de qualquer status e agora mostra
  "CONCLUÍDO" (verificado no desktop).

## Também observado (não bloqueia)

- O chip **DUPLA** do cabeçalho leva ao **Ranking → Duplas**, não à tela de
  parceria. Escolha de navegação. Vai ao checklist como pergunta de UX.
- `console.error('[CareerDayAdvance]')` a cada "Avançar" num dia bloqueado
  (mesmo ruído do desktop; ver `web-smoke.md`).
- Navegação forçada da WebView (recarregar a página inteira por automação)
  quebra a ponte IPC do Tauri no Android (`runCallback` indefinido). Não é
  caminho de usuário: com navegação normal e com force-stop/reabrir, 0 erros.

## Veredito

**Android smoke: VERDE** (com o bug de estado antigo de Torneios corrigido).
O app abre, navega, inscreve, avança, sorteia, joga, liquida e salva, e
reabre do mesmo ponto. Sem crash e sem ANR.
