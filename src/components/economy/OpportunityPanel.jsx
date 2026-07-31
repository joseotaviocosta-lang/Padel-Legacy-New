import React from 'react';
import { Coins, Zap, Users, Star, BriefcaseBusiness } from 'lucide-react';
import {
  CAREER_OPPORTUNITIES,
  getDailyOpportunityStatus,
  getOpportunityStatus,
} from '@/game-core';

export default function OpportunityPanel({ profile, onComplete, busy }) {
  const daily = getDailyOpportunityStatus(profile);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4 border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">Renda da carreira</p>
            <p className="text-xs text-muted-foreground">
              Faça até {daily.limit} atividades por dia da carreira para levantar recursos sem depender de patrocínio.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{daily.remaining}</p>
            <p className="text-[11px] text-muted-foreground">restantes hoje</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CAREER_OPPORTUNITIES.map((opportunity) => {
          const status = getOpportunityStatus(profile, opportunity);
          const actionBusy = busy === `opportunity-${opportunity.id}`;

          return (
            <div key={opportunity.id} className="glass rounded-2xl p-4 space-y-3">
              <div>
                <p className="font-bold text-sm">{opportunity.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{opportunity.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-background/30 p-2 flex items-center gap-2">
                  <Coins className="h-3.5 w-3.5 text-amber-400" />
                  <span>+{status.estimatedReward.toLocaleString('pt-BR')}</span>
                </div>
                <div className="rounded-xl bg-background/30 p-2 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  <span>-{opportunity.energyCost} energia</span>
                </div>
                <div className="rounded-xl bg-background/30 p-2 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-blue-400" />
                  <span>+{opportunity.followersGain || 0} fãs</span>
                </div>
                <div className="rounded-xl bg-background/30 p-2 flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-purple-400" />
                  <span>+{opportunity.reputationGain || 0} reputação</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onComplete(opportunity)}
                disabled={!status.available || Boolean(busy)}
                className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
              >
                {actionBusy ? 'Realizando...' : status.available ? 'Realizar atividade' : status.reason}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
