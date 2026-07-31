import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronUp, Sparkles } from 'lucide-react';
import { ATTRIBUTES } from '@/lib/padel';
import { getAttributeIcon } from '@/components/padel/Shared';

export default function AttributeDistribution({ profile, onDistribute }) {
  const [points, setPoints] = useState(profile?.unspent_attribute_points || 0);
  const [busy, setBusy] = useState(null);

  async function addPoint(attrKey) {
    if (points <= 0) return;
    setBusy(attrKey);
    try {
      const updated = await base44.entities.PlayerProfile.update(profile.id, {
        [attrKey]: Math.min(100, (profile[attrKey] || 0) + 1),
        unspent_attribute_points: points - 1,
      });
      setPoints(points - 1);
      onDistribute?.(updated);
    } catch (e) { console.error(e); }
    finally { setBusy(null); }
  }

  if (points <= 0) return null;

  return (
    <div className="glass rounded-2xl p-5 border border-primary/30">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-sm">Pontos para Distribuir</h2>
        <span className="ml-auto text-2xl font-black text-primary tabular-nums">{points}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Distribua seus pontos iniciais. Após isso, evolua apenas treinando e jogando torneios!</p>
      <div className="grid grid-cols-2 gap-2">
        {ATTRIBUTES.map(attr => {
          const Icon = getAttributeIcon(attr.icon);
          return (
            <button
              key={attr.key}
              onClick={() => addPoint(attr.key)}
              disabled={busy !== null}
              className="glass rounded-xl p-2.5 flex items-center gap-2 hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium flex-1 text-left truncate">{attr.label}</span>
              <span className="text-xs font-black text-primary tabular-nums">{profile[attr.key] || 0}</span>
              <ChevronUp className="h-3 w-3 text-primary" />
            </button>
          );
        })}
      </div>
    </div>
  );
}