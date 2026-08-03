# Sistema central de atletas

## Resultado da auditoria

Antes desta revisão havia três fontes concorrentes (`bots.js`, `worldSeed2025.json` e `localSeed.js`). A lista de bots misturava atletas reais e fictícios, criava IDs a partir do nome, atribuía o lado pela posição no array e o mercado podia inventar um lado por hash. A busca de parceiros eliminava candidatos do mesmo lado antes da análise.

O catálogo central agora vive em `src/players/`. Ele contém 240 atletas fictícios determinísticos e, quando habilitado, 10 referências do ranking masculino da FIP. Os registros persistidos são instâncias mutáveis com `template_id`; o template não é copiado para outra base de código.

## Modelo e compatibilidade

- `id`: técnico, estável e independente do nome.
- `source_type`: `real`, `fictional` ou `career`.
- `preferred_side`: `right`, `left` ou `flex`; `position` permanece apenas como adaptador legado em português.
- `handedness`: mão dominante, sem inferência pelo lado da quadra.
- `side_flexibility` e `side_experience`: reduzem progressivamente o custo de jogar fora do lado preferido.
- a geração fictícia usa uma distribuição exata de 45% direita, 45% esquerda e 10% versáteis.

`resolveTeamCourtSides` testa as duas formações possíveis, escolhe a de menor custo e, em empate, preserva a preferência do jogador da carreira. Duplas do mesmo lado continuam disponíveis; recebem custo máximo de 24 pontos, reduzido pela flexibilidade e experiência. `calculatePartnershipInterest` combina encaixe, reputação e ranking: estrelas têm interesse baixo no início, mas nunca são bloqueadas permanentemente.

## Migração e licenciamento

A migração de save v9 normaliza atletas legados, consolida IDs duplicados e remapeia referências conhecidas de parceria. Ela é idempotente e mantém o campo legado `position` para telas e regras ainda não migradas.

Nomes, nacionalidades e posições do ranking real usam o retrato oficial da [FIP de 20/07/2026](https://www.padelfip.com/fip-rankings/?gender=Male). Os lados, estilos e ratings são metadados ficcionais de balanceamento, não medições oficiais. Para distribuição sem nomes reais, defina `VITE_REAL_ATHLETES_ENABLED=false`; o jogo funcionará somente com personagens originais.

## Verificação

Execute `npm run test:players`. O teste valida IDs, schema, determinismo, 1.000 atletas, distribuição lateral, pares complementares e de mesmo lado, adaptação, progressão de interesse e 10.000 avaliações de compatibilidade.
