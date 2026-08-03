# Inscrições em torneios v2

## Diagnóstico anterior

O catálogo mundial gerava abertura 35 dias antes e fechamento 5 dias antes, enquanto o fallback do calendário usava abertura em 45 dias e fechamento em 3. A interface considerava um `CalendarEvent` agendado como inscrição. O mesmo fluxo também escrevia em `Tournament.participants` e oferecia substituir conflitos cancelando o compromisso anterior. A participação era aberta pelo estado visual e o modal de partidas recuperava somente o evento de calendário.

## Regra atual

A janela padrão abre 30 dias antes e encerra 1 dia antes do início efetivo. O dia inicial do qualificatório, quando existe, é o início efetivo. Datas são dias ISO (`YYYY-MM-DD`) sem horário. O torneio de 08/01/2026 fica aberto de 09/12/2025 a 07/01/2026 e aceita inscrição em 01/01/2026.

`TournamentRegistration` é a fonte oficial. O registro possui ID determinístico por jogador e torneio, jogador, parceiro congelado, status, datas efetivas, caminho esportivo e taxa. O calendário é uma projeção operacional vinculada por `registration_id`; não prova participação sozinho.

Conflitos usam intervalos inclusivos. Dois eventos que compartilham qualquer dia conflitam. Uma inscrição cancelada deixa de bloquear a agenda, permanece no histórico e recebe reembolso conforme a regra central. Nenhum conflito é cancelado automaticamente.

Antes de abrir uma partida, o sistema consulta novamente uma inscrição persistida com status `confirmed`. Ausência do registro desabilita o botão, mesmo que haja evento visual ou dados de torneio.
