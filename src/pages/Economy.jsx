import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Wallet, Star, Users, Building2, TrendingUp, Receipt, ClipboardCheck } from 'lucide-react';
import { LoadingScreen } from '@/components/padel/ui';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { hireStaff, fireStaff, buyProperty, sellProperty, makeInvestment, withdrawInvestment } from '@/lib/economy';
import { signSponsorContract, renewContract, terminateSponsorContract } from '@/lib/sponsors';
import EconomyDashboard from '@/components/economy/EconomyDashboard';
import SponsorPanel from '@/components/economy/SponsorPanel';
import StaffPanel from '@/components/economy/StaffPanel';
import PropertyPanel from '@/components/economy/PropertyPanel';
import InvestmentPanel from '@/components/economy/InvestmentPanel';
import FinancialFlow from '@/components/economy/FinancialFlow';
import OpportunityPanel from '@/components/economy/OpportunityPanel';
import { evaluateSponsorContracts, getSponsorEvaluationStatus, completeCareerOpportunity } from '@/game-core';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Wallet },
  { id: 'sponsors', label: 'Patrocinadores', icon: Star },
  { id: 'staff', label: 'Equipe', icon: Users },
  { id: 'properties', label: 'Imóveis', icon: Building2 },
  { id: 'investments', label: 'Investimentos', icon: TrendingUp },
  { id: 'flow', label: 'Fluxo', icon: Receipt },
  { id: 'opportunities', label: 'Oportunidades', icon: Wallet },
];

export default function Economy() {
  const [profile, setProfile] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [busy, setBusy] = useState(null);
  const [sponsorReport, setSponsorReport] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

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

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
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
          <SponsorPanel
          profile={profile}
          contracts={contracts}
          onSign={(s) => handle('sign', () => signSponsorContract(profile, s), `Contrato assinado com ${s.name}!`)}
          onRenew={(c, s) => handle('renew', () => renewContract(c, s, profile), `Contrato renovado com ${s.name}!`)}
          onTerminate={(c) => handle('terminate', () => terminateSponsorContract(c), 'Contrato rescindido')}
          busy={busy}
          />
        </div>
      )}
      {tab === 'staff' && (
        <StaffPanel
          staff={staff}
          onHire={(st) => handle('hire', () => hireStaff(profile, st), `${st.name} contratado!`)}
          onFire={(s) => handle('fire', () => fireStaff(s), `${s.staff_name} demitido`)}
          busy={busy}
        />
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