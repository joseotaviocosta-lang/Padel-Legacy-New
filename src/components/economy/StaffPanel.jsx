import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, BriefcaseBusiness, Building2, ChartNoAxesCombined, CircleDollarSign, GraduationCap,
  Dumbbell, FileText, HeartPulse, LockKeyhole, PanelsTopLeft, RefreshCw,
  Sparkles, TrendingUp, Users, WandSparkles, Zap,
} from 'lucide-react';
import { Button, EmptyState, Surface, SummaryRow, Tabs, TooltipHint } from '@/components/design-system';
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

function QualityBar({ value, potential }) {
  return <div className="space-y-1"><div className="flex justify-between text-[10px]"><span>Qualidade</span><span className="font-black">{value}{potential ? ` / ${potential}` : ''}</span></div><div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>;
}
function EffectPills({ effects = {} }) {
  return <div className="flex flex-wrap gap-1.5">{Object.entries(effects).map(([key, value]) => {
    const direct = ['dailyEnergy', 'dailyFatigue', 'dailyConfidence', 'dailyMorale', 'analysisLevel', 'scoutLevel'].includes(key);
    return <span key={key} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[9px] text-primary">{EFFECT_LABELS[key] || key} {direct ? `+${n(value)}` : `+${Math.round(n(value) * 100)}%`}</span>;
  })}</div>;
}

export default function StaffPanel({ profile, staff, onHire, onFire, onRenew, onUpgradeFacility, busy }) {
  const [view, setView] = useState('team');
  const [roleFilter, setRoleFilter] = useState('all');
  const [confirmFireId, setConfirmFireId] = useState(null);
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
  const activeSynergies = synergies.filter(item => item.active);

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

  return <div className="space-y-5">
    <Surface variant="elevated" className="relative overflow-hidden">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex-1"><div className="flex items-center gap-2"><p className="text-[10px] uppercase tracking-[0.24em] text-primary font-bold">Comissão técnica</p><TooltipHint label="Sobre a comissão" content="Profissionais, instalações e especialidades agora trabalham em conjunto. Monte uma estrutura com identidade própria e ganhos reais." /></div><h2 className="text-2xl font-black mt-1">Estrutura de alta performance</h2></div>
        <div className="grid grid-cols-4 gap-2 min-w-[420px]">
          <div className="rounded-xl bg-secondary/30 p-3"><Users className="h-4 w-4 text-primary" /><p className="text-[9px] uppercase text-muted-foreground mt-2">Vagas</p><p className="font-black text-lg">{occupiedSlots}/{totalSlots}</p></div>
          <div className="rounded-xl bg-secondary/30 p-3"><CircleDollarSign className="h-4 w-4 text-amber-400" /><p className="text-[9px] uppercase text-muted-foreground mt-2">Folha</p><p className="font-black text-lg">{coins(monthlyCost)}</p></div>
          <div className="rounded-xl bg-secondary/30 p-3"><Building2 className="h-4 w-4 text-cyan-400" /><p className="text-[9px] uppercase text-muted-foreground mt-2">Estrutura</p><p className="font-black text-lg">{facilities.reduce((sum, item) => sum + item.level, 0)}</p></div>
          <div className="rounded-xl bg-secondary/30 p-3"><Zap className="h-4 w-4 text-purple-400" /><p className="text-[9px] uppercase text-muted-foreground mt-2">Sinergias</p><p className="font-black text-lg">{activeSynergies.length}</p></div>
        </div>
      </div>
    </Surface>

    <Tabs tabs={tabs} activeTab={view} onTabChange={setView} variant="buttons" />

    {view === 'team' && <Surface>
      <div className="mb-4"><h3 className="font-black flex items-center gap-2"><WandSparkles className="h-4 w-4 text-primary" /> Sua comissão</h3><p className="text-[10px] text-muted-foreground mt-1">Acompanhe evolução, satisfação e vencimento dos contratos.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {principalCoachActive && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3"><div className="flex items-start gap-3"><div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center"><GraduationCap className="h-5 w-5 text-primary" /></div><div className="flex-1"><p className="font-bold">{profile.coach_name || 'Treinador principal'}</p><p className="text-[10px] text-muted-foreground">Líder da comissão · orientação técnica da dupla</p><p className="text-[9px] text-muted-foreground mt-1">{profile?.coach_paid_by_club ? 'Custeado pelo clube' : `${coins(profile?.coach_monthly_salary)} moedas/mês`} · contrato até {profile?.coach_contract_end_date || 'fim da temporada'}</p></div><span className="rounded-full bg-primary/15 px-2 py-1 text-[9px] font-bold text-primary">Obrigatório</span></div><div className="grid grid-cols-3 gap-2 text-[9px]"><div className="rounded-lg bg-secondary/30 p-2"><p className="text-muted-foreground">Confiança</p><p className="font-bold">{profile?.coach_trust ?? 55}/100</p></div><div className="rounded-lg bg-secondary/30 p-2"><p className="text-muted-foreground">Afinidade</p><p className="font-bold">{profile?.coach_affinity ?? 50}/100</p></div><div className="rounded-lg bg-secondary/30 p-2"><p className="text-muted-foreground">Entendimento</p><p className="font-bold">{profile?.coach_tactical_understanding ?? 25}/100</p></div></div><Link to="/coaches" className="block w-full rounded-xl bg-primary/15 py-2 text-center text-xs font-bold text-primary">Gerenciar treinador principal</Link></div>}
        {activeStaff.map(member => {
          const role = STAFF_ROLE_DEFINITIONS[member.staff_type]; const Icon = getStaffIcon(role?.icon); const remaining = daysUntil(member.contract_end_date, profile?.career_date);
          return <div key={member.id || member.staff_id} className="rounded-2xl border border-border/50 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-start gap-3"><div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div><div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{member.staff_name}</p><p className="text-[10px] text-muted-foreground">{member.role_name} · {member.specialty_name}</p><p className="text-[9px] text-muted-foreground">{member.personality} · {member.age} anos</p></div><span className="text-[9px] px-2 py-1 rounded-full bg-secondary/50">Nv. {member.staff_level}</span></div>
            <QualityBar value={member.quality} potential={member.potential} />
            {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.12): a grade de 3
                blocos com padding próprio vira uma linha compacta. */}
            <SummaryRow items={[
              { label: 'Satisfação', value: `${member.satisfaction}/100` },
              { label: 'Salário', value: coins(member.monthly_cost) },
              { label: 'Contrato', value: remaining == null ? 'Sem data' : remaining < 0 ? 'Vencido' : `${remaining}d` },
            ]} />
            <EffectPills effects={member.effects} />
            <div className="flex gap-2">
              <Button level="ghost" size="sm" disabled={busy || !onRenew} onClick={() => onRenew?.(member, 12)} className="flex-1 bg-primary/15 text-primary">Renovar 12 meses</Button>
              {confirmFireId === member.id
                ? <Button level="danger" size="sm" disabled={busy} onClick={() => handleFireClick(member)}>Confirmar demissão</Button>
                : <Button level="ghost" size="sm" disabled={busy} onClick={() => handleFireClick(member)} className="border border-red-500/20 text-red-400">Demitir</Button>}
            </div>
          </div>;
        })}
      </div>
      {!principalCoachActive && activeStaff.length === 0 && <EmptyState icon={Users} title="Comissão vazia" description="Contrate profissionais no mercado mensal." />}
    </Surface>}

    {view === 'market' && <div className="space-y-4">
      <Surface><div className="flex flex-col md:flex-row md:items-center gap-3"><div className="flex-1"><h3 className="font-black">Mercado de profissionais</h3><p className="text-xs text-muted-foreground mt-1">A disponibilidade e os salários mudam a cada mês da carreira.</p></div><select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="glass rounded-xl px-3 py-2 text-xs"><option value="all">Todas as funções</option>{Object.values(STAFF_ROLE_DEFINITIONS).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div></Surface>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{available.map(candidate => {
        const role = STAFF_ROLE_DEFINITIONS[candidate.roleId]; const Icon = getStaffIcon(role?.icon); const locked = n(profile?.career_level, 1) < candidate.minCareerLevel; const noSlot = occupiedSlots >= totalSlots;
        return <Surface key={candidate.id} className={!candidate.available ? 'opacity-60' : ''}><div className="space-y-3"><div className="flex items-start gap-3"><div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div><div className="flex-1"><div className="flex items-center gap-2"><p className="font-black text-sm">{candidate.name}</p>{candidate.recommended && <Sparkles className="h-3.5 w-3.5 text-amber-400" />}</div><p className="text-[10px] text-muted-foreground">{candidate.roleName} · {candidate.specialtyName}</p><p className="text-[9px] text-muted-foreground">{candidate.personality} · {candidate.age} anos</p></div><span className={`text-[9px] border rounded-full px-2 py-1 ${TIER_CLASS[candidate.tier]}`}>{candidate.tier}</span></div><QualityBar value={candidate.quality} potential={candidate.potential} /><p className="text-xs text-muted-foreground">{candidate.summary}</p><EffectPills effects={candidate.effects} /><div className="flex items-center justify-between text-xs"><span className="font-bold">{coins(candidate.monthlyCost)} / mês</span><span className="text-muted-foreground">Demanda {candidate.demand}%</span></div>{!candidate.available && <p className="text-[10px] text-amber-400">{candidate.unavailableReason}</p>}<Button level="primary" disabled={busy || locked || noSlot || !candidate.available} onClick={() => onHire(candidate)} className="w-full">{locked ? <><LockKeyhole className="h-3 w-3" /> Experiência {candidate.minCareerLevel}</> : noSlot ? 'Sem vagas disponíveis' : candidate.available ? 'Contratar por 12 meses' : 'Indisponível'}</Button></div></Surface>;
      })}</div>
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
