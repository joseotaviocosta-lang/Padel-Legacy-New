import React, { useEffect, useState } from 'react';
import { Heart, TrendingUp, Trophy, Coins, Swords, Calendar, AlertTriangle, ShieldCheck, Smile, Sparkles, CheckCircle2 } from 'lucide-react';
import { compatibilityLabel } from '@/lib/partnershipSystem';
import { daysBetween } from '@/lib/career';
import { formatDate, overallRating } from '@/lib/padel';
import { derivePartnershipIdentity, getPartnerBondLabel } from '@/lib/partnerBondSystem.js';
import { Surface, Button } from '@/components/design-system';
import { localGame } from '@/api/localGameClient.js';

const athleteProfiles = /** @type {any} */ (localGame.entities).AthleteProfile;

function sideName(side) {
  return side === 'left' || side === 'esquerda' ? 'esquerda' : side === 'right' || side === 'direita' ? 'direita' : 'versátil';
}

export default function PartnerOverview({ partnership, profile, onEnd, onNegotiate, onConverse }) {
  // Fase 15.2 (Bug 3/G1/G2): Partnership não guarda a idade do parceiro —
  // busca pelo mesmo AthleteProfile já referenciado por partner_bot_id em
  // qualquer outro ponto do sistema (ex.: partnershipSystem.js atualiza esse
  // mesmo id), reaproveitando a idade que a Fase 15 já mantém em dia, sem
  // duplicar cálculo nem persistir um campo novo no save.
  const [partnerProfile, setPartnerProfile] = useState(null);
  useEffect(() => {
    let active = true;
    setPartnerProfile(null);
    if (!partnership?.partner_bot_id) return undefined;
    athleteProfiles.get(partnership.partner_bot_id).then((row) => {
      if (active) setPartnerProfile(row || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [partnership?.partner_bot_id, profile?.career_date]);

  if (!partnership) {
    return (
      <Surface className="p-8 text-center">
        <Heart className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-bold text-sm mb-1">Sem parceiro ativo</p>
        <p className="text-xs text-muted-foreground">Busque atletas na aba "Buscar" ou aceite uma proposta na "Caixa de Entrada".</p>
      </Surface>
    );
  }

  const chem = partnership.chemistry || 50;
  const chemLabel = compatibilityLabel(chem);
  const trust = partnership.partner_trust ?? 55;
  const morale = partnership.partner_morale ?? 70;
  const trustLabel = getPartnerBondLabel(trust);
  const moraleLabel = getPartnerBondLabel(morale);
  const identity = partnership.partnership_identity || derivePartnershipIdentity(partnership);
  const daysLeft = partnership.scheduled_end_date
    ? daysBetween(profile?.career_date, partnership.scheduled_end_date)
    : 0;
  const positionScore = partnership.compatibility_breakdown?.position;
  const sideOk = positionScore == null ? null : positionScore >= 70;
  const partnerAge = partnerProfile?.age ?? null;
  const partnerOverall = partnerProfile ? overallRating(partnerProfile) : partnership.partner_overall;

  return (
    <div className="space-y-4">
      {/* Partner card */}
      <Surface variant="elevated">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0">
            <span className="font-black text-primary text-2xl">{(partnership.partner_name || '?')[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-lg">{partnership.partner_name}</h3>
            <p className="text-xs text-muted-foreground">{partnership.partner_country}{partnerAge ? ` · ${partnerAge} anos` : ''} · {partnership.partner_level} · OVR {partnerOverall} · Lado {sideName(partnership.partner_position)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chemLabel.bg} ${chemLabel.color}`}>
                Entrosamento {chem}
              </span>
            </div>
          </div>
        </div>

        {sideOk !== null && (
          <div className={`mt-3 flex items-center gap-2 rounded-xl p-2.5 text-[11px] font-bold ${sideOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {sideOk ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {sideOk ? 'Lados complementares na quadra' : 'Parceiro atua fora do lado ideal — pode reduzir o rendimento da dupla'}
          </div>
        )}

        {/* Partnership bond */}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <BondBar label="Entrosamento" value={chem} meta={chemLabel} icon={Sparkles} />
          <BondBar label="Confiança" value={trust} meta={trustLabel} icon={ShieldCheck} />
          <BondBar label="Moral" value={morale} meta={moraleLabel} icon={Smile} />
        </div>

        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-black">Identidade: {identity.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{identity.description}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <Stat icon={Swords} label="Partidas" value={partnership.shared_matches || 0} />
          <Stat icon={TrendingUp} label="Vitórias" value={partnership.shared_wins || 0} color="text-green-400" />
          <Stat icon={Trophy} label="Títulos" value={partnership.shared_titles || 0} color="text-amber-400" />
          <Stat icon={Coins} label="Divisão" value={`${partnership.prize_split_pct}%`} color="text-cyan-400" />
        </div>
      </Surface>

      {/* Contract info */}
      <Surface padding="compact" className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold">Contrato de parceria</p>
          <p className="text-[10px] text-muted-foreground">
            Início: {formatDate(partnership.started_career_date)} · Duração: {partnership.negotiated_duration_days || 0} dias
            {daysLeft > 0 ? ` · Expira em ${daysLeft} dias` : ' · Expirado'}
          </p>
        </div>
      </Surface>

      {/* Actions — "Gerenciar parceria" sem dominar a tela (seção 13) */}
      <div className="grid grid-cols-3 gap-2">
        <Button level="ghost" onClick={onConverse} className="flex-col gap-1 py-2.5 h-auto">
          <Heart className="h-4 w-4 text-pink-400" /> Conversar
        </Button>
        <Button level="ghost" onClick={onNegotiate} className="flex-col gap-1 py-2.5 h-auto">
          <Coins className="h-4 w-4 text-cyan-400" /> Negociar
        </Button>
        <Button level="ghost" onClick={onEnd} className="flex-col gap-1 py-2.5 h-auto bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300">
          <AlertTriangle className="h-4 w-4" /> Encerrar
        </Button>
      </div>

      {/* Compatibility breakdown */}
      {partnership.compatibility_breakdown && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Compatibilidade Inicial</p>
          <div className="space-y-2">
            {Object.entries(partnership.compatibility_breakdown).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-24 capitalize">{factorLabel(key)}</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${val}%` }} />
                </div>
                <span className="text-[10px] font-bold tabular-nums w-8 text-right">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared goals */}
      {(partnership.shared_goals || []).length > 0 && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Objetivos Compartilhados</p>
          <div className="space-y-2">
            {partnership.shared_goals.map(g => (
              <div key={g.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <p className={`text-xs ${g.completed ? 'text-primary font-bold' : 'text-foreground/90'}`}>{g.title}</p>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden mt-1">
                    <div className={`h-full rounded-full ${g.completed ? 'bg-primary' : 'bg-primary/50'}`} style={{ width: `${Math.min(100, (g.progress / g.target) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{g.progress}/{g.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(partnership.conversations || []).length > 0 && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Conversas recentes</p>
          <div className="space-y-2">
            {partnership.conversations.slice(-3).reverse().map((conversation, index) => (
              <div key={`${conversation.date}-${index}`} className="rounded-xl bg-secondary/40 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <p className="text-[10px] font-bold">{conversation.speaker}</p>
                  <span className="text-[9px] text-muted-foreground">{conversation.date}</span>
                </div>
                <p className="text-xs mt-1 text-foreground/90">{conversation.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent conflicts */}
      {(partnership.conflicts || []).filter(c => !c.resolved).length > 0 && (
        <div className="glass rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5">
          <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold mb-2">Conflitos Pendentes</p>
          <div className="space-y-1.5">
            {partnership.conflicts.filter(c => !c.resolved).slice(0, 3).map((c, i) => (
              <div key={i} className="text-xs">
                <p className="font-semibold">{c.title}</p>
                <p className="text-[10px] text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BondBar({ label, value, meta, icon: Icon }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
        <span className={`text-[10px] font-black ${meta.color}`}>{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-500" style={{ width: `${value}%` }} />
      </div>
      <p className={`text-[9px] font-bold mt-1 ${meta.color}`}>{meta.label}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="glass rounded-xl p-2.5 text-center">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color || 'text-primary'}`} />
      <p className="text-sm font-black tabular-nums">{value}</p>
      <p className="text-[8px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

function factorLabel(key) {
  const map = { position: 'Posição', style: 'Estilo', personality: 'Personalidade', level: 'Nível', schedule: 'Agenda', chemistry: 'Química', overall: 'Overall' };
  return map[key] || key;
}
