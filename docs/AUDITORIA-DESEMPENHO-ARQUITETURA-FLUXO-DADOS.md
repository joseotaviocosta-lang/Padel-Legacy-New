# Auditoria de desempenho, arquitetura e fluxo de dados

Data: 2026-08-03  
Versão auditada: `0.6.6-alpha.1`

## Resumo executivo

O maior custo mensurável estava no carregamento inicial: `App.jsx` importava todas as páginas de forma síncrona e `main.jsx` importava a suíte de testes de desenvolvimento no topo do entrypoint. O build gerava um único JavaScript de 2.294,93 kB (621,03 kB gzip). Após divisão por rota e isolamento dos testes, o entrypoint passou a 511,49 kB (161,63 kB gzip): redução de 77,7% no tamanho bruto e 74,0% no gzip.

A aplicação não usa hoje backend Base44, API remota, IndexedDB ou `localStorage` para o estado do jogo. O save completo fica em JSON por carreira no AppData do Tauri. Isso elimina latência de rede, mas faz com que leituras `fresh` e cada mutação serializem ou releiam o documento inteiro; portanto, reduzir transações e evitar consultas repetidas é mais importante que adicionar cache HTTP.

## Arquitetura e fluxo de dados

1. `main.jsx` monta React e `App.jsx` registra provedores, serviços globais e rotas.
2. `CareerProvider` e `ActiveCareerGuard` controlam a carreira selecionada.
3. As páginas chamam `localGame.entities.*`, uma fachada local compatível com a API histórica.
4. `CareerEntityRepository` filtra, ordena e altera coleções em `career.entities`.
5. `ActiveCareerAdapter` mantém uma cópia em memória, serializa gravações numa fila e encaminha o save ao `CareerManager`.
6. `CareerRepository`/`GameStorage` validam e gravam `careers/<career-id>.json` por arquivo temporário, conferência, backup e renomeação.
7. `TauriStorage` usa `@tauri-apps/plugin-fs` com `BaseDirectory.AppData`.

Fluxos de calendário, energia, fadiga, lesões, treino, missões, ranking, mercado e torneios convergem nessa mesma carreira. Não há banco relacional nem índices persistidos: `list`/`filter` operam sobre arrays em memória, depois de uma leitura `fresh` quando solicitada.

## Gargalos priorizados

### 1. Crítico — bundle monolítico inicial (corrigido)

- Evidência: 40 páginas importadas sincronamente; um chunk JS de 2.294,93 kB.
- Impacto: mais download/leitura local, parse, compilação e memória antes da primeira tela.
- Correção: `React.lazy` por rota, `Suspense` global e registro central em `routeModules.js`.
- Navegação: pré-carregamento sob `mouseenter`/foco no menu, sem baixar todas as telas ociosamente.

### 2. Alto — código de teste dentro do grafo de produção (corrigido)

- Evidência: módulos `*Test.js` eram imports estáticos de `main.jsx`; o `if (DEV)` protegia apenas a execução.
- Correção: módulo `dev/registerDevTests.js` carregado por `import()` somente em desenvolvimento.
- Resultado adicional: módulos transformados caíram de 3.773 para 3.749 no build de produção.

### 3. Alto — custo de escrita do save completo (mitigado, monitorar)

- Cada mutação realiza leitura/clone/validação/serialização do JSON completo e escrita atômica com verificação.
- `bulkCreate` e `bulkUpdate` já consolidam lotes em uma transação, e os inicializadores de torneios/eventos/mercado usam lote e deduplicação de promessas concorrentes.
- Próximo passo recomendado: instrumentar duração e tamanho de `writeCareer`; só introduzir journal/delta se saves reais mostrarem p95 acima de 50–100 ms. Alterar agora aumentaria muito o risco de corrupção e migração.

### 4. Médio — listas extensas no Mercado Mundial (corrigido)

- A tela consulta até 200 atletas e montava todos os cards de uma vez.
- Agora monta 50 e oferece carregamento incremental, preservando busca, filtros, scouting e negociação.
- Redução máxima de nós de cards na primeira renderização: 75% (200 para 50).

### 5. Médio — derivação repetida em Torneios (corrigido parcialmente)

- Contagens por tier faziam seis varreduras adicionais, além de ordenação, filtro e agrupamento.
- Agora as contagens são feitas em uma única passagem sobre a lista ordenada, seguida do filtro e agrupamento.
- A coleção é limitada a 200; virtualização não se justifica enquanto a tela agrupar dezenas, e não milhares, de cards.

### 6. Médio — leituras redundantes por tela (pendente controlado)

- `CareerHub`, Calendário, Ranking e Estatísticas disparam várias consultas paralelas; cada consulta `fresh` pode reler o mesmo save.
- A fila de escrita e o cache de carreira protegem consistência, mas `CareerEntityRepository.withCareer(save:false)` usa `fresh:true`.
- Recomendação: criar uma API de snapshot somente-leitura por montagem e medir a taxa de acerto. Não foi alterado nesta etapa para evitar que uma tela observe estado anterior a uma gravação de calendário/simulação.

### 7. Baixo/médio — grandes catálogos estáticos

- `achievementsData`, `encyclopediaData`, `coaches`, `sponsors`, `pressData` e `historyData` estão entre os maiores fontes.
- O code splitting já os retira do entrypoint e os deixa nos chunks das respectivas rotas. Migrá-los para JSON ou compactá-los teria pouco ganho adicional e pioraria manutenção.

## Métricas antes e depois

Medição com `npm run build`, Vite 6.4.3, mesma máquina e worktree:

| Métrica | Antes | Depois | Variação |
|---|---:|---:|---:|
| JS inicial minificado | 2.294,93 kB | 511,49 kB | -77,7% |
| JS inicial gzip | 621,03 kB | 161,63 kB | -74,0% |
| JS + CSS inicial | 2.404,37 kB | 620,93 kB | -74,2% |
| JS + CSS inicial gzip | 639,08 kB | 179,68 kB | -71,9% |
| Módulos transformados | 3.773 | 3.749 | -24 |
| Chunks JS/CSS após divisão | 2 | 139 | carregamento sob demanda |
| Build | 20,45 s | 20,48 s | estável |
| Cards iniciais no mercado (pior caso) | 200 | 50 | -75% |

O total de assets distribuídos não cai na mesma proporção (2.392,67 KiB bruto no relatório), pois o código continua disponível quando o usuário visita cada módulo. O ganho é no caminho crítico e na memória/parse iniciais, não na remoção de funcionalidades.

## Ferramentas de medição

- `npm run analyze`: gera o build com manifest e relata entrypoint, gzip, total e 15 maiores assets.
- O manifest fica em `dist/.vite/manifest.json` e não altera o runtime.
- O build ainda indica um entrypoint pouco acima de 500 kB e um chunk de gráficos de 374,01 kB. O segundo só é baixado pelas rotas que usam Recharts.

## Decisões sobre cache, workers e persistência

- Cache remoto: não aplicável; o jogo está offline.
- Cache em memória: já existe para a carreira ativa, mas leituras de entidade priorizam consistência com `fresh:true`.
- Web Worker: não introduzido. As simulações atuais misturam cálculo com persistência e efeitos de domínio; mover apenas parte para worker criaria custo de clonagem e risco de divergência. Primeiro deve-se extrair um núcleo puro e medir tarefas acima de um frame (16 ms).
- Persistência: nenhuma estrutura de save foi alterada. Não há migração nova por causa desta auditoria.
- Compatibilidade: nomes de entidades, IDs, schema, regras de torneio/ranking/economia e formato JSON permanecem iguais.

## Verificação e riscos

- Build de produção: aprovado.
- ESLint: aprovado após manter a ordem de hooks.
- Typecheck global: continua reprovando por erros preexistentes disseminados (tipagem dinâmica de `localGame.entities`, props JSX e extensões de `Window`/`ImportMeta`). A auditoria não ampliou o escopo para uma migração de tipos.
- Testes de carreira devem ser executados no ambiente com suporte ao runtime local/Tauri; a suíte existente valida integridade, migrações e lotes.
- Risco principal: a primeira visita a uma rota faz uma requisição local adicional do chunk. O preload no menu reduz essa espera em desktop; em mobile, o fallback acessível cobre a transição.
- Validação visual automatizada não foi possível sem uma sessão de navegador/Tauri disponível; o build e o lint cobrem a integração estática.

## Próximas otimizações recomendadas

1. Instrumentar `readCareer`/`writeCareer` com tamanho, média e p95 em saves reais.
2. Criar snapshot de leitura compartilhado por ciclo de tela, invalidado após `writeChain`.
3. Separar Recharts em carregamento sob demanda dentro das abas de estatísticas, se a medição de navegação apontar atraso.
4. Extrair simulações puras antes de avaliar Web Worker.
5. Corrigir a base de typecheck para transformar o TypeScript em gate confiável de regressão.
