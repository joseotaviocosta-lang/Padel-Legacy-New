import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Trophy, Swords, TrendingUp, Wallet, Coins, Medal, ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { getSeasonSnapshot, getSeasonHistory, finalizeSeason } from '@/game-core';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/design-system';


function GlassCard({ children, className = '' }) {
  return <div className={`glass rounded-2xl p-4 ${className}`}>{children}</div>;
}

function LoadingScreen() {
  return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
}

function PageContainer({ children }) {
  return <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">{children}</div>;
}

function PageHeader({ icon: Icon, title, subtitle }) {
  return <div className="glass rounded-3xl p-5 md:p-6 flex items-center gap-4">{Icon && <div className="h-14 w-14 rounded-2xl bg-amber-500/20 flex items-center justify-center"><Icon className="h-7 w-7 text-amber-400" /></div>}<div><h1 className="text-xl md:text-2xl font-black">{title}</h1>{subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}</div></div>;
}

function PrimaryButton({ children, className = '', ...props }) {
  return <button className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 ${className}`} {...props}>{children}</button>;
}

function InfoBanner({ children }) {
  return <div className="glass rounded-2xl p-4 border border-green-500/40 bg-green-500/5 text-sm text-green-300">{children}</div>;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const localMode = import.meta.env.VITE_LOCAL_DEV_MODE === 'true';


async function loadPlayerProfile() {
  try {
    const user = await localGame.auth.me();
    if (user?.id) {
      const owned = await localGame.entities.PlayerProfile.filter({ created_by_id: user.id });
      if (owned?.length) return owned[0];
    }
  } catch (error) {
    console.warn('Não foi possível localizar o perfil pelo usuário:', error);
  }

  const profiles = await localGame.entities.PlayerProfile.list('-created_date', 1);
  if (!profiles?.length) throw new Error('Nenhum perfil de jogador foi encontrado.');
  return profiles[0];
}

function Metric({ icon: Icon, label, value, sub }) {
  return <GlassCard><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-black tabular-nums">{value}</p>{sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}</div></div></GlassCard>;
}

export default function SeasonDashboard() {
  const [profile, setProfile] = useState(null);
  const [partner, setPartner] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const p = await loadPlayerProfile();
      const [s, h, partners] = await Promise.all([
        getSeasonSnapshot(p),
        getSeasonHistory(p),
        p.partner_id ? localGame.entities.AthleteProfile.filter({ id: p.partner_id }) : Promise.resolve([]),
      ]);
      setProfile(p); setSnapshot(s); setHistory(h); setPartner(partners?.[0] || null);
    } catch (error) {
      toast({ title: 'Erro ao carregar temporada', description: error.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const canClose = useMemo(() => String(profile?.career_date || '').slice(5) >= '12-15', [profile]);

  const runCloseSeason = async (force) => {
    setClosing(true);
    try {
      const outcome = await finalizeSeason({ profile, partner, force });
      toast({ title: outcome.alreadyCompleted ? 'Temporada já concluída' : `Temporada ${snapshot.year} encerrada`, description: outcome.alreadyCompleted ? 'O relatório anual já estava salvo.' : `Nova temporada iniciada em ${outcome.updatedProfile.career_date}.` });
      await load();
    } catch (error) {
      toast({ title: 'Não foi possível encerrar', description: error.message, variant: 'destructive' });
    } finally { setClosing(false); }
  };

  const closeSeason = (force = false) => {
    if (!force) { setConfirmClose(true); return; }
    runCloseSeason(true);
  };

  if (loading) return <LoadingScreen />;
  if (!profile || !snapshot) return null;

  return <PageContainer>
    <PageHeader icon={CalendarRange} title={`Temporada ${snapshot.year}`} subtitle={`Relatório esportivo e financeiro • ${profile.career_date}`} accent="amber" />

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Metric icon={Swords} label="Partidas" value={snapshot.matches} sub={`${snapshot.wins}V • ${snapshot.losses}D`} />
      <Metric icon={TrendingUp} label="Aproveitamento" value={`${snapshot.winRate}%`} />
      <Metric icon={Trophy} label="Títulos" value={snapshot.titles} sub={snapshot.teamRank ? `Dupla nº ${snapshot.teamRank}` : 'Sem posição'} />
      <Metric icon={Wallet} label="Saldo anual" value={brl.format(snapshot.balance)} sub={`${brl.format(snapshot.income)} recebidos`} />
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <GlassCard>
        <h2 className="font-black flex items-center gap-2 mb-4"><Medal className="h-5 w-5 text-amber-400" /> Premiações previstas</h2>
        <div className="space-y-3">{snapshot.awards.map((award) => <div key={award.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40"><div><p className="font-bold text-sm">{award.label}</p><p className="text-xs text-muted-foreground">+{award.xp} XP • +{award.rankPoints} ranking</p></div><span className="font-black text-amber-400 flex items-center gap-1"><Coins className="h-4 w-4" />{award.coins}</span></div>)}</div>
      </GlassCard>
      <GlassCard>
        <h2 className="font-black mb-4">Balanço financeiro</h2>
        <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Receitas</span><strong>{brl.format(snapshot.income)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Despesas</span><strong>{brl.format(snapshot.expenses)}</strong></div><div className="border-t border-border/50 pt-3 flex justify-between"><span>Resultado</span><strong className={snapshot.balance >= 0 ? 'text-green-400' : 'text-red-400'}>{brl.format(snapshot.balance)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Torneios futuros</span><strong>{snapshot.upcomingTournaments}</strong></div></div>
      </GlassCard>
    </div>

    {snapshot.completed ? <InfoBanner variant="success">A temporada {snapshot.year} já possui relatório final salvo.</InfoBanner> : <GlassCard className="border border-amber-500/30"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h2 className="font-black">Encerramento anual</h2><p className="text-sm text-muted-foreground">Salva o relatório, entrega prêmios, encerra o ano atual e inicia automaticamente a próxima temporada.</p></div><div className="flex flex-wrap gap-2"><PrimaryButton onClick={() => closeSeason(false)} disabled={!canClose || closing}>{closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Encerrar temporada</PrimaryButton>{localMode && !canClose && <button onClick={() => closeSeason(true)} disabled={closing} className="px-4 py-2.5 rounded-xl bg-secondary font-bold text-sm flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Simular encerramento</button>}</div></div>{!canClose && <p className="text-xs text-amber-300 mt-3">O encerramento normal abre em 15 de dezembro. No modo local, o botão de simulação permite testar agora.</p>}</GlassCard>}

    <GlassCard><h2 className="font-black mb-4">Histórico de temporadas</h2>{history.length ? <div className="space-y-2">{history.map((item) => <div key={item.id} className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 rounded-xl bg-secondary/30 text-sm"><strong>{item.season_year}</strong><span>{item.wins || 0} vitórias</span><span>{item.titles || 0} títulos</span><span>{item.win_rate || 0}%</span><span className="text-primary font-bold">+{item.bonus_xp || 0} XP</span></div>)}</div> : <p className="text-sm text-muted-foreground">A primeira temporada concluída aparecerá aqui.</p>}</GlassCard>

    <ConfirmDialog
      open={confirmClose}
      onClose={() => setConfirmClose(false)}
      onConfirm={() => { setConfirmClose(false); runCloseSeason(false); }}
      tone="default"
      title="Encerrar temporada"
      description={snapshot ? `Encerrar a temporada ${snapshot.year} e iniciar ${snapshot.year + 1}?` : ''}
      confirmLabel="Encerrar"
    />
  </PageContainer>;
}
