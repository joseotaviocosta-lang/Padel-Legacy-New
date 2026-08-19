import React from 'react';
import { Heart, Brain, Battery, Users } from 'lucide-react';
import { chemistryLabel } from '@/lib/padel';
import { ProgressBar } from '@/components/design-system';

// Condição geral, energia, fadiga e alertas de lesão/overtraining já
// aparecem na faixa de estatísticas e nos avisos do topo de Training.jsx —
// este painel mostra só o que é exclusivo daqui (moral, confiança, forma
// física, química da dupla), evitando repetir a mesma informação três vezes
// (seção 6 do redesign).
//
// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.3): este bloco não deve mais
// aparecer sempre-expandido antes das atividades de treino — Training.jsx
// agora embrulha só o conteúdo (sem Surface/SurfaceHeader própria) dentro de
// um CollapsibleSection ("Estado do atleta"), usando
// `getConditionSummaryItems` para o resumo de uma linha visível fechado.
function ConditionBar({ icon: Icon, label, value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) / max * 100));
  const tone = pct >= 70 ? 'success' : pct >= 40 ? 'brand' : pct >= 20 ? 'warning' : 'danger';
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <ProgressBar value={value} max={max} label={label} valueLabel={`${Math.round(value)}/${max}`} tone={tone} size="sm" />
      </div>
    </div>
  );
}

export function getConditionSummaryItems(profile) {
  if (!profile) return [];
  const chemLabel = chemistryLabel(profile.partner_chemistry || 50);
  return [
    { label: 'Moral', value: Math.round(profile.morale || 70) },
    { label: 'Confiança', value: Math.round(profile.confidence || 50) },
    { label: 'Forma', value: Math.round(profile.form || 50) },
    { label: 'Entrosamento', value: chemLabel.label },
  ];
}

export default function ConditionPanel({ profile }) {
  if (!profile) return null;
  const chemLabel = chemistryLabel(profile.partner_chemistry || 50);

  return (
    <>
      <div className="space-y-3">
        <ConditionBar icon={Heart} label="Moral" value={profile.morale || 70} />
        <ConditionBar icon={Brain} label="Confiança" value={profile.confidence || 50} />
        <ConditionBar icon={Battery} label="Forma física" value={profile.form || 50} />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary/30 p-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center"><Users className="h-4 w-4 text-muted-foreground" /></div>
          <div>
            <p className="text-xs font-bold">Entrosamento da dupla</p>
            <p className="text-[10px] text-muted-foreground">{profile.partner_name || 'Sem parceiro'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${chemLabel.color}`}>{chemLabel.label}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{profile.partner_chemistry || 50}/100</p>
        </div>
      </div>
    </>
  );
}
