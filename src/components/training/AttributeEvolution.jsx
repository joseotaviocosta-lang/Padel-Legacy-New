import React, { useEffect, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, ArrowUpRight, Activity, Award } from 'lucide-react';
import { ATTRIBUTES, ATTRIBUTE_GROUPS } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import { CollapsibleSection, Surface, SurfaceHeader } from '@/components/design-system';

// ── Attribute Evolution ──────────────────────────────────────────────────
// Mostra o radar de todos os atributos, top-melhorados e a evolução
// início→atual de cada um. Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.14):
// era a única tela do app usando `glass rounded-2xl p-4` cru em vez de
// Surface/SurfaceHeader, e a única lista de atributos totalmente plana
// (sem agrupar por categoria) — migrada para os primitives do design
// system e agrupada por ATTRIBUTE_GROUPS (mesma categorização já usada em
// PlayerProfile.jsx, não uma nova).
export default function AttributeEvolution({ profile }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const list = await localGame.entities.TrainingSession.filter({ profile_id: profile.id });
        setSessions(list || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="glass rounded-2xl p-10 text-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // Build radar data
  const radarData = ATTRIBUTES.map(a => ({
    attribute: a.label,
    value: Number(profile?.[a.key]) || 0,
    key: a.key,
  }));

  // Calculate gains per attribute from training history
  const gainsByAttr = {};
  for (const s of sessions) {
    if (!s.attribute_target) continue;
    gainsByAttr[s.attribute_target] = (gainsByAttr[s.attribute_target] || 0) + (s.attribute_gain || 0);
  }

  // Starting value (all attributes started at 5)
  const STARTING_VALUE = 5;

  // Sort attributes by current value for the list
  const sortedAttrs = [...ATTRIBUTES].map(a => ({
    ...a,
    current: Number(profile?.[a.key]) || 0,
    gain: gainsByAttr[a.key] || 0,
    growth: (Number(profile?.[a.key]) || 0) - STARTING_VALUE,
  })).sort((a, b) => b.gain - a.gain);

  const topImproving = sortedAttrs.filter(a => a.gain > 0).slice(0, 3);
  const totalGain = Object.values(gainsByAttr).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Radar Chart */}
      <Surface>
        <SurfaceHeader
          icon={Activity}
          title="Perfil de Atributos"
          description="Visão radar de todos os atributos"
          action={<div className="text-right"><p className="text-[9px] uppercase text-muted-foreground font-bold">Ganho Total</p><p className="text-lg font-black text-primary tabular-nums">+{totalGain}</p></div>}
        />
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(228 20% 17%)" />
              <PolarAngleAxis dataKey="attribute" tick={{ fill: 'hsl(220 12% 60%)', fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'hsl(220 12% 40%)', fontSize: 8 }} stroke="hsl(228 20% 17%)" />
              <Radar name="Atributos" dataKey="value" stroke="hsl(84 81% 52%)" fill="hsl(84 81% 52%)" fillOpacity={0.3} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Surface>

      {/* Top Improving */}
      {topImproving.length > 0 && (
        <Surface>
          <SurfaceHeader icon={Award} title="Mais Evoluídos" />
          <div className="space-y-2">
            {topImproving.map((a, i) => (
              <div key={a.key} className="flex items-center gap-3">
                <span className="text-xs font-black text-muted-foreground w-4">{i + 1}º</span>
                <span className="text-xs font-semibold flex-1">{a.label}</span>
                <div className="flex items-center gap-1 text-primary">
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-xs font-bold">+{a.gain}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{a.current}/100</span>
              </div>
            ))}
          </div>
        </Surface>
      )}

      {/* Before/After Comparison — agrupado por categoria, cada grupo
          recolhível (o primeiro, Técnicos, aberto por padrão por ser o
          mais consultado). */}
      {ATTRIBUTE_GROUPS.map((group, groupIndex) => {
        const groupAttrs = sortedAttrs.filter((a) => group.keys.includes(a.key));
        if (!groupAttrs.length) return null;
        const groupGain = groupAttrs.reduce((sum, a) => sum + a.gain, 0);
        return (
          <CollapsibleSection
            key={group.id}
            title={group.label}
            description={`${groupAttrs.length} atributo${groupAttrs.length === 1 ? '' : 's'} · +${groupGain} no total`}
            defaultOpen={groupIndex === 0}
          >
            <div className="space-y-3">
              {groupAttrs.map(a => {
                const startPct = (STARTING_VALUE / 100) * 100;
                const currentPct = (a.current / 100) * 100;
                return (
                  <div key={a.key}>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="font-semibold">{a.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground tabular-nums">{STARTING_VALUE}</span>
                        <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="font-bold text-primary tabular-nums">{a.current}</span>
                        {a.growth > 0 && <span className="text-primary text-[9px]">(+{a.growth})</span>}
                      </div>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-secondary/60 overflow-hidden">
                      <div className="absolute h-full bg-muted-foreground/30 rounded-full" style={{ width: `${startPct}%` }} />
                      <div className="absolute h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${currentPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
