import React from 'react';
import { Briefcase, GraduationCap, Users, Lightbulb } from 'lucide-react';
import { ADVISOR_META } from '@/lib/partnershipSystem';

const ICONS = { Briefcase, GraduationCap, Users };

export default function AdvisorPanel({ tips }) {
  if (!tips || tips.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <Lightbulb className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-bold text-sm mb-1">Nenhum conselho no momento</p>
        <p className="text-xs text-muted-foreground">Seus assessores não têm recomendações específicas agora. Continue jogando para receber orientações.</p>
      </div>
    );
  }

  // Group by advisor type
  const grouped = tips.reduce((acc, tip) => {
    if (!acc[tip.advisor]) acc[tip.advisor] = [];
    acc[tip.advisor].push(tip);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-400 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Conselhos são <span className="text-foreground font-semibold">orientativos</span> — a decisão final é sempre sua.
        </p>
      </div>

      {Object.entries(grouped).map(([advisorType, advisorTips]) => {
        const meta = ADVISOR_META[advisorType];
        const Icon = ICONS[meta?.icon] || Lightbulb;
        return (
          <div key={advisorType} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${meta?.color || 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-bold text-sm">{meta?.label || advisorType}</p>
                <p className="text-[10px] text-muted-foreground">{meta?.desc}</p>
              </div>
            </div>
            <div className="space-y-2">
              {advisorTips.map((tip, i) => (
                <div key={i} className="glass rounded-xl p-3 border-l-2 border-primary/40">
                  <p className="font-semibold text-xs mb-0.5">{tip.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{tip.text}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}