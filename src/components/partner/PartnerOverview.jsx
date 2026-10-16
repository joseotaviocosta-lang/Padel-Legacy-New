import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Coins, Heart, Search, Sparkles, Users } from 'lucide-react';
import { compatibilityLabel } from '@/lib/partnershipSystem';
import { overallRating, getWorldRank } from '@/lib/padel';
import { derivePartnershipIdentity, getPartnerBondLabel } from '@/lib/partnerBondSystem.js';
import { Surface, Button, CollapsibleSection, ProgressBar, StatusBadge } from '@/components/design-system';
import { localGame } from '@/api/localGameClient.js';
import { getPartnerBot } from '@/lib/career';
import { getTeamRank } from '@/lib/teamRanking.js';

const athleteProfiles = /** @type {any} */ (localGame.entities).AthleteProfile;

function sideName(side) {
  return side === 'left' || side === 'esquerda' ? 'esquerda' : side === 'right' || side === 'direita' ? 'direita' : 'versátil';
}

export function resolvePartnerOverall(partnerProfile, legacyOverall) {
  const rawValue = partnerProfile
    ? (partnerProfile.overall_rating ?? partnerProfile.overall)
    : legacyOverall;
  const value = Number(rawValue);
  return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.round(value))) : '—';
}

const ALERT_TONE = {
  danger: 'border-red-500/30 bg-red-500/5 text-red-400',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
};
const TONE_BAR = { success: 'bg-emerald-400', warning: 'bg-amber-400', danger: 'bg-red-400', neutral: 'bg-muted-foreground' };

// Fase 5.31 — o único alerta contextual da tela (selectPartnerAlert).
export function PartnerAlert({ alert, children }) {
  if (!alert) return null;
  return (
    <div role="status" data-partner-alert={alert.id} className={`flex gap-2.5 rounded-xl border p-3 text-xs ${ALERT_TONE[alert.tone] || ALERT_TONE.warning}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-black">{alert.title}</p>
        <p className="mt-0.5 text-muted-foreground">{alert.text}</p>
        {children}
      </div>
    </div>
  );
}

// Fase 5.31 — RELATIONSHIP FIRST, DECISION SECOND, DETAILS ON DEMAND.
// Antes: card de 2.000px com 3 barras em caixas, identidade, 4 stats, 2
// rankings, contrato, 3 botões, compatibilidade, objetivos e conversas
// abertos de uma vez (e o HUD do topo repetindo entrosamento/confiança).
// Agora: um cartão da dupla (quem, força, química, contrato, situação) + no
// máximo 1 alerta + no máximo 1 CTA primário; o resto fica em "Mais sobre a
// dupla". Os dados e as fontes são os mesmos de antes.
export default function PartnerOverview({ partnership, profile, contract = null, alert = null, primaryAction = null, onPrimary, onEnd, onNegotiate, onConverse, onSearch }) {
  // Fase 15.2 (Bug 3/G1/G2): Partnership não guarda a idade do parceiro —
  // busca pelo mesmo AthleteProfile já referenciado por partner_bot_id em
  // qualquer outro ponto do sistema (ex.: partnershipSystem.js atualiza esse
  // mesmo id), reaproveitando a idade que a Fase 15 já mantém em dia, sem
  // duplicar cálculo nem persistir um campo novo no save.
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    let active = true;
    setPartnerProfile(null);
    if (!partnership?.partner_bot_id) return undefined;
    athleteProfiles.get(partnership.partner_bot_id).then((row) => {
      if (active) setPartnerProfile(row || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [partnership?.partner_bot_id, profile?.career_date]);

  // Playthrough 5.0, Parte L/N — ranking da DUPLA pela fonte canônica
  // (getTeamRank, teamRanking.js) e ranking individual por getWorldRank
  // (padel.js, mesma fonte do header). Nunca uma fórmula paralela.
  const [teamRank, setTeamRank] = useState(null);
  const [individualRank, setIndividualRank] = useState(null);
  useEffect(() => {
    let active = true;
    setTeamRank(null);
    if (!profile?.id || !partnership?.partner_bot_id) return undefined;
    // Playthrough 5.12, Parte S — a AUTORIDADE é o AthleteProfile
    // persistido; `getPartnerBot` (catálogo) só entra como fallback de save
    // antigo ainda não reparado.
    const partnerMember = partnerProfile?.id
      ? partnerProfile
      : (getPartnerBot(profile) || { id: partnership.partner_bot_id, name: partnership.partner_name });
    if (!partnerMember?.id) { setTeamRank({ rank: 0, unranked: true, displayRank: '—' }); return undefined; }
    getTeamRank(profile, partnerMember).then((result) => { if (active) setTeamRank(result); }).catch(() => { if (active) setTeamRank({ rank: 0, unranked: true, displayRank: '—' }); });
    return () => { active = false; };
  }, [profile?.id, profile?.career_date, partnership?.partner_bot_id, partnership?.partner_name, partnerProfile]);
  useEffect(() => {
    let active = true;
    if (!profile?.id) return undefined;
    getWorldRank(profile).then((result) => { if (active) setIndividualRank(result); }).catch(() => {});
    return () => { active = false; };
  }, [profile?.id, profile?.career_date]);

  if (!partnership) {
    return (
      <section data-partner-hero="none" className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/60"><Heart className="h-5 w-5 text-muted-foreground" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-primary">Sua dupla</p>
              <StatusBadge tone="warning">Sem parceiro</StatusBadge>
            </div>
            <h2 className="mt-0.5 text-lg font-black leading-tight">Sem parceiro ativo</h2>
            <p className="mt-1 text-xs text-muted-foreground">Sem dupla você não se inscreve em torneios. Compare propostas por lado, estilo e compatibilidade.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {primaryAction && <Button level="primary" size="touch" onClick={() => onPrimary?.(primaryAction.target)} className="flex-1"><Users className="h-4 w-4" /> {primaryAction.label}</Button>}
          {primaryAction?.target?.filter !== 'search' && <Button level="ghost" size="sm" onClick={onSearch}><Search className="h-3.5 w-3.5" /> Buscar atletas</Button>}
        </div>
      </section>
    );
  }

  const chem = partnership.chemistry || 50;
  const chemLabel = compatibilityLabel(chem);
  const trust = partnership.partner_trust ?? 55;
  const morale = partnership.partner_morale ?? 70;
  const trustLabel = getPartnerBondLabel(trust);
  const moraleLabel = getPartnerBondLabel(morale);
  const identity = partnership.partnership_identity || derivePartnershipIdentity(partnership);
  const positionScore = partnership.compatibility_breakdown?.position;
  const sideOk = positionScore == null ? null : positionScore >= 70;
  // Hotfix 15.5.2: sem AthleteProfile persistido, a idade vem do bot do
  // catálogo (mesmo gerador determinístico), nunca recalculada.
  const partnerAge = partnerProfile?.age ?? getPartnerBot(profile)?.age ?? null;
  // Hotfix 15.5.4 (P1 — OVR "—" na dupla): mesmo resolver canônico
  // (`overallRating`, padel.js) aplicado ao bot do catálogo como fallback.
  const partnerOverall = resolvePartnerOverall(partnerProfile, partnership.partner_overall ?? overallRating(getPartnerBot(profile)));
  const playerOverall = overallRating(profile);
  const playerInitial = (profile?.sport_name || profile?.name || 'V')[0]?.toUpperCase();
  const teamRankLabel = teamRank ? (teamRank.unranked ? 'Sem ranking' : `#${teamRank.displayRank || teamRank.rank}`) : '…';
  const status = contract || { label: 'Contrato ativo', tone: 'success', line: '' };

  return (
    <div className="space-y-3" data-partner-overview>
      {/* Cartão da dupla: quem é, força, química, contrato e situação. */}
      <section data-partner-hero="active" className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm">
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${TONE_BAR[status.tone] || TONE_BAR.success}`} />
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 -space-x-3" aria-hidden="true">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-card bg-secondary font-black text-muted-foreground">{playerInitial}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-card bg-gradient-to-br from-primary/40 to-secondary font-black text-primary">{(partnership.partner_name || '?')[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-primary">Sua dupla</p>
              <StatusBadge tone={status.tone} className="shrink-0">{status.label}</StatusBadge>
            </div>
            <h2 className="mt-0.5 truncate text-lg font-black leading-tight">{partnership.partner_name}</h2>
            <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
              <p className="break-words">{partnership.partner_country}{partnerAge ? ` · ${partnerAge} anos` : ''} · {partnership.partner_level}</p>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="shrink-0 whitespace-nowrap font-black tabular-nums text-foreground">OVR {partnerOverall}</span>
                <span aria-hidden="true">·</span>
                <span>Lado {sideName(partnership.partner_position)}</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">você OVR {playerOverall}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <HeroMetric label="Entrosamento" value={chem} hint={chemLabel.label} tone={chemLabel.color} />
          <HeroMetric label="Ranking dupla" value={teamRank?.unranked ? '—' : teamRankLabel} hint={teamRank?.unranked ? 'sem ranking' : teamRank && Number(teamRank.points) > 0 ? `${Number(teamRank.points).toLocaleString('pt-BR')} pts` : 'da dupla'} />
          <HeroMetric label="Contrato" value={status.daysLeft != null && status.daysLeft >= 0 ? `${status.daysLeft}d` : '—'} hint={status.until ? `até ${status.until}` : 'sem data'} />
        </div>
        <ProgressBar value={chem} size="sm" className="mt-2" />

        {sideOk !== null && (
          <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold ${sideOk ? 'text-emerald-400' : 'text-amber-400'}`}>
            {sideOk ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {sideOk ? 'Lados complementares na quadra' : 'Parceiro fora do lado ideal — pode reduzir o rendimento'}
          </p>
        )}
      </section>

      <PartnerAlert alert={alert} />

      {primaryAction && (
        <Button level="primary" size="touch" onClick={() => onPrimary?.(primaryAction.target)} className="w-full sm:w-auto sm:min-w-[16rem] sm:px-8">{primaryAction.label}</Button>
      )}

      {/* Ações de rotina: secundárias, nunca competindo com o primário. */}
      <div className="grid grid-cols-3 gap-2">
        <Button level="ghost" size="sm" onClick={onConverse}><Heart className="h-3.5 w-3.5 text-pink-400" /> Conversar</Button>
        <Button level="ghost" size="sm" onClick={onNegotiate}><Coins className="h-3.5 w-3.5 text-cyan-400" /> Negociar</Button>
        {confirmEnd
          ? <Button level="danger" size="sm" onClick={() => { setConfirmEnd(false); onEnd?.(); }}>Confirmar</Button>
          : <Button level="ghost" size="sm" onClick={() => setConfirmEnd(true)} className="text-red-400"><AlertTriangle className="h-3.5 w-3.5" /> Encerrar</Button>}
      </div>
      {confirmEnd && (
        <p className="text-[11px] text-amber-300" role="status">Encerrar agora desfaz a dupla e pode gerar multa. Toque em "Confirmar" para seguir ou <button type="button" onClick={() => setConfirmEnd(false)} className="font-bold underline">cancelar</button>.</p>
      )}

      <Surface padding="compact">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="text-foreground tabular-nums">{partnership.shared_matches || 0}</strong> partidas</span>
          <span><strong className="text-green-400 tabular-nums">{partnership.shared_wins || 0}</strong> vitórias</span>
          <span><strong className="text-amber-400 tabular-nums">{partnership.shared_titles || 0}</strong> títulos</span>
          <span><strong className="text-cyan-400 tabular-nums">{partnership.prize_split_pct}%</strong> do prêmio</span>
        </p>
      </Surface>

      <CollapsibleSection icon={Sparkles} title="Mais sobre a dupla" description="Confiança, moral, identidade, compatibilidade e objetivos">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProgressBar label={`Confiança · ${trustLabel.label}`} value={trust} valueLabel={`${trust}/100`} size="sm" />
          <ProgressBar label={`Moral · ${moraleLabel.label}`} value={morale} valueLabel={`${morale}/100`} size="sm" />
        </div>
        <div className="rounded-xl bg-primary/5 p-3">
          <p className="text-xs font-black">Identidade: {identity.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{identity.description}</p>
        </div>
        {/* Parte L/N/M — ranking individual pela mesma convenção do header. */}
        <p className="text-xs text-muted-foreground">Seu ranking individual: <strong className="text-foreground">{individualRank ? `#${individualRank.displayRank}` : '…'}</strong> · contrato de {partnership.negotiated_duration_days || 0} dias</p>

        {partnership.compatibility_breakdown && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Compatibilidade inicial</p>
            <div className="space-y-1.5">
              {Object.entries(partnership.compatibility_breakdown).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-24 text-[10px] capitalize text-muted-foreground">{factorLabel(key)}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary/70" style={{ width: `${val}%` }} /></div>
                  <span className="w-8 text-right text-[10px] font-bold tabular-nums">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(partnership.shared_goals || []).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Objetivos compartilhados</p>
            <div className="space-y-2">
              {partnership.shared_goals.map((g) => (
                <div key={g.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs ${g.completed ? 'font-bold text-primary' : 'text-foreground/90'}`}>{g.title}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${g.completed ? 'bg-primary' : 'bg-primary/50'}`} style={{ width: `${Math.min(100, (g.progress / g.target) * 100)}%` }} /></div>
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{g.progress}/{g.target}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(partnership.conversations || []).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Conversas recentes</p>
            <div className="space-y-2">
              {partnership.conversations.slice(-3).reverse().map((conversation, index) => (
                <div key={`${conversation.date}-${index}`} className="rounded-xl bg-secondary/40 px-3 py-2">
                  <div className="flex justify-between gap-2"><p className="text-[10px] font-bold">{conversation.speaker}</p><span className="text-[9px] text-muted-foreground">{conversation.date}</span></div>
                  <p className="mt-1 text-xs text-foreground/90">{conversation.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(partnership.conflicts || []).filter((c) => !c.resolved).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-400">Conflitos pendentes</p>
            {partnership.conflicts.filter((c) => !c.resolved).slice(0, 3).map((c, i) => (
              <div key={i} className="text-xs"><p className="font-semibold">{c.title}</p><p className="text-[10px] text-muted-foreground">{c.description}</p></div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function HeroMetric({ label, value, hint, tone = 'text-foreground' }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/35 px-1.5 py-2">
      <p className={`truncate text-base font-black tabular-nums ${tone}`}>{value}</p>
      <p className="truncate text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
      {hint && <p className="truncate text-[9px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function factorLabel(key) {
  const map = { position: 'Posição', style: 'Estilo', personality: 'Personalidade', level: 'Nível', schedule: 'Agenda', chemistry: 'Química', overall: 'Overall' };
  return map[key] || key;
}
