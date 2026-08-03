import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, TrendingUp, TrendingDown, Minus, Globe2, Users, Banknote, Activity, Eye, Star, X, ShieldAlert, Target, Handshake, Send } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { LoadingScreen, PageHeader, GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { evolveWorldMarket, getWorldMarketSnapshot, getPlayerScoutingReports, getScoutingLevels, scoutAthlete, toggleShortlist, getNegotiationPreview, submitPartnerOffer } from '@/game-core';
import { useToast } from '@/components/ui/use-toast';
import { safeModuleTask } from '@/lib/moduleLoading';

const STATUS_LABELS = { livre: 'Livre', contratado: 'Contratado', lesionado: 'Lesionado', aposentado: 'Aposentado' };
const RECOMMENDATION_LABELS = { prioridade: 'Prioridade', acompanhar: 'Acompanhar', cautela: 'Cautela' };

function formatMoney(value) { return Number(value || 0).toLocaleString('pt-BR'); }
function TrendIcon({ trend }) {
  if (trend === 'subindo') return <TrendingUp className="h-4 w-4 text-green-400" />;
  if (trend === 'caindo') return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}
function Range({ min, max }) { return <span>{Number(min) || 0}–{Number(max) || 0}</span>; }

export default function WorldMarket() {
  const [profile, setProfile] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [scouting, setScouting] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ativos');
  const [selected, setSelected] = useState(null);
  const [negotiating, setNegotiating] = useState(false);
  const [offerTerms, setOfferTerms] = useState({ durationDays: 60, partnerPrizeShare: 50, monthlySalary: 0, signingBonus: 0 });
  const [loadError, setLoadError] = useState('');
  const { toast } = useToast();
  const levels = getScoutingLevels();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const user = await localGame.auth.me();
      const currentProfile = await ensureMyProfile(user);
      setProfile(currentProfile);
      const date = currentProfile?.career_date || new Date().toISOString().slice(0, 10);
      const market = await getWorldMarketSnapshot(date);
      const scoutingReports = await safeModuleTask(() => getPlayerScoutingReports(currentProfile?.id), {
        label: 'relatórios de scouting', fallback: [],
      });
      setSnapshot(market || { athletes: [], active: [], processed: false });
      setReports(scoutingReports || []);
    } catch (error) {
      console.error(error);
      setLoadError(error.message || 'Não foi possível carregar o mercado mundial.');
      toast({ title: 'Erro no mercado', description: error.message || 'Não foi possível carregar o mercado mundial.', variant: 'destructive' });
    } finally { setLoading(false); }
  }

  async function refreshReports(profileId = profile?.id) {
    const nextReports = await safeModuleTask(() => getPlayerScoutingReports(profileId), {
      label: 'relatórios de scouting',
      fallback: [],
    });
    setReports(nextReports || []);
  }

  async function processMonth() {
    setProcessing(true);
    try {
      const date = profile?.career_date || new Date().toISOString().slice(0, 10);
      const result = await evolveWorldMarket(date);
      setSnapshot(await getWorldMarketSnapshot(date));
      toast({
        title: result.skipped ? 'Mercado já processado' : 'Mercado atualizado',
        description: result.skipped ? `O mercado de ${result.month} já foi processado.` : `${result.prospects.length} promessa(s) chegaram e ${result.events.filter(e => e.retired).length} atleta(s) se aposentaram.`,
      });
    } catch (error) {
      toast({ title: 'Erro ao evoluir mercado', description: error.message || 'Não foi possível processar o mês.', variant: 'destructive' });
    } finally { setProcessing(false); }
  }

  async function handleScout(levelKey) {
    if (!selected) return;
    setScouting(levelKey);
    try {
      const result = await scoutAthlete(profile, selected, levelKey);
      setProfile(result.profile || { ...profile, coins: (Number(profile.coins) || 0) - result.cost });
      await refreshReports();
      toast({ title: 'Relatório concluído', description: `${selected.name} foi observado pela equipe de scouting.` });
    } catch (error) {
      toast({ title: 'Scouting não realizado', description: error.message || 'Não foi possível gerar o relatório.', variant: 'destructive' });
    } finally { setScouting(null); }
  }


  function openAthlete(athlete) {
    setSelected(athlete);
    setNegotiating(false);
    setOfferTerms({
      durationDays: 60,
      partnerPrizeShare: 50,
      monthlySalary: Math.max(50, Number(athlete.expected_salary) || 500),
      signingBonus: Math.max(100, Math.round((Number(athlete.market_value) || 1000) * 0.08)),
    });
  }

  async function handleOffer() {
    if (!selected) return;
    setNegotiating(true);
    try {
      const result = await submitPartnerOffer(profile, selected, selectedReport, offerTerms);
      if (result.profile) setProfile(result.profile);
      if (result.accepted) {
        toast({ title: 'Proposta aceita!', description: `${selected.name} agora é seu novo parceiro.` });
        setSelected(null);
        await load();
      } else {
        toast({ title: 'Proposta recusada', description: `${selected.name} não aceitou os termos apresentados.`, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Negociação não concluída', description: error.message || 'Não foi possível enviar a proposta.', variant: 'destructive' });
    } finally { setNegotiating(false); }
  }

  async function handleShortlist(athlete) {
    const report = reports.find(item => item.athlete_id === athlete.id);
    const next = !report?.is_shortlisted;
    try {
      await toggleShortlist(profile, athlete, next);
      await refreshReports();
      toast({ title: next ? 'Adicionado à lista' : 'Removido da lista', description: athlete.name });
    } catch (error) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível atualizar a lista.', variant: 'destructive' });
    }
  }

  const reportMap = useMemo(() => Object.fromEntries(reports.map(report => [report.athlete_id, report])), [reports]);
  const athletes = useMemo(() => {
    const source = snapshot?.athletes || [];
    return source.filter(athlete => {
      if (status === 'favoritos') return Boolean(reportMap[athlete.id]?.is_shortlisted);
      if (status === 'ativos') return athlete.career_status !== 'aposentado';
      if (status === 'todos') return true;
      if (status === 'aposentado') return athlete.career_status === 'aposentado';
      return athlete.market_status === status;
    }).filter(athlete => `${athlete.name || ''} ${athlete.country || ''}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (Number(a.world_rank) || 9999) - (Number(b.world_rank) || 9999));
  }, [snapshot, search, status, reportMap]);

  if (loading) return <LoadingScreen />;
  if (loadError && !snapshot) return (
    <div role="alert" className="m-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 flex items-center gap-3">
      <ShieldAlert className="h-5 w-5 text-red-400" />
      <span className="flex-1 text-sm">{loadError}</span>
      <button type="button" onClick={load} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Tentar novamente</button>
    </div>
  );
  const selectedReport = selected ? reportMap[selected.id] : null;
  const negotiationPreview = selected ? getNegotiationPreview(profile, selected, selectedReport, offerTerms) : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Globe2} title="Mercado Mundial" subtitle="Atletas, valores, scouting e evolução do circuito" accent="primary">
        <button onClick={processMonth} disabled={processing || snapshot?.processed} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
          {processing ? 'Processando...' : snapshot?.processed ? 'Mês processado' : 'Processar mercado'}
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard><Users className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-black">{snapshot?.active?.length || 0}</p><p className="text-xs text-muted-foreground">Atletas ativos</p></GlassCard>
        <GlassCard><Star className="h-5 w-5 text-amber-400 mb-2" /><p className="text-2xl font-black">{reports.filter(r => r.is_shortlisted).length}</p><p className="text-xs text-muted-foreground">Na lista de observação</p></GlassCard>
        <GlassCard><Banknote className="h-5 w-5 text-green-400 mb-2" /><p className="text-xl font-black">{formatMoney(profile?.coins)}</p><p className="text-xs text-muted-foreground">Saldo para scouting</p></GlassCard>
        <GlassCard><Activity className="h-5 w-5 text-cyan-400 mb-2" /><p className="text-2xl font-black">{reports.filter(r => r.scouting_level).length}</p><p className="text-xs text-muted-foreground">Relatórios concluídos</p></GlassCard>
      </div>

      <GlassCard>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1"><Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar atleta ou país" className="w-full rounded-xl bg-secondary/50 border border-border/60 pl-9 pr-3 py-2 text-sm" /></div>
          <div className="flex gap-2 overflow-x-auto">
            {['ativos', 'favoritos', 'livre', 'contratado', 'lesionado', 'aposentado', 'todos'].map(item => <button key={item} onClick={() => setStatus(item)} className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${status === item ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground'}`}>{item === 'favoritos' ? 'Observação' : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}
          </div>
        </div>
      </GlassCard>

      {athletes.length === 0 ? <EmptyStateCard icon={Users} title="Nenhum atleta encontrado" message="Altere os filtros para consultar outros jogadores." /> : (
        <div className="space-y-2">{athletes.map(athlete => {
          const report = reportMap[athlete.id];
          return <div key={athlete.id} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 text-center"><p className="text-lg font-black text-primary">#{athlete.world_rank || '—'}</p></div>
            <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center font-black text-primary shrink-0">{(athlete.name || '?').charAt(0)}</div>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="font-bold text-sm truncate">{athlete.name}</p>{report?.scouting_level && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">Observado</span>}</div><p className="text-[10px] text-muted-foreground">{athlete.country || '—'} · {athlete.age || '—'} anos · OVR {athlete.overall_rating || 0} · Potencial {athlete.potential || 0}</p></div>
            <div className="hidden sm:block text-right"><p className="text-xs font-bold">Forma {athlete.current_form || 0}</p><p className="text-[10px] text-muted-foreground">Salário {formatMoney(athlete.expected_salary)}/mês</p></div>
            <div className="text-right min-w-[100px]"><div className="flex items-center justify-end gap-1"><TrendIcon trend={athlete.market_trend} /><p className="font-black text-sm">{formatMoney(athlete.market_value)}</p></div><p className="text-[9px] uppercase text-muted-foreground">valor de mercado</p></div>
            <button onClick={() => handleShortlist(athlete)} className={`p-2 rounded-xl ${report?.is_shortlisted ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary/50 text-muted-foreground'}`} title="Lista de observação"><Star className={`h-4 w-4 ${report?.is_shortlisted ? 'fill-current' : ''}`} /></button>
            <button onClick={() => openAthlete(athlete)} className="p-2 rounded-xl bg-primary/15 text-primary" title="Abrir scouting"><Eye className="h-4 w-4" /></button>
          </div>;
        })}</div>
      )}

      {selected && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto glass rounded-3xl border border-border/60 p-5 space-y-5">
          <div className="flex items-start gap-3"><div className="h-12 w-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-xl font-black">{(selected.name || '?').charAt(0)}</div><div className="flex-1"><p className="text-lg font-black">{selected.name}</p><p className="text-xs text-muted-foreground">#{selected.world_rank || '—'} · {selected.country || '—'} · {selected.age || '—'} anos · {STATUS_LABELS[selected.market_status] || selected.market_status}</p></div><button onClick={() => setSelected(null)} className="p-2 rounded-xl bg-secondary/60"><X className="h-4 w-4" /></button></div>

          {selectedReport?.scouting_level ? <div className="space-y-3">
            <div className="flex items-center justify-between"><div><p className="font-bold">Relatório {selectedReport.scouting_label}</p><p className="text-xs text-muted-foreground">Precisão estimada: {selectedReport.scouting_accuracy}% · {selectedReport.scouted_month}</p></div><span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary">{RECOMMENDATION_LABELS[selectedReport.recommendation] || 'Analisado'}</span></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><GlassCard><p className="text-xs text-muted-foreground">Overall estimado</p><p className="text-xl font-black"><Range min={selectedReport.overall_min} max={selectedReport.overall_max} /></p></GlassCard><GlassCard><p className="text-xs text-muted-foreground">Potencial</p><p className="text-xl font-black"><Range min={selectedReport.potential_min} max={selectedReport.potential_max} /></p></GlassCard><GlassCard><Target className="h-4 w-4 text-primary mb-1" /><p className="text-xs text-muted-foreground">Encaixe tático</p><p className="text-xl font-black">{selectedReport.tactical_fit}/100</p></GlassCard><GlassCard><ShieldAlert className="h-4 w-4 text-amber-400 mb-1" /><p className="text-xs text-muted-foreground">Risco</p><p className="text-xl font-black">{selectedReport.risk_score}/100</p></GlassCard></div>
          </div> : <div className="rounded-2xl bg-secondary/30 p-4 text-sm text-muted-foreground">Ainda não há relatório técnico para este atleta. Escolha um nível de observação abaixo.</div>}

          <div><p className="font-bold mb-3">Enviar equipe de scouting</p><div className="grid md:grid-cols-3 gap-3">{Object.entries(levels).map(([key, level]) => <button key={key} onClick={() => handleScout(key)} disabled={Boolean(scouting) || Number(profile?.coins || 0) < level.cost} className="text-left rounded-2xl border border-border/60 bg-secondary/30 p-4 disabled:opacity-50"><p className="font-bold">{level.label}</p><p className="text-xs text-muted-foreground mt-1">Precisão {level.accuracy}%</p><p className="text-sm font-black text-primary mt-3">{scouting === key ? 'Analisando...' : `${formatMoney(level.cost)} moedas`}</p></button>)}</div></div>
          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-primary" /><div><p className="font-bold">Negociar formação de dupla</p><p className="text-xs text-muted-foreground">Disponível para agentes livres sem lesão.</p></div></div>
            {selected.market_status === 'livre' && !selected.current_injury ? <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">Duração
                  <select value={offerTerms.durationDays} onChange={e => setOfferTerms(v => ({ ...v, durationDays: Number(e.target.value) }))} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border/60 px-3 py-2 text-sm text-foreground">
                    <option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option><option value={120}>120 dias</option><option value={180}>180 dias</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">Parte do parceiro nas premiações
                  <input type="number" min="35" max="70" value={offerTerms.partnerPrizeShare} onChange={e => setOfferTerms(v => ({ ...v, partnerPrizeShare: Number(e.target.value) }))} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border/60 px-3 py-2 text-sm text-foreground" />
                </label>
                <label className="text-xs text-muted-foreground">Salário mensal
                  <input type="number" min="0" value={offerTerms.monthlySalary} onChange={e => setOfferTerms(v => ({ ...v, monthlySalary: Number(e.target.value) }))} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border/60 px-3 py-2 text-sm text-foreground" />
                </label>
                <label className="text-xs text-muted-foreground">Bônus de assinatura
                  <input type="number" min="0" value={offerTerms.signingBonus} onChange={e => setOfferTerms(v => ({ ...v, signingBonus: Number(e.target.value) }))} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border/60 px-3 py-2 text-sm text-foreground" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <GlassCard><p className="text-xs text-muted-foreground">Chance de aceite</p><p className="text-xl font-black text-primary">{negotiationPreview?.acceptanceChance || 0}%</p></GlassCard>
                <GlassCard><p className="text-xs text-muted-foreground">Custo imediato</p><p className="text-lg font-black">{formatMoney(negotiationPreview?.totalImmediateCost)}</p></GlassCard>
                <GlassCard><p className="text-xs text-muted-foreground">Salário esperado</p><p className="text-lg font-black">{formatMoney(negotiationPreview?.expectedSalary)}</p></GlassCard>
              </div>
              <button onClick={handleOffer} disabled={negotiating || !negotiationPreview?.canAfford} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-bold disabled:opacity-50"><Send className="h-4 w-4" />{negotiating ? 'Enviando proposta...' : negotiationPreview?.canAfford ? 'Enviar proposta oficial' : 'Saldo insuficiente para o bônus'}</button>
            </> : <div className="rounded-2xl bg-secondary/30 p-4 text-sm text-muted-foreground">Este atleta não está disponível para negociação neste momento.</div>}
          </div>

        </div>
      </div>}
    </div>
  );
}
