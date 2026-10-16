import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, BriefcaseBusiness, Building2, ChartNoAxesCombined, GraduationCap,
  Dumbbell, FileText, HeartPulse, LockKeyhole, PanelsTopLeft, RefreshCw,
  Sparkles, TrendingUp, Users, WandSparkles, Zap,
} from 'lucide-react';
import { Button, EmptyState, Surface, SummaryRow, Tabs } from '@/components/design-system';
import {
  STAFF_ROLE_DEFINITIONS, getStaffIcon, getStaffMarketForMonth, getStaffSlots,
  normalizeStaffMember,
} from '@/lib/staffCatalog';
import {
  getActiveStaffSynergies, getFacilitySummary,
} from '@/lib/staffFacilities';
import { getStaffWeeklyRecommendations } from '@/game-core/staffLifecycle';

function n(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function coins(value) { return n(value).toLocaleString('pt-BR'); }
function daysUntil(date, currentDate) {
  if (!date) return null;
  return Math.ceil((new Date(`${date}T12:00:00`) - new Date(`${currentDate || '2026-01-01'}T12:00:00`)) / 86400000);
}

const TIER_CLASS = {
  Formação: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
  Regional: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  Profissional: 'text-purple-300 bg-purple-500/10 border-purple-500/20',
  Elite: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
};
const EFFECT_LABELS = {
  allTraining: 'Todos os treinos', courtTraining: 'Quadra', physicalTraining: 'Físico', mentalTraining: 'Mental', tacticalTraining: 'Tático',
  dailyEnergy: 'Energia diária', dailyFatigue: 'Redução de fadiga', injuryReduction: 'Prevenção', trainingEnergyReduction: 'Economia de energia',
  sponsorBonus: 'Negociação', expenseReduction: 'Despesas', dailyConfidence: 'Confiança', dailyMorale: 'Moral', analysisLevel: 'Análise', scoutLevel: 'Scout',
};
const FACILITY_ICONS = { courts: PanelsTopLeft, gym: Dumbbell, recovery: HeartPulse, analysis: ChartNoAxesCombined, office: Building2 };

function EffectPills({ effects = {} }) {
  return <div className="flex flex-wrap gap-1.5">{Object.entries(effects).map(([key, value]) => {
    const direct = ['dailyEnergy', 'dailyFatigue', 'dailyConfidence', 'dailyMorale', 'analysisLevel', 'scoutLevel'].includes(key);
    return <span key={key} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[9px] text-primary">{EFFECT_LABELS[key] || key} {direct ? `+${n(value)}` : `+${Math.round(n(value) * 100)}%`}</span>;
  })}</div>;
}

export default function StaffPanel({ profile, staff, onHire, onFire, onRenew, onUpgradeFacility, busy, initialView = 'team' }) {
  const [view, setView] = useState(initialView);
  const [roleFilter, setRoleFilter] = useState('all');
  const [confirmFireId, setConfirmFireId] = useState(null);
  const [marketVisible, setMarketVisible] = useState(6);
  useEffect(() => { setMarketVisible(6); }, [roleFilter]);
  const activeStaff = useMemo(() => (staff || []).filter(Boolean).map(normalizeStaffMember).filter(member => !['terminated', 'expired'].includes(member.contract_status)), [staff]);
  const principalCoachActive = Boolean(profile?.coach_id && profile?.coach_contract_status !== 'terminated');
  const totalSlots = getStaffSlots(profile?.career_level || 1);
  const occupiedSlots = activeStaff.length;
  const monthlyCost = activeStaff.reduce((sum, member) => sum + n(member.monthly_cost), 0) + (principalCoachActive ? n(profile?.coach_monthly_salary) : 0);
  const market = useMemo(() => getStaffMarketForMonth(profile?.career_date, profile), [profile?.career_date, profile?.career_level, profile?.id]);
  const hiredRoles = new Set(activeStaff.map(member => member.staff_type));
  const available = market.filter(candidate => (roleFilter === 'all' || candidate.roleId === roleFilter) && !hiredRoles.has(candidate.roleId));
  const facilities = useMemo(() => getFacilitySummary(profile), [profile?.staff_facilities, profile?.career_level, profile?.coins]);
  const synergies = useMemo(() => getActiveStaffSynergies(profile, activeStaff), [profile?.staff_facilities, activeStaff]);
  const snapshot = { staff: activeStaff, types: activeStaff.map(s => s.staff_type), monthlyCost, synergies, facilityEffects: {} };
  const recommendations = getStaffWeeklyRecommendations(profile, snapshot);

  const tabs = [
    { key: 'team', label: 'Minha comissão', icon: Users },
    { key: 'market', label: 'Mercado mensal', icon: BriefcaseBusiness },
    { key: 'facilities', label: 'Instalações', icon: Building2 },
    { key: 'synergies', label: 'Sinergias', icon: Zap },
    { key: 'reports', label: 'Relatórios', icon: FileText },
  ];

  function handleFireClick(member) {
    if (confirmFireId === member.id) { setConfirmFireId(null); onFire(member); }
    else setConfirmFireId(member.id);
  }

  return <div className="space-y-3">
    <Tabs tabs={tabs} activeTab={view} onTabChange={setView} variant="buttons" />

    {/* Fase 5.31 — MINHA COMISSÃO como posições: quem trabalha comigo, em que
        função, com qual efeito, quanto custa e se há vaga. Antes: cartões
        altos com barra, 3 métricas, pílulas e 2 botões cada; vagas livres
        não apareciam. Ações de contrato continuam as mesmas. */}
    {view === 'team' && <Surface padding="compact" className="space-y-2" data-staff-team>
      {/* Vagas e folha já estão no HUD da página — não repetir aqui. */}
      <h3 className="flex items-center gap-2 text-sm font-black"><WandSparkles className="h-4 w-4 text-primary" /> Sua comissão</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {principalCoachActive ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" data-staff-position="coach">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15"><GraduationCap className="h-4 w-4 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{profile.coach_name || 'Treinador principal'}</p>
                <p className="truncate text-[11px] text-muted-foreground">Líder da comissão · {profile?.coach_paid_by_club ? 'custeado pelo clube' : `${coins(profile?.coach_monthly_salary)}/mês`}</p>
                <p className="truncate text-[10px] text-muted-foreground">Contrato até {profile?.coach_contract_end_date || 'fim da temporada'} · confiança {profile?.coach_trust ?? 55}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary">Obrigatório</span>
            </div>
            <Link to="/coaches" className="mt-2 block text-center text-[11px] font-bold text-primary">Gerenciar treinador principal</Link>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3" data-staff-position="coach-empty">
            <p className="text-sm font-bold">Treinador principal · vaga aberta</p>
            <p className="text-[11px] text-muted-foreground">Obrigatório para liderar a comissão. Contratado na aba Treinador, sem ocupar vaga daqui.</p>
            <Link to="/coaches" className="mt-1.5 block text-[11px] font-bold text-primary">Escolher treinador principal</Link>
          </div>
        )}
        {activeStaff.map(member => {
          const role = STAFF_ROLE_DEFINITIONS[member.staff_type]; const Icon = getStaffIcon(role?.icon); const remaining = daysUntil(member.contract_end_date, profile?.career_date);
          const [mainEffect] = Object.entries(member.effects || {});
          return <div key={member.id || member.staff_id} className="rounded-xl border border-border/50 bg-secondary/20 p-3" data-staff-position="member">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{member.staff_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{member.role_name} · {member.specialty_name} · Nv. {member.staff_level}</p>
                <p className="truncate text-[11px]"><strong>{coins(member.monthly_cost)}</strong><span className="text-muted-foreground">/mês · </span><span className={remaining != null && remaining <= 30 ? 'font-bold text-amber-300' : 'text-muted-foreground'}>{remaining == null ? 'sem data' : remaining < 0 ? 'contrato vencido' : `${remaining} dias restantes`}</span></p>
              </div>
              <span className="shrink-0 text-right text-[10px] text-muted-foreground"><strong className="block text-sm text-foreground tabular-nums">{member.quality}</strong>qualid.</span>
            </div>
            {mainEffect && <div className="mt-2"><EffectPills effects={Object.fromEntries([mainEffect])} /></div>}
            <SummaryRow className="mt-1.5 text-[10px]" items={[{ label: 'Satisfação', value: `${member.satisfaction}/100` }, { label: 'Potencial', value: member.potential }]} />
            <div className="mt-2 flex gap-2">
              <Button level="ghost" size="sm" disabled={busy || !onRenew} onClick={() => onRenew?.(member, 12)} className="flex-1 text-primary">Renovar 12 meses</Button>
              {confirmFireId === member.id
                ? <Button level="danger" size="sm" disabled={busy} onClick={() => handleFireClick(member)}>Confirmar demissão</Button>
                : <Button level="ghost" size="sm" disabled={busy} onClick={() => handleFireClick(member)} className="text-red-400">Demitir</Button>}
            </div>
          </div>;
        })}
        {Array.from({ length: Math.max(0, totalSlots - occupiedSlots) }).slice(0, 3).map((_, index) => (
          <button key={`free-${index}`} type="button" onClick={() => setView('market')} data-staff-position="free" className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 p-3 text-left hover:bg-secondary/20">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/40"><Users className="h-4 w-4 text-muted-foreground" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Vaga livre</span><span className="block truncate text-[11px] text-muted-foreground">Fisioterapia, preparação, análise e mais no mercado</span></span>
            <span className="shrink-0 text-[11px] font-bold text-primary">Ver mercado</span>
          </button>
        ))}
      </div>
      {!principalCoachActive && activeStaff.length === 0 && totalSlots === 0 && <EmptyState icon={Users} title="Comissão vazia" description="Contrate profissionais no mercado mensal." />}
    </Surface>}

    {/* Fase 5.31 — mercado em cartões compactos: função, nível, efeito
        principal e custo, com UMA ação. Mesmos candidatos e regras. */}
    {view === 'market' && <div className="space-y-3" data-staff-market>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">Disponibilidade e salários mudam a cada mês · {available.length} profissiona{available.length === 1 ? 'l' : 'is'}.</p>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filtrar função" className="min-h-9 max-w-[45%] shrink-0 rounded-xl border border-border/60 bg-background/70 px-2 text-xs font-bold"><option value="all">Todas as funções</option>{Object.values(STAFF_ROLE_DEFINITIONS).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{available.slice(0, marketVisible).map(candidate => {
        const role = STAFF_ROLE_DEFINITIONS[candidate.roleId]; const Icon = getStaffIcon(role?.icon); const locked = n(profile?.career_level, 1) < candidate.minCareerLevel; const noSlot = occupiedSlots >= totalSlots;
        const mainEffects = Object.fromEntries(Object.entries(candidate.effects || {}).slice(0, 2));
        return <article key={candidate.id} data-staff-candidate className={`glass rounded-2xl p-3 ${!candidate.available ? 'opacity-60' : ''}`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-sm font-black">{candidate.name}</p>{candidate.recommended && <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Recomendado" />}</div>
              <p className="truncate text-[11px] text-muted-foreground">{candidate.roleName} · {candidate.specialtyName}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${TIER_CLASS[candidate.tier]}`}>{candidate.tier}</span>
          </div>
          <div className="mt-2"><EffectPills effects={mainEffects} /></div>
          <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">{candidate.summary}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 text-xs"><strong>{coins(candidate.monthlyCost)}</strong><span className="text-muted-foreground"> /mês · qualidade {candidate.quality}{candidate.potential ? `/${candidate.potential}` : ''}</span></p>
            <span className="shrink-0 text-[10px] text-muted-foreground">Demanda {candidate.demand}%</span>
          </div>
          {!candidate.available && <p className="mt-1 text-[10px] text-amber-400">{candidate.unavailableReason}</p>}
          <Button level="secondary" size="sm" disabled={busy || locked || noSlot || !candidate.available} onClick={() => onHire(candidate)} className="mt-2 w-full text-primary">{locked ? <><LockKeyhole className="h-3 w-3" /> Experiência {candidate.minCareerLevel}</> : noSlot ? 'Sem vagas disponíveis' : candidate.available ? 'Contratar por 12 meses' : 'Indisponível'}</Button>
        </article>;
      })}</div>
      {/* 5.31: mesma paginação do mercado de técnicos (antes: todos de uma vez, ~8.700px no celular). */}
      {available.length > marketVisible && <Button level="ghost" size="sm" onClick={() => setMarketVisible((count) => count + 6)} className="mx-auto flex border border-border/60">Mostrar mais ({available.length - marketVisible} restantes)</Button>}
    </div>}

    {view === 'facilities' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {facilities.map(facility => {
        const Icon = FACILITY_ICONS[facility.id] || Building2;
        const maxed = facility.level >= facility.maxLevel;
        const canAfford = n(profile?.coins) >= n(facility.upgradeCost);
        return <Surface key={facility.id}><div className="space-y-4"><div className="flex items-start gap-3"><div className="h-11 w-11 rounded-xl bg-cyan-500/10 flex items-center justify-center"><Icon className="h-5 w-5 text-cyan-300" /></div><div className="flex-1"><h3 className="font-black text-sm">{facility.name}</h3><p className="text-[10px] text-muted-foreground mt-1">{facility.description}</p></div><span className="rounded-full bg-secondary/50 px-2 py-1 text-[9px] font-bold">Nível {facility.level}/{facility.maxLevel}</span></div><div className="grid grid-cols-5 gap-1">{Array.from({ length: facility.maxLevel }).map((_, index) => <div key={index} className={`h-2 rounded-full ${index < facility.level ? 'bg-cyan-400' : 'bg-secondary/60'}`} />)}</div><EffectPills effects={Object.fromEntries(Object.entries(facility.effectsPerLevel || {}).map(([key, value]) => [key, value * Math.max(1, facility.level)]))} /><Button level="primary" disabled={busy || maxed || !facility.unlocked || !canAfford} onClick={() => onUpgradeFacility?.(facility)} className="w-full">{maxed ? 'Nível máximo' : !facility.unlocked ? `Experiência ${facility.minCareerLevel}` : !canAfford ? `Faltam moedas · ${coins(facility.upgradeCost)}` : `Melhorar por ${coins(facility.upgradeCost)}`}</Button></div></Surface>;
      })}
    </div>}

    {view === 'synergies' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {synergies.map(synergy => <Surface key={synergy.id} className={synergy.active ? 'border border-purple-400/30 bg-purple-500/5' : 'opacity-75'}><div className="space-y-3"><div className="flex items-center gap-3"><div className={`h-10 w-10 rounded-xl flex items-center justify-center ${synergy.active ? 'bg-purple-500/15' : 'bg-secondary/40'}`}><Zap className={`h-5 w-5 ${synergy.active ? 'text-purple-300' : 'text-muted-foreground'}`} /></div><div><p className="font-black text-sm">{synergy.name}</p><p className={`text-[10px] font-bold ${synergy.active ? 'text-purple-300' : 'text-muted-foreground'}`}>{synergy.active ? 'ATIVA' : 'INCOMPLETA'}</p></div></div><p className="text-xs text-muted-foreground">{synergy.description}</p><EffectPills effects={synergy.effects} />{!synergy.active && synergy.missing.length > 0 && <div className="rounded-xl bg-secondary/25 p-3"><p className="text-[9px] uppercase font-bold text-muted-foreground">Falta para ativar</p><p className="text-[10px] mt-1">{synergy.missing.join(' · ')}</p></div>}</div></Surface>)}
    </div>}

    {view === 'reports' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Surface><h3 className="font-black flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Recomendações da semana</h3><div className="mt-4 space-y-3">{recommendations.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl bg-secondary/25 p-3"><div className="flex gap-2"><BadgeCheck className={`h-4 w-4 shrink-0 ${item.priority === 'high' ? 'text-red-400' : item.priority === 'medium' ? 'text-amber-400' : 'text-primary'}`} /><div><p className="text-xs font-bold">{item.title}</p><p className="text-[10px] text-muted-foreground mt-1">{item.body}</p></div></div></div>)}</div></Surface>
      <Surface><h3 className="font-black flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Evolução profissional</h3><p className="text-xs text-muted-foreground mt-2">A cada virada de mês, profissionais ativos acumulam experiência e podem aumentar a qualidade até o potencial individual.</p><div className="mt-4 space-y-2">{activeStaff.map(member => <div key={member.id} className="flex items-center justify-between rounded-xl bg-secondary/25 p-3"><div><p className="text-xs font-bold">{member.staff_name}</p><p className="text-[9px] text-muted-foreground">{member.staff_xp} XP profissional</p></div><div className="text-right"><p className="text-xs font-black">Nv. {member.staff_level}</p><p className="text-[9px] text-muted-foreground">Potencial {member.potential}</p></div></div>)}</div></Surface>
      <Surface className="lg:col-span-2"><h3 className="font-black flex items-center gap-2"><RefreshCw className="h-4 w-4 text-primary" /> Poder de negociação</h3><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3"><div className="rounded-xl bg-secondary/25 p-3"><p className="text-[9px] uppercase text-muted-foreground">Bônus comercial</p><p className="text-xl font-black text-primary">+{Math.round(n(profile?.staff_bonus_manager) * 100)}%</p></div><div className="rounded-xl bg-secondary/25 p-3"><p className="text-[9px] uppercase text-muted-foreground">Redução de despesas</p><p className="text-xl font-black text-primary">-{Math.round(n(profile?.staff_bonus_accountant) * 100)}%</p></div><div className="rounded-xl bg-secondary/25 p-3"><p className="text-[9px] uppercase text-muted-foreground">Força de negociação</p><p className="text-xl font-black text-primary">{Math.round(n(profile?.staff_negotiation_power) * 100)}%</p></div></div></Surface>
    </div>}
  </div>;
}
