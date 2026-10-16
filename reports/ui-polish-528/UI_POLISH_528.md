# Fase 5.28 — UI polish mobile-first

**Base:** branch `feature/live-coach-dynamic-adaptation`, sobre `c5bf7c8`. **Sem commit, sem push.**

**Validação:** app desktop real (Tauri/WebView2, dirigido por puppeteer), na carreira de teste "Smoke 527K — pode apagar".
- Larguras: **360×780, 390×844, desktop 1280×800 e paisagem 780×360**.
- Navegação e leitura apenas: nenhum dia avançado, nenhuma contratação feita.

## 1. Resumo executivo

**O que estava ruim:**
- **Modal de treinador:** o CTA "CONTRATAR · 1800 / MÊS + 3000 DE ASSINATURA" media **354 px numa caixa de 314 px** em 360 px e saía pelas duas bordas.
- **Modal de detalhes do torneio:** o selo "Participação em andamento" espremia a descrição numa coluna de uma palavra por linha e saía da borda do card. O rodapé tinha três botões empilhados.
- **Chave:**
  - um torneio Bronze aparecia como "LEGACY SILVER";
  - as abas de rodada quebravam e deixavam "Final" sozinha;
  - 4 blocos com borda empurravam a chave para baixo da dobra.
- **Heróis de página no celular:** breadcrumb, sobretítulo e descrição longa. Economia gastava a dobra inteira antes das abas.
- **Selos truncados** ("PATROCÍNI…", "INVESTIME…").
- **Botões:** vários primários concorrendo (cards de treinador e de comissão, "Abrir evento" no herói de Torneios ao lado de "Preparar").
- **Botão flutuante do Guia:** um bloco verde sólido de 48 px, o elemento mais forte de qualquer tela.
- **Atalho do Centro de Treinamento** sobre o título do herói.
- **Objetivos:** aviso ciano verborrágico.

**O que foi corrigido:**
- Sistema de botões à prova de estouro, com linha auxiliar para preço.
- Área de ações padrão para modais.
- Heróis densos por padrão no celular.
- HUD mais leve.
- Hierarquia de botões aplicada nas listas.
- Correções pontuais nas telas acima.

**Resultado geral:** nas 13 telas × 4 larguras auditadas: **0 overflow horizontal, 0 elemento fora da tela, 0 controle com texto estourando**, 0 erro de JS. Nenhum teste de UI que passava no HEAD passou a falhar.

## 2. Auditoria (causa raiz)

| Tela / componente | Problema | Causa raiz |
|---|---|---|
| Modal de treinador (CTA) | Texto além das bordas em 360 e 390 | Primitive `whitespace-nowrap` + altura fixa + caixa alta com tracking no primário + preço inteiro no rótulo |
| Detalhes do torneio | Descrição em coluna estreita; selo fora do card | `flex justify-between` com o selo `shrink-0` ao lado do parágrafo |
| Detalhes do torneio (rodapé) | 3 botões disputando a faixa | "Fechar" redundante com o X; sem padrão de área de ações |
| Chave | "LEGACY SILVER" num Bronze | `TIER_STYLES` sem Bronze/Pré-Temporada; fallback = Silver |
| Chave | "Final" sozinha numa 2ª linha | Abas `variant="buttons"` (quebram por desenho da 5.20-B) usadas como navegação |
| Chave | Chave abaixo da dobra | 4 cartões com borda só para local, patrocinador, público e partidas |
| Heróis (Economia, Treinadores, Inventário…) | ~300 px antes do conteúdo | `dense` (M4) era opt-in, e boa parte das páginas não optava |
| Economia | Saldo 3× na mesma dobra | Selo "X moedas" no herói + card Saldo + saldo do header |
| `StatCard` | Rótulo truncado | Ícone decorativo de 36 px dividindo 165 px de célula com o rótulo |
| Pílulas de filtro | 3 linhas de abas em Economia | Padding desktop no celular + ícones decorativos |
| HUD do herói | Bloco "pesado" | Fios verticais e horizontais internos + altura mínima de 44 px por célula |
| Torneios | Dois primários na 1ª dobra | "Abrir evento" (herói) primário ao lado de "Preparar" (campanha) |
| Listas de treinador e comissão | 6+ botões primários por tela | A ação de cada card usava `level="primary"` |
| Guia flutuante | Elemento mais forte da tela | Verde sólido 48 px, contra 44 px translúcido dos outros atalhos |
| Atalho do Centro de Treinamento | Sobre o título do herói / redundante na própria página | Fixo no topo direito, sem reserva no herói |
| Objetivos | Aviso ciano chamativo | Estilo de destaque para uma informação de apoio |

## 3. Sistema de padronização aplicado

**Botões** (`design-system/Button.jsx`), quatro níveis:
- **primary:** a ação principal da tela ou do modal; **uma por contexto**.
- **secondary:** ação importante mas não dominante, e **a ação de cada card numa lista**.
- **ghost:** navegação auxiliar, "ver detalhes", links de contexto.
- **danger:** só destrutiva (ex.: "Demitir treinador").

**Tamanho:**
- A altura vira **mínima**: `sm` 32 / `default` 40 / `lg` 44 / `touch` 48 px. No celular o alvo continua ≥ 44 px (`pl-btn-tap`).
- Em uma linha nada muda.
- **Nunca** passa da largura do contêiner (`max-w-full min-w-0`).
- O texto pode quebrar (`whitespace-normal`, `overflow-wrap:anywhere`).

**Regra de CTA:**
- Rótulo curto (verbo + objeto).
- Preço ou prazo na **`sublabel`** (2ª linha menor, sem caixa alta). Ex.: "Contratar treinador" / "1.800/mês · luvas 3.000".

**Modais e painéis** (`ModalActions`):
- **Mobile:** secundárias lado a lado (mesma largura) e o primário em largura total embaixo, perto do polegar.
- **Desktop:** tudo numa linha à direita, com o primário por último.
- Texto de apoio (ex.: "Sorteio em 3 dias") em `info`, nunca como botão.
- **"Fechar" só quando não há outra ação**: o X do cabeçalho já fecha.

**Hierarquia e espaçamento no mobile:**
- O herói de página é denso por padrão: ícone + título + HUD, sem breadcrumb, sobretítulo nem descrição. O desktop não muda.
- Indicadores em grade sem fios internos.
- Informação de contexto em **uma linha de metadados**, não em cartões com borda.
- Avisos de apoio em tom neutro.

**Atalhos flutuantes:**
- Mesmo peso visual: 44 px, fundo translúcido, ícone na cor.
- O título do herói reserva o espaço do atalho do topo.
- Atalho redundante some na própria página.

## 4. Mudanças (arquivo por arquivo)

| Arquivo | Mudança | Por quê |
|---|---|---|
| `src/components/design-system/Button.jsx` | Altura mínima por tamanho, quebra de texto, `max-w-full`, prop `sublabel`, novo `ModalActions` | Zero estouro; CTA com preço; área de ações única |
| `src/components/coaches/CoachDetail.jsx` | CTA "Contratar treinador" + linha de custo; "Demitir" como `danger`; nome repetido removido do corpo | P0 do treinador; hierarquia; menos repetição |
| `src/components/coaches/CoachCard.jsx` | "Ver detalhes" ghost, "Contratar" secundário | Um primário por tela |
| `src/components/economy/StaffPanel.jsx` | Contratar (lista) secundário | Idem |
| `src/components/tournaments/TournamentDetailsModal.jsx` | Herói com selo na 1ª linha; rodapé via `ModalActions`; "Fechar" só sem outra ação | Coluna espremida; rodapé |
| `src/components/tournaments/TournamentBracket.jsx` | Estilos Bronze/Pré-Temporada; fallback neutro com o nome real do tier; rodadas em faixa única; linha de metadados no lugar de 4 cartões | Selo errado; "Final" sozinha; dobra |
| `src/components/design-system/PageHeader.jsx` | `dense = true` por padrão (só afeta < md) | Heróis consumindo a dobra |
| `src/components/design-system/StatCard.jsx` | Ícone oculto < sm; tracking menor | Rótulos truncados |
| `src/components/design-system/FilterPills.jsx` | Padding menor e ícone oculto < sm | 3 → 2 linhas de abas em Economia |
| `src/index.css` | HUD mobile sem fios internos, células de 36 px; título do herói reserva 44 px do atalho | Peso visual; colisão |
| `src/pages/Economy.jsx` | Removido o selo "X moedas" do herói | Saldo repetido 3× |
| `src/pages/Tournaments.jsx` | "Abrir evento" do herói como secundário | Dois primários na dobra |
| `src/pages/Missions.jsx` | Aviso de ação antecipada neutro e curto | Destaque indevido |
| `src/components/onboarding/OnboardingGuide.jsx` | Botão do Guia 44 px translúcido, ícone verde, ponto de pendência mantido | Elemento mais forte da tela |
| `src/components/system/FloatingUtilityRail.jsx` | Atalho do Centro de Treinamento oculto dentro do próprio Centro | Redundante e sobre o título |
| `scripts/ui-audit-528.mjs` (novo) | Auditoria: screenshots + overflow/fora da tela/estouro/alturas de botão | Evidência reprodutível |

Nenhuma regra de jogo, economia, ranking, progressão ou motor foi tocada.

## 5. Evidências

- **Screenshots antes:** `before/<tela>-<largura>.png` (13 telas × 4 larguras).
- **Screenshots depois:** `after/…` (mesmas telas e larguras).
- **Lado a lado:** `compare/<tela>-<largura>.png` (15 pares):
  - treinador (360, 390, desktop);
  - torneios;
  - detalhe (360, paisagem);
  - chave;
  - treinos;
  - economia/fluxo e dashboard;
  - objetivos;
  - dupla (cards + abas);
  - home/header;
  - treinadores;
  - comissão.
- **Medições:** `before/measurements.json`, `after/measurements.json`.

| Medição (13 telas × 4 larguras) | Antes | Depois |
|---|---|---|
| Overflow horizontal do documento | 0 | **0** |
| Elementos fora da viewport | 0 | **0** |
| Controle com texto maior que a caixa (fora de faixas roláveis) | **CTA do treinador: 354/314 px (360), 369/345 px (390)** | **0** |
| Primários visíveis na lista de treinadores | 6 + 1 | 0 + 1 (no modal) |

O medidor do "antes" contava também o selo "17" do sino e abas dentro de faixas roláveis; esses casos foram reclassificados como intencionais antes da medição do "depois".

## 6. Testes e verificações

- **lint:** ✓
- **build:** ✓
- **`git diff --check`:** ✓
- **Testes de UI** (`ui-tests.json`): os **132 testes** que referenciam os arquivos alterados, rodados neste working tree **e** num worktree limpo do HEAD `c5bf7c8`.
  - **92 passam** em ambos.
  - **0 regressões.**
  - **40 falham igualmente no HEAD** (preexistentes: auditorias estáticas antigas como `test-ui-shell`, `test-premium-*-v33`, `test-mobile-m1-hotfix`, `test-tutorial-floating-guide`…).
  - Ressalva: num teste que já falhava antes, uma falha nova no mesmo arquivo ficaria mascarada. Entre esses estão auditorias estáticas dos mesmos componentes (`test-tutorial-floating-guide`, `test-mobile-compact-ux-m4`, `test-page-hierarchy`).

## 7. Débitos fora do escopo (não misturados)

- **Atalhos flutuantes sobre o conteúdo no meio da rolagem:** decisão medida da 5.20-B (folga no fim da página; sobreposição no meio é comportamento de FAB). Mantida; só o peso visual caiu.
- **Header mobile em duas faixas** (contexto + moedas + sino / ranking + dupla + OVR + data + avançar): correto e sem colisão. Simplificá-lo é redesenho, não polimento.
- **40 testes estáticos de UI** já falhavam no HEAD; precisam ser revistos numa fase própria.
- **Botões fora do design system** (`<button>` cru em ~118 arquivos): esta fase padronizou o componente oficial e as telas do fluxo principal; migrar o resto é trabalho incremental.
- **Ainda não validado em aparelho físico.** A validação foi no WebView2 do desktop com viewport emulada; o Android usa outro motor de WebView.

## 8. Veredito

**B+ (aprovado com ressalvas).**

Critérios atendidos:
1. nenhum botão principal ultrapassa margens (medido);
2. o modal de treinador está correto e limpo;
3. há padronização de níveis de botão e de área de ações em modais;
4. as primeiras dobras ficaram visivelmente mais limpas (heróis densos, HUD sem fios, sem saldo repetido);
5. telas e modais mais consistentes entre si;
6. zero overflow horizontal nas telas auditadas;
7. header, conteúdo, CTA flutuante e bottom nav coexistem sem colisão grave, e o título não fica mais sob o atalho;
8. a experiência mobile está melhor no antes/depois.

Não é "A" porque:
- os atalhos flutuantes ainda cobrem conteúdo durante a rolagem (decisão anterior mantida);
- botões fora do design system continuam fora do padrão;
- falta o teste no celular físico.
