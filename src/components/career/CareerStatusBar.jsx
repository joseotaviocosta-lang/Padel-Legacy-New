import React, { useEffect, useState } from 'react';
import { Calendar, Users, Lock, ChevronRight } from 'lucide-react';
import { careerDateLabel, careerMonthLabel, canChangePartner, daysUntilPartnerUnlock, getPartnerBot } from '@/lib/career';
import { overallRating } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';

const athleteProfiles = /** @type {any} */ (localGame.entities).AthleteProfile;

export default function CareerStatusBar({ profile, onPartnerClick }) {
  const fallbackPartner = getPartnerBot(profile);
  const [canonicalPartner, setCanonicalPartner] = useState(null);
  useEffect(() => {
    let active = true;
    setCanonicalPartner(null);
    if (!profile?.partner_id) return undefined;
    athleteProfiles.get(profile.partner_id).then((row) => {
      if (active) setCanonicalPartner(row || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [profile?.career_date, profile?.partner_id]);
  if (!profile) return null;
  const partner = canonicalPartner || fallbackPartner;
  const canChange = canChangePartner(profile);
  const daysLocked = daysUntilPartnerUnlock(profile);

  // M4.1.3 (docs/MOBILE_M4_1_3_VISUAL_HOTFIX.md, Parte 7): QA físico provou
  // que o problema era ESTRUTURAL, não de truncamento — em 360px, data +
  // badge de lado + divisor + avatar do parceiro (todos shrink-0) sobravam
  // pouco espaço pro nome/OVR/química do parceiro, que virava texto
  // "letra por letra". truncate não resolve espaço zero.
  //
  // Fix: no mobile, empilha em 2 linhas (data+lado numa linha, parceiro
  // sozinho na linha de baixo, com toda a largura pra si). Desktop continua
  // exatamente a mesma linha única de antes — o wrapper da linha 1 vira
  // `md:contents` (some como caixa, os filhos voltam a participar do flex
  // do container pai na mesma ordem), então o layout desktop é literalmente
  // a mesma árvore/ordem de antes, não uma segunda implementação paralela.
  return (
    <div className="glass rounded-2xl p-3 flex flex-col gap-2 sm:p-4 md:flex-row md:items-center md:gap-4">
      <div className="flex items-center justify-between gap-2 md:contents">
        <div className="flex min-w-0 items-center gap-2 shrink-0">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold leading-tight truncate">{careerDateLabel(profile)}</p>
            <p className="text-[10px] text-muted-foreground truncate">{careerMonthLabel(profile)}</p>
          </div>
        </div>

        {profile?.court_side && (
          <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-1 rounded-lg shrink-0">
            {profile.court_side === 'direita' ? 'Direita' : profile.court_side === 'esquerda' ? 'Esquerda' : 'Versátil'}
          </span>
        )}

        <div className="hidden h-8 w-px bg-border/40 md:block" />
      </div>

      <button
        onClick={onPartnerClick}
        className="flex items-center gap-2 min-w-0 md:flex-1 hover:bg-secondary/30 rounded-xl p-1 -m-1 transition-colors"
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
