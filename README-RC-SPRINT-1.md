# RC Sprint 1 — Gameplay Balance

Esta entrega congela novas mecânicas e adiciona uma auditoria repetível do gameplay.

## Comando principal

```bash
npm run test:rc-gameplay-balance
```

O teste padrão executa:

- 150 partidas distribuídas em 5 cenários;
- 100 carreiras de 10 temporadas;
- validação de equilíbrio entre lados;
- sensibilidade a diferenças de nível;
- comportamento de saque baixo e duplas faltas;
- tática agressiva, energia e duração;
- progressão, lesões, parceiros e risco de falência.

Para uma bateria maior:

```bash
node scripts/test-rc-gameplay-balance-v36.mjs --matches=100 --careerRuns=30 --seasons=10
```

Os relatórios são gravados em `reports/rc-sprint-1/`.

## Alterações técnicas

- eventos de ponto agora registram golpe final, rally e erro forçado;
- o simulador mede duplas faltas, eficiência do saque e placares desequilibrados;
- foram adicionados gates para frequência de 6–0, hold de saque e dupla falta;
- nenhum save foi alterado e não houve mudança direta nas recompensas da carreira.

## Observação

O simulador legado de carreiras ainda aproxima o World Tour e não reproduz integralmente a pontuação de todos os torneios atuais. Ele é usado para detectar regressões de tendência, não para substituir testes persistentes do ranking real.
