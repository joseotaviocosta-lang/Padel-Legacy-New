# RC Sprint 2 — Universo Vivo e IA Estratégica dos NPCs

## Versão
0.9.0-beta.43

## Implementação

- Decisões mensais determinísticas para até 350 atletas controlados pela IA.
- Quatro perfis estratégicos principais: competidor, trabalhador, tático e showman, além do perfil equilibrado.
- Planejamento de calendário adaptado à forma, confiança, energia, fadiga e lesões.
- Estratégias comerciais e de parceria próprias para cada perfil.
- Mudanças reais de treinador em períodos de crise, com registro no Universo Vivo.
- Proteção para não alterar atletas vinculados à carreira humana.
- Processamento idempotente: apenas uma execução por mês da carreira.
- Snapshot agregado para auditoria das estratégias do circuito.

## Efeitos esperados

- Atletas em má fase podem reduzir calendário, priorizar desenvolvimento ou trocar treinador.
- Atletas em ótima fase podem aumentar a carga competitiva.
- Showmen priorizam visibilidade; atletas de elite em alta buscam contratos premium.
- Atletas pacientes tentam reconstruir a dupla; atletas menos pacientes avaliam mudanças.
- O circuito produz notícias baseadas em decisões efetivamente aplicadas.

## Validação

`npm run test:rc-world-ai`

Resultado local: `RCWorldAIV36Test: PASS (12/12)`.

Lint e build devem ser executados no ambiente do projeto, pois esta cópia não contém `node_modules`.
