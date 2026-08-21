import React from 'react';
import { Handshake, Swords, UserRoundCog } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';

// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 6/7/5/19): responde direto
// "quem foram minhas duplas / meus treinadores / meu adversário mais
// recorrente" com fatos já calculados por careerStory.js (describePartnershipHistory/
// getTopRivalry) e coachLifecycle.js (getCoachTenureHistory) — esta função
// só renderiza, nenhum dado é inventado aqui.
export default function CareerIdentitySummary({ partnershipHistory, coachHistory, rivalry }) {
  const { bestByTitles, mostMatches, longest } = partnershipHistory || {};
  const hasPartnershipHistory = Boolean(bestByTitles || mostMatches || longest);
  const hasCoachHistory = Boolean(coachHistory?.current || coachHistory?.past?.length);

  return (
    <GlassCard>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Handshake className="h-4 w-4 text-primary" /> Identidade da Carreira</h2>
      <div className="space-y-4">
        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Duplas</p>
          {hasPartnershipHistory ? (
            <div className="space-y-1.5 text-xs">
              {bestByTitles?.titles > 0 && <p><strong className="text-foreground">{bestByTitles.name}</strong> — melhor parceria ({bestByTitles.titles} título{bestByTitles.titles === 1 ? '' : 's'} juntos)</p>}
              {mostMatches && <p><strong className="text-foreground">{mostMatches.name}</strong> — parceiro com mais partidas ({mostMatches.matches})</p>}
              {longest?.durationDays > 0 && <p><strong className="text-foreground">{longest.name}</strong> — parceria mais longa ({longest.durationDays} dias)</p>}
            </div>
          ) : <EmptyStateCard icon={Handshake} message="Nenhum histórico de dupla ainda." />}
        </section>
        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Treinadores</p>
          {hasCoachHistory ? (
            <div className="space-y-1.5 text-xs">
              {coachHistory.current && <p><strong className="text-foreground">{coachHistory.current.coachName}</strong> — atual{coachHistory.current.titles ? ` (${coachHistory.current.titles} título${coachHistory.current.titles === 1 ? '' : 's'} no período)` : ''}</p>}
              {(coachHistory.past || []).slice(0, 3).map((t) => (
                <p key={`${t.coachId}-${t.endedDate}`}>
                  <strong className="text-foreground">{t.coachName}</strong>
                  {t.ovrStart != null && t.ovrEnd != null ? ` — Overall ${t.ovrStart} → ${t.ovrEnd}` : ''}
                  {t.titles ? `, ${t.titles} título${t.titles === 1 ? '' : 's'}` : ''}
                </p>
              ))}
            </div>
          ) : <EmptyStateCard icon={UserRoundCog} message="Nenhum histórico de treinador ainda." />}
        </section>
        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rival mais recorrente</p>
          {rivalry ? (
            <p className="text-xs"><strong className="text-foreground">{rivalry.name}</strong> — {rivalry.matches} confrontos, H2H {rivalry.wins}–{rivalry.losses}{rivalry.finals ? `, ${rivalry.finals} final${rivalry.finals === 1 ? '' : 'is'}` : ''}</p>
          ) : <EmptyStateCard icon={Swords} message="Nenhuma rivalidade consolidada ainda (mínimo de 3 confrontos)." />}
        </section>
      </div>
    </GlassCard>
  );
}
