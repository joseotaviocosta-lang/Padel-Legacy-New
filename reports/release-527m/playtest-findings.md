# Achados do 1º playtest físico — RC 9001

Cada achado do celular foi reproduzido headless com o código real do jogo
(`scripts/repro-onboarding-v527m.mjs`). A reprodução cobre:
- carreira nova e tutorial na ordem da UI;
- dupla, treinador, treino;
- inscrição na Pré-Temporada no dia 1;
- 14 dias de avanço, sorteio, partidas e settlement;
- três variantes: contínua, sem abrir Conquistas e com save/reload.

| # | Achado no celular | Reproduzido? | Causa raiz | Correção |
|---|---|---|---|---|
| 1 | Chave sorteada × chave do histórico pareciam diferentes; o campeão não batia com a árvore | **Sim** (leitura da chave) | <ol><li>As partidas do jogador nas rodadas ≥ 1 não tinham `source_match_ids`. A final aparecia como "Vencedor Jogo 1 × Vencedor Jogo 2", com a numeração da rodada anterior. No celular, isso se lia como os jogos 1 e 2 das quartas.</li><li>O lado do jogador era regravado com o nome **atual**, não o do sorteio.</li></ol> | Ligações desde o sorteio, numeração global ("Vencedor Jogo 5 × 6" na final) e identidade congelada no sorteio |
| 2 | Semifinal e final com "A definir" depois do torneio "concluído" | **Sim** | O card dizia "Concluído" assim que o jogador era eliminado, com o torneio ainda em andamento. A chave revela cada rodada na sua data (por projeto). | "Eliminado" até o torneio terminar e "Concluído" depois, mais um aviso de torneio em andamento na chave. Concluído: 0 placeholders. |
| 3 | Pareceu travar ao salvar o nome | Medido headless | Duas gravações completas da carreira (~2,1 MB cada) por salvamento | Uma única transação: uma gravação |
| 4 | Saldo de ~950–1.283 para 7.291 em poucos dias | **Sim: 900 → 7.290** | Uma sincronização de conquistas pagou 5.800. Desse total, 4.900 vieram de conquistas satisfeitas pelo **kit de partida**: Rainbow Collection por catálogo de loja incompleto, Primeiro Patrocinador e Investidor por registros de demonstração. Abrir Conquistas antes zerava tudo. | O kit de partida não conta como conquista, o catálogo real é a referência de raridades e o perfil novo nasce reconciliado. Mesma repro: **900 → 2.490** |
| 5 | Fluxo financeiro não explicava as moedas | **Sim** | Nenhuma recompensa virava linha de extrato | Linha de extrato para cada recompensa e para os principais custos, no mesmo lote |
| 6 | "Data não informada +0" | **Sim** | O componente só lia o fechamento mensal. Linhas datadas, inclusive 2 de **demonstração** que nunca mexeram no saldo, viravam "+0". | Extrato agregado por mês e categoria, sem seed de demonstração. 0 linhas sem data. |
| 7 | Tutorial dizia "inscreva-se", mas só concluía depois da partida | **Sim** | Etapa "first-match" ativa com o jogador já inscrito e sem chave: o CTA caía no fallback "Inscrever-se em um torneio". O texto também dizia que a Pré-Temporada não valia, mas valia. | CTA "Ver torneios" com "conclui quando você jogar", e texto alinhado à condição real |
| 8 | Atalho do header abria o evento direto | — | Deep link de campanha no header | Mantém a informação e o toque abre `/tournaments` |
| 9 | Dupla forte campeã da Pré-Temporada | Auditado | Ver abaixo | **Não alterado** (só auditoria) |

## Pré-Temporada — auditoria (sem alteração)

**Como o campo é montado:**
- Os **3 adversários diretos** do jogador vêm de duplas **reais** do mundo, por `buildPlayerTournamentField`.
- A elegibilidade é a mesma da IA: `evaluateTournamentEntry`.
- A preferência também é a mesma: `chooseTournament` na mesma semana.
- O tier é aberto (`minRanking: 0`, `minLevel: Iniciante`), então a ordem é **das mais fracas para as mais fortes**.
- As outras 4 vagas da chave de 8 vêm do mesmo campo real e, em último caso, de duplas sintéticas.

**Restrições:** não há teto de ranking nem de OVR, só o piso.

**Dupla de elite:** é possível que entre, mas é improvável como adversária direta, pela ordem das mais fracas primeiro. Pode, sim, ser campeã. Depois da eliminação do jogador, o restante da chave é decidido por `fillerTeamStrength`, um **hash do nome**, não pela força real da dupla. O campeão da Pré-Temporada é efetivamente aleatório.

**Recomendação para design:** decidir se o cascade pós-eliminação deve usar a força real da dupla. Fica como candidato, sem mudança nesta fase, porque não há violação de regra de conteúdo.
