import React from 'react';
import { Calendar, Users, Lock, ChevronRight } from 'lucide-react';
import { careerDateLabel, careerMonthLabel, canChangePartner, daysUntilPartnerUnlock, getPartnerBot } from '@/lib/career';
import { overallRating } from '@/lib/padel';

export default function CareerStatusBar({ profile, onPartnerClick }) {
  if (!profile) return null;

  const partner = getPartnerBot(profile);
  const canChange = canChangePartner(profile);
  const daysLocked = daysUntilPartnerUnlock(profile);

  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-4">
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <Calendar className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs font-bold leading-tight">{careerDateLabel(profile)}</p>
          <p className="text-[10px] text-muted-foreground">{careerMonthLabel(profile)}</p>
        </div>
      </div>

      {profile?.court_side && (
        <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-1 rounded-lg shrink-0">
          {profile.court_side === 'direita' ? 'Direita' : profile.court_side === 'esquerda' ? 'Esquerda' : 'Versátil'}
        </span>
      )}

      <div className="h-8 w-px bg-border/40" />

      <button
        onClick={onPartnerClick}
        className="flex items-center gap-2 flex-1 min-w-0 hover:bg-secondary/30 rounded-xl p-1 -m-1 transition-colors"
      >
        <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          {partner ? (
            <span className="font-black text-primary text-sm">{partner.name[0]}</span>
          ) : (
            <Users className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold truncate">{partner ? partner.name : 'Sem parceiro'}</p>
          {/* M4.1.2 (docs/MOBILE_M4_1_2_VISUAL_POLISH.md, Parte 9): esta
              linha ficava numa coluna espremida (os irmãos do mesmo flex row
              — data, badge de lado, avatar, cadeado/chevron — são todos
              shrink-0, então em 360px sobra pouco espaço aqui) e quebrava
              sem proteção nenhuma. truncate é o degrade correto para
              informação já secundária, não uma reestruturação em grid. */}
          <p className="text-[10px] text-muted-foreground truncate">
            {partner ? `OVR ${overallRating(partner)} · Química ${profile?.partner_chemistry || 50}` : 'Toque para escolher'}
          </p>
        </div>
        {canChange ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <Lock className="h-3 w-3 text-amber-400" />
            <span className="text-[9px] text-amber-400 font-bold">{daysLocked}d</span>
          </div>
        )}
      </button>
    </div>
  );
}
