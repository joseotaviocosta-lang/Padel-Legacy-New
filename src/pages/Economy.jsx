import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Wallet, Star, Building2, TrendingUp, Receipt, ClipboardCheck, Coins, Users } from 'lucide-react';
import { LoadingScreen } from '@/components/padel/ui';
import { PageHeader, StatCard, StatusBadge } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { buyProperty, sellProperty, makeInvestment, withdrawInvestment } from '@/lib/economy';
import { signSponsorContract, renewContract, terminateSponsorContract } from '@/lib/sponsors';
import EconomyDashboard from '@/components/economy/EconomyDashboard';
import SponsorPanel from '@/components/economy/SponsorPanel';
import PropertyPanel from '@/components/economy/PropertyPanel';
import InvestmentPanel from '@/components/economy/InvestmentPanel';
import FinancialFlow from '@/components/economy/FinancialFlow';
import OpportunityPanel from '@/components/economy/OpportunityPanel';
import ModuleErrorBoundary from '@/components/system/ModuleErrorBoundary';
import { evaluateSponsorContracts, getSponsorEvaluationStatus, completeCareerOpportunity } from '@/game-core';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Wallet },
  { id: 'sponsors', label: 'Patrocinadores', icon: Star },
  { id: 'properties', label: 'Imóveis', icon: Building2 },
  { id: 'investments', label: 'Investimentos', icon: TrendingUp },
  { id: 'flow', label: 'Fluxo', icon: Receipt },
  { id: 'opportunities', label: 'Oportunidades', icon: Wallet },
];

export default function Economy() {
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => TABS.some((item) => item.id === searchParams.get('view')) ? searchParams.get('view') : 'dashboard');
  const [busy, setBusy] = useState(null);
  const [sponsorReport, setSponsorReport] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const requestedView = searchParams.get('view');
    if (TABS.some((item) => item.id === requestedView)) setTab(requestedView);
  }, [searchParams]);

  async function load() {
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      if (p) {
        const [c, s, props, invs, txs] = await Promise.all([
          localGame.entities.PlayerContract.filter({ profile_id: p.id, is_active: true }),
          localGame.entities.PlayerStaffHire.filter({ profile_id: p.id }),
          localGame.entities.PlayerProperty.filter({ profile_id: p.id }),
          localGame.entities.PlayerInvestment.filter({ profile_id: p.id }),
          localGame.entities.FinancialTransaction.filter({ profile_id: p.id }),
        ]);
        setContracts(c || []);
        setStaff(s || []);
        setProperties(props || []);
        setInvestments(invs || []);
        setTransactions((txs || []).sort((a, b) => (b.month || '').localeCompare(a.month || '')));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function refresh(profileId) {
    const [c, s, props, invs, txs] = await Promise.all([
      localGame.entities.PlayerContract.filter({ profile_id: profileId, is_active: true }),
      localGame.entities.PlayerStaffHire.filter({ profile_id: profileId }),
      localGame.entities.PlayerProperty.filter({ profile_id: profileId }),
      localGame.entities.PlayerInvestment.filter({ profile_id: profileId }),
      localGame.entities.FinancialTransaction.filter({ profile_id: profileId }),
    ]);
    setContracts(c || []);
    setStaff(s || []);
    setProperties(props || []);
    setInvestments(invs || []);
    setTransactions((txs || []).sort((a, b) => (b.month || '').localeCompare(a.month || '')));
  }

  async function handle(action, fn, successMsg) {
    setBusy(action);
    try {
      const updated = await fn();
      if (updated) setProfile(updated);
      if (profile) await refresh(profile.id);
      toast({ title: successMsg });
    } catch (e) {
      toast({ title: 'Erro', description: e.message || 'Algo deu errado', variant: 'destructive' });
    } finally { setBusy(null); }
  }


  async function handleOpportunity(opportunity) {
    const action = `opportunity-${opportunity.id}`;
    setBusy(action);
    try {
      const result = await completeCareerOpportunity(profile, opportunity.id);
      setProfile(result.profile);
      await refresh(profile.id);
      toast({
        title: 'Atividade concluída',
        description: `Você recebeu ${result.reward.toLocaleString('pt-BR')} moedas.`,
      });
    } catch (e) {
      toast({ title: 'Atividade indisponível', description: e.message || 'Não foi possível concluir.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }


  async function handleSponsorEvaluation() {
    setBusy('sponsor-evaluation');
    try {
      const result = await evaluateSponsorContracts(profile);
      setSponsorReport(result);
      if (result.profile) setProfile(result.profile);
      await refresh(profile.id);
      toast({
        title: 'Avaliação concluída',
        description: `Ajuste do mês: ${result.totalAdjustment >= 0 ? '+' : ''}${result.totalAdjustment.toLocaleString('pt-BR')} moedas.`,
      });
    } catch (e) {
      toast({ title: 'Erro na avaliação', description: e.message || 'Não foi possível avaliar os contratos.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!profile) return <div className="p-6 text-center text-muted-foreground">Crie seu perfil primeiro.</div>;

  const activeStaff = staff.filter((member) => member.is_active !== false && member.contract_status !== 'expired');
  const monthlyStaffCost = activeStaff.reduce((sum, member) => sum + (Number(member.monthly_salary) || 0), 0);
  const monthlySponsorIncome = contracts.reduce((sum, contract) => sum + (Number(contract.monthly_payment || contract.monthly_value) || 0), 0);
  const investmentTotal = investments.reduce((sum, investment) => sum + (Number(investment.current_value || investment.amount) || 0), 0);

  return (
    <div className="px-4 md:px-8 py-5 md:py-6 max-w-6xl mx-auto space-y-5 animate-fade-in">
      <PageHeader
        icon={Wallet}
        eyebrow="Gestão da carreira"
        title="Economia e patrimônio"
        description="Acompanhe caixa, contratos, equipe, investimentos e oportunidades sem perder o controle da carreira esportiva."
        tone="premium"
        breadcrumb={['Gestão', 'Economia']}
        action={<StatusBadge tone={(Number(profile.coins) || 0) >= monthlyStaffCost ? 'success' : 'warning'} icon={Coins}>{(Number(profile.coins) || 0).toLocaleString('pt-BR')} moedas</StatusBadge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo" value={(Number(profile.coins) || 0).toLocaleString('pt-BR')} detail="Disponível para decisões" icon={Coins} tone="premium" />
        <StatCard label="Patrocínios/mês" value={monthlySponsorIncome.toLocaleString('pt-BR')} detail={`${contracts.length} contrato(s) ativo(s)`} icon={Star} tone="success" />
        <StatCard label="Equipe/mês" value={monthlyStaffCost.toLocaleString('pt-BR')} detail={`${activeStaff.length} profissional(is)`} icon={Users} tone="warning" />
        <StatCard label="Investimentos" value={investmentTotal.toLocaleString('pt-BR')} detail={`${investments.length} posição(ões)`} icon={TrendingUp} tone="info" />
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-2xl border border-border/50 bg-background/90 p-1.5 shadow-sm backdrop-blur-xl scrollbar-none">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && (
        <EconomyDashboard profile={profile} contracts={contracts} staff={staff} properties={properties} investments={investments} />
      )}
      {tab === 'sponsors' && (
        <div className="space-y-4">
          {contracts.length > 0 && (() => {
            const status = getSponsorEvaluationStatus(contracts, profile.career_date);
            return (
              <div className="glass rounded-2xl p-4 border border-primary/20">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">Avaliação mensal · {status.month}</p>
                    <p className="text-xs text-muted-foreground">
                      {status.pendingCount > 0
                        ? `${status.pendingCount} contrato(s) aguardando análise de metas e desempenho.`
                        : 'Todos os contratos ativos já foram avaliados neste mês.'}
                    </p>
                  </div>
                  <button
                    onClick={handleSponsorEvaluation}
                    disabled={busy === 'sponsor-evaluation' || status.pendingCount === 0}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
                  >
                    {busy === 'sponsor-evaluation' ? 'Avaliando...' : 'Avaliar contratos'}
                  </button>
                </div>
                {sponsorReport && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                    {sponsorReport.reports.map((report) => (
                      <div key={report.contract_id} className="flex items-center justify-between text-xs">
                        <span>{report.sponsor_name}</span>
                        <span className={report.terminated ? 'text-red-400 font-bold' : 'text-muted-foreground'}>
                          {report.skipped ? 'Já avaliado' : report.terminated ? 'Contrato encerrado' : `Satisfação ${report.satisfaction}/100 · ${report.adjustment >= 0 ? '+' : ''}${report.adjustment}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          <ModuleErrorBoundary moduleName="Patrocinadores"><SponsorPanel
          profile={profile}
          contracts={contracts}
          onSign={(s) => handle('sign', () => signSponsorContract(profile, s), `Contrato assinado com ${s.name}!`)}
          onRenew={(c, s) => handle('renew', () => renewContract(c, s, profile), `Contrato renovado com ${s.name}!`)}
          onTerminate={(c) => handle('terminate', () => terminateSponsorContract(c), 'Contrato rescindido')}
          busy={busy}
          /></ModuleErrorBoundary>
        </div>
      )}
      {tab === 'properties' && (
        <PropertyPanel
          profile={profile}
          properties={properties}
          onBuy={(p) => handle('buy', () => buyProperty(profile, p), `${p.name} adquirido!`)}
          onSell={(p) => handle('sell', () => sellProperty(profile, p), `${p.property_name} vendido!`)}
          busy={busy}
        />
      )}
      {tab === 'investments' && (
        <InvestmentPanel
          profile={profile}
          investments={investments}
          onInvest={(inv, amt) => handle('invest', () => makeInvestment(profile, inv, amt), `Investimento de ${amt.toLocaleString('pt-BR')} em ${inv.name}!`)}
          onWithdraw={(inv) => handle('withdraw', () => withdrawInvestment(profile, inv), `Resgate de ${inv.amount.toLocaleString('pt-BR')} realizado!`)}
          busy={busy}
        />
      )}
      {tab === 'flow' && <FinancialFlow transactions={transactions} />}
      {tab === 'opportunities' && (
        <OpportunityPanel profile={profile} onComplete={handleOpportunity} busy={busy} />
      )}
    </div>
  );
}
