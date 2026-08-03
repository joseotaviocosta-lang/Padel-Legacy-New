# Auditoria — Imprensa, treinadores, clubes e patrocínios

## Diagnóstico e fontes de verdade

| Sistema | Estado anterior | Fonte canônica adotada | Problema raiz |
|---|---|---|---|
| Imprensa | Entrevistas calculadas ao abrir a tela e deduplicadas por texto em `related_event` | Evento real (`Match`, `CalendarEvent` ou parceria) + `PressArticle.source_event_id` | Identidade frágil e fallback por nome podiam aceitar evento de outro perfil |
| Treinadores | Catálogo com preços e bônus; perfil guardava apenas ID/nome | `PlayerProfile.coach_*` e catálogo `Coach` | Contratação e bônus de treino existiam, mas salário não entrava no fechamento financeiro |
| Clubes | Associação em `ClubMember` | `PlayerProfile.club_id` + `ClubMember` | Associação gratuita, múltipla e sem benefício aplicado ao gameplay |
| Patrocínios | `PlayerContract` com metas e avaliação | `PlayerContract` com categoria, slot e marcadores de pagamento | Ausência de exclusividade por categoria permitia acumular concorrentes |

Todos os registros ficam dentro de `career.entities` do save ativo; portanto permanecem isolados por carreira. O arquivo físico continua identificado pelo `career_id` técnico.

## Estados concorrentes encontrados

- Treinador: catálogo `Coach`, `PlayerProfile.coach_id` e equipe genérica `PlayerStaffHire`.
- Clube: `ClubMember` registrava vínculo sem sincronizar `PlayerProfile.club_id`.
- Patrocínio: há um catálogo antigo em `lib/economy.js` e o catálogo completo em `lib/sponsors.js`; a Economia usa o catálogo completo.
- Imprensa: entrevista pendente era estado derivado, enquanto a resposta virava `PressArticle`.

## Migração

Campos novos são opcionais e preenchidos ao primeiro uso. Contratos antigos permanecem ativos como legado. Conflitos antigos de categoria não são apagados; apenas novas assinaturas conflitantes são bloqueadas. Artigos respondidos não são removidos. Artigos pendentes não são entidades persistidas, portanto entrevistas genéricas deixam de aparecer assim que o gerador contextual é corrigido.

## Sistemas antes apenas visuais

A filiação comum a clube não tinha efeito funcional. Benefícios agora são gravados no perfil e consultados por treino e recuperação. Alguns efeitos avançados descritos nos cards de treinadores (estratégia, moral e prevenção) continuam informativos; o bônus por atributo é o efeito canônico efetivamente utilizado.
