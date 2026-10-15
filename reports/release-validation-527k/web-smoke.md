# Smoke web — 5.27-K

## Ambiente

O jogo **não roda num navegador comum**: o armazenamento exige o Tauri. No
Chrome puro, criar carreira falha com `StorageError: O ambiente Tauri não está
disponível`. Por isso o smoke foi feito no **app desktop real**:

- `npm run app:dev`: Vite de desenvolvimento + Tauri com o build Rust atual
  (`cargo` debug, 1m27s);
- a janela (WebView2) foi dirigida por `puppeteer-core` via
  `--remote-debugging-port`;
- roteiros em `web/t*.mjs`, prints em `web/*.png`.

A carreira de teste **"Smoke 527K — pode apagar"** foi criada no armazenamento
local real do usuário (junto das 8 carreiras existentes, que não foram tocadas).
Pode ser apagada pela tela Carreiras.

## Roteiro e resultado

| Passo | Resultado |
|---|---|
| Abrir o app / tela Carreiras | ✓ sem erro |
| Criar carreira | ✓ abre em Objetivos (`/game/missions`), 01/01/2026 |
| Início, Treinos, Dupla, Torneios, Ranking, Calendário | ✓ todas renderizam (~4–5 s cada no build debug), 0 erro de JS, nenhuma tela de erro |
| Formar dupla (Dupla → Mercado → Analisar proposta → Aceitar) | ✓ "Você e Tomás Acosta · Dupla ativa" |
| Inscrição (Torneios → Roma Pré-Temporada → Inscrever → Confirmar) | ✓ "INSCRITO PARA ESTE TORNEIO" |
| Avançar dia (01/01 → 12/01) | ✓ ~2 s por dia; no dia do torneio o avanço **bloqueia** e oferece "Ir para o torneio" |
| Sorteio D-3 | ✓ dupla real ("vs Rubén Medina 966 & Thiago Silva 981") |
| Reunião pré-torneio → plano tático → jogar Quartas | ✓ partida jogada até o fim: derrota 1–2 (5-7, 7-5, 9-11) |
| Liquidação | ✓ +11 moedas, +14 XP; histórico em Partidas: "Roma Pré-Temporada · DERROTA" |
| Save → reload completo da janela → Continuar carreira | ✓ mesma data (12/01), moedas (6.521), dupla e histórico |

**Erros de JavaScript (pageerror):** 0.

## Achados (não bloqueiam)

1. **Card "Não participante" depois de eliminado.**
   - **Sintoma:** depois de jogar e ser eliminado, o card do torneio em
     Torneios mostra "Não participante · Você não se inscreveu antes do
     fechamento". Persiste após o reload.
   - **Causa:** `Tournaments.jsx` só mapeia inscrições `confirmed`. Na
     liquidação a inscrição vira `completed` (`tournamentLifecycle.js:564`) e o
     card cai na regra de janela fechada.
   - **Classificação:** cosmético. O resultado e o histórico estão corretos. A
     função de estado já trata `completed`; a página não passa a inscrição.
     Correção pequena, deixada para depois do playtest. Já está no checklist
     como problema conhecido.
2. **`console.error('[CareerDayAdvance]')` a cada clique em "Avançar" num dia
   bloqueado.**
   - **Mecanismo:** o bloqueio por decisão obrigatória é sinalizado por
     exceção (`advance_day_blocked`, `career.js:104–110`). O `catch` de
     `advanceCareerDayWork` trata isso como falha: loga erro, grava diagnóstico
     beta e restaura o snapshot (sem efeito, é o mesmo estado).
   - **Classificação:** ruído de log/diagnóstico. A UI responde certo. Não bloqueia.

## Veredito

**Web (app desktop) smoke: VERDE.** Criar, navegar, formar dupla, inscrever,
avançar, sortear, jogar, liquidar, salvar e recarregar funcionam de ponta a
ponta, sem crash nem perda de dados.
