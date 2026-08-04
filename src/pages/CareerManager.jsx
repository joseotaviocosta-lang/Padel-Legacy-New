import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Copy,
  Crown,
  FolderOpen,
  Gamepad2,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogTitle } from '@/components/ui/dialog.jsx';
import { useCareer } from '@/careers/useCareer.js';
import { InfoBanner } from '@/components/padel/ui.jsx';

const positionLabel = (value) => (
  value === 'esquerda' ? 'Esquerda'
    : value === 'direita' ? 'Direita'
      : value === 'versatil' ? 'Versátil'
        : 'A definir'
);

const styleLabel = (value = '') => (
  !value || value === 'equilibrado'
    ? 'A definir'
    : value.charAt(0).toUpperCase() + value.slice(1)
);

const careerTypeLabel = (value) => (value === 'experiment' ? 'Experimento' : 'Carreira');

const parseDate = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
};

const formatTimestamp = (value) => {
  if (!value) return 'Ainda não jogada';
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return value;
  }
};

function MetricCard({ icon: Icon, label, value, hint, accent = 'text-primary' }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/[0.055]">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition group-hover:bg-primary/10" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-black tabular-nums tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
      </div>
    </div>
  );
}

function CareerMiniCard({ career, onPlay }) {
  return (
    <button
      type="button"
      onClick={() => onPlay(career.id)}
      className="group flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-black/20 p-4 text-left transition duration-300 hover:border-primary/30 hover:bg-primary/[0.055]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <UserRound className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-foreground">{career.save_name}</p>
          {career.career_type === 'experiment' && (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300">
              Experimento
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {career.player_name || 'Novo atleta'} · {formatTimestamp(career.last_played_at || career.updated_at)}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
    </button>
  );
}

export default function CareerManager() {
  const navigate = useNavigate();
  const {
    careers,
    loading,
    error: providerError,
    selectCareer,
    createCareer,
    renameCareer,
    duplicateCareer,
    archiveCareer,
    deleteCareer,
  } = useCareer();

  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  const visibleCareers = useMemo(
    () => careers.filter((career) => !career.archived),
    [careers],
  );

  const archivedCount = useMemo(
    () => careers.filter((career) => career.archived).length,
    [careers],
  );

  const sortedCareers = useMemo(() => [...visibleCareers].sort((a, b) => (
    parseDate(b.last_played_at || b.updated_at || b.created_at)
      - parseDate(a.last_played_at || a.updated_at || a.created_at)
  )), [visibleCareers]);

  const latestCareer = sortedCareers[0] || null;

  const filteredCareers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const filtered = normalizedSearch
      ? visibleCareers.filter((career) => [
        career.save_name,
        career.player_name,
        career.play_style,
        career.court_side,
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedSearch)))
      : [...visibleCareers];

    return filtered.sort((a, b) => {
      if (sortBy === 'oldest') {
        return parseDate(a.last_played_at || a.updated_at || a.created_at)
          - parseDate(b.last_played_at || b.updated_at || b.created_at);
      }
      if (sortBy === 'name') {
        return String(a.save_name || '').localeCompare(String(b.save_name || ''), 'pt-BR');
      }
      if (sortBy === 'ranking') {
        const aRank = Number(a.ranking_position) || Number.MAX_SAFE_INTEGER;
        const bRank = Number(b.ranking_position) || Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      }
      return parseDate(b.last_played_at || b.updated_at || b.created_at)
        - parseDate(a.last_played_at || a.updated_at || a.created_at);
    });
  }, [search, sortBy, visibleCareers]);

  const latestSummary = useMemo(() => {
    if (!latestCareer) return null;
    return {
      name: latestCareer.save_name,
      player: latestCareer.player_name || latestCareer.save_name || 'Atleta',
      rank: latestCareer.ranking_position || '—',
      season: latestCareer.season || '—',
      type: careerTypeLabel(latestCareer.career_type),
      lastPlayed: formatTimestamp(latestCareer.last_played_at || latestCareer.updated_at),
      createdAt: formatDate(latestCareer.created_at),
      side: positionLabel(latestCareer.court_side),
      style: styleLabel(latestCareer.play_style),
    };
  }, [latestCareer]);

  const careerOverview = useMemo(() => {
    const ranks = visibleCareers
      .map((career) => Number(career.ranking_position))
      .filter((rank) => Number.isFinite(rank) && rank > 0);
    const bestRank = ranks.length ? Math.min(...ranks) : null;
    const started = visibleCareers.filter((career) => career.player_name && career.player_name !== 'Novo Atleta').length;
    return {
      saves: visibleCareers.length,
      started,
      bestRank: bestRank ? `#${bestRank}` : '—',
      archived: archivedCount,
    };
  }, [archivedCount, visibleCareers]);

  const run = async (fn) => {
    try {
      setError('');
      return await fn();
    } catch (caughtError) {
      setError(caughtError.message || 'Operação não concluída.');
      return undefined;
    }
  };

  const create = (event) => {
    event?.preventDefault();
    return run(async () => {
      setCreating(true);
      try {
        await createCareer({ saveName, playerName: 'Novo Atleta', careerType: 'normal' });
        setShowCreate(false);
        setSaveName('');
        navigate('/game/missions', { replace: true, state: { onboarding: true } });
      } finally {
        setCreating(false);
      }
    });
  };

  const play = (id) => run(async () => {
    await selectCareer(id);
    setShowLoad(false);
    navigate('/game');
  });

  const rename = (career) => run(async () => {
    const name = window.prompt('Novo nome da carreira:', career.save_name);
    if (name?.trim()) await renameCareer(career.id, name);
  });

  const duplicate = (career) => run(() => duplicateCareer(career.id, { careerType: 'experiment' }));

  const archive = (career) => run(async () => {
    if (window.confirm(`Arquivar “${career.save_name}”?`)) await archiveCareer(career.id);
  });

  const remove = (career) => run(async () => {
    if (window.confirm(`Excluir definitivamente “${career.save_name}”?`)) await deleteCareer(career.id);
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070b] text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -right-36 top-1/4 h-[30rem] w-[30rem] rounded-full bg-emerald-500/5 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:54px_54px]" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary font-black text-primary-foreground shadow-lg shadow-primary/20">
              P
            </div>
            <div>
              <p className="text-lg font-black leading-none tracking-tight">PADEL</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.45em] text-primary">Legacy</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs text-muted-foreground sm:flex">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(163,230,53,.8)]" />
            Saves locais protegidos
          </div>
        </header>

        {(error || providerError) && (
          <div className="mt-6">
            <InfoBanner variant="error">{error || providerError}</InfoBanner>
          </div>
        )}

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:py-14">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-4 w-4" /> Simulador de carreira
            </div>

            <h1 className="mt-7 text-5xl font-black leading-[0.94] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl xl:text-[5.6rem]">
              Sua carreira.
              <span className="block bg-gradient-to-r from-primary via-lime-200 to-emerald-300 bg-clip-text text-transparent">
                Seu legado.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Evolua seu atleta, construa uma dupla, dispute o circuito mundial e transforme cada decisão em história.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => { setError(''); setShowCreate(true); }}
                disabled={creating || loading}
                className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-primary px-7 py-3 text-sm font-black text-primary-foreground shadow-[0_18px_45px_rgba(163,230,53,.18)] transition duration-300 hover:-translate-y-0.5 hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-5 w-5 transition group-hover:rotate-90" />
                Nova carreira
              </button>
              <button
                type="button"
                onClick={() => { setError(''); setShowLoad(true); }}
                disabled={loading || visibleCareers.length === 0}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.045] px-7 py-3 text-sm font-bold text-white backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen className="h-5 w-5 text-primary" />
                Carregar carreira
                {visibleCareers.length > 0 && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">{visibleCareers.length}</span>
                )}
              </button>
            </div>

            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard icon={FolderOpen} label="Carreiras" value={careerOverview.saves} hint="saves disponíveis" />
              <MetricCard icon={Gamepad2} label="Em andamento" value={careerOverview.started} hint="carreiras iniciadas" accent="text-cyan-300" />
              <MetricCard icon={Trophy} label="Melhor ranking" value={careerOverview.bestRank} hint="entre seus atletas" accent="text-amber-300" />
              <MetricCard icon={Archive} label="Arquivadas" value={careerOverview.archived} hint="fora da lista ativa" accent="text-violet-300" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-10 rounded-[4rem] bg-primary/[0.035] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#0b0e14]/92 shadow-2xl shadow-black/50 backdrop-blur-2xl">
              <div className="border-b border-white/10 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Continuar jogando</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Última carreira</h2>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <Crown className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {latestSummary ? (
                <div className="p-5 sm:p-6">
                  <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-transparent p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-primary text-xl font-black text-primary-foreground shadow-lg shadow-primary/15">
                        {(latestSummary.player || 'A').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-xl font-black text-white">{latestSummary.name}</h3>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-300">
                            {latestSummary.type}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-300">{latestSummary.player}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Última sessão: {latestSummary.lastPlayed}</p>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Ranking', latestSummary.rank === '—' ? '—' : `#${latestSummary.rank}`],
                        ['Temporada', latestSummary.season],
                        ['Lado', latestSummary.side],
                        ['Estilo', latestSummary.style],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                          <p className="mt-2 truncate text-sm font-black text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => play(latestCareer.id)}
                      disabled={loading}
                      className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-white text-sm font-black text-black transition duration-300 hover:bg-primary disabled:opacity-50"
                    >
                      <Play className="h-4 w-4 fill-current" /> Continuar carreira
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {sortedCareers.slice(1, 3).map((career) => (
                      <CareerMiniCard key={career.id} career={career} onPlay={play} />
                    ))}
                    {sortedCareers.length <= 1 && (
                      <div className="col-span-full rounded-3xl border border-dashed border-white/10 bg-black/15 p-5 text-center text-sm text-muted-foreground">
                        Crie outra carreira para explorar estilos e trajetórias diferentes.
                      </div>
                    )}
                  </div>

                  {sortedCareers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowLoad(true)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-primary/30 hover:text-white"
                    >
                      Ver todas as carreiras <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[430px] flex-col items-center justify-center p-8 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] border border-primary/20 bg-primary/10 text-primary">
                    <Target className="h-8 w-8" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black text-white">Seu legado começa aqui</h3>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Crie seu primeiro atleta e conheça o circuito através do tutorial guiado.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground"
                  >
                    <Plus className="h-4 w-4" /> Criar primeira carreira
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-white/[0.07] py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Padel Legacy · simulador de carreira esportiva</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Progresso salvo localmente</span>
            <span className="inline-flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5" /> Mundo persistente</span>
          </div>
        </footer>
      </main>

      <Dialog open={showLoad} onOpenChange={(open) => {
        setShowLoad(open);
        if (!open) {
          setSearch('');
          setSortBy('recent');
        }
      }}>
        <DialogOverlay />
        <DialogContent className="max-h-[88vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#090c12] p-0 shadow-2xl">
          <div className="border-b border-white/10 p-5 sm:p-7">
            <DialogTitle className="flex items-center gap-3 text-2xl font-black text-white">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderOpen className="h-5 w-5" />
              </span>
              Carregar carreira
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-muted-foreground">
              Continue, organize ou remova seus saves locais.
            </DialogDescription>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por save, atleta, lado ou estilo..."
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-primary/40"
              >
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="name">Nome A–Z</option>
                <option value="ranking">Melhor ranking</option>
              </select>
            </div>
          </div>

          <div className="max-h-[58vh] overflow-y-auto p-4 sm:p-6">
            {loading ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-muted-foreground">
                Carregando carreiras...
              </div>
            ) : filteredCareers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
                <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-4 font-bold text-white">Nenhuma carreira encontrada</p>
                <p className="mt-2 text-sm text-muted-foreground">Altere sua busca ou crie uma nova carreira.</p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredCareers.map((career) => (
                  <article key={career.id} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-5 transition duration-300 hover:border-primary/30 hover:bg-white/[0.055]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-lg font-black text-primary">
                        {(career.player_name || career.save_name || 'A').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-black text-white">{career.save_name}</h3>
                          {career.career_type === 'experiment' && (
                            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300">Experimento</span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-300">{career.player_name || 'Novo atleta'}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{formatTimestamp(career.last_played_at || career.updated_at)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ['Ranking', career.ranking_position ? `#${career.ranking_position}` : '—'],
                        ['Temporada', career.season || '—'],
                        ['Lado', positionLabel(career.court_side)],
                        ['Estilo', styleLabel(career.play_style)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl bg-black/20 p-3">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                          <p className="mt-1 truncate text-xs font-bold text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => play(career.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition hover:bg-lime-300"
                      >
                        <Play className="h-4 w-4 fill-current" /> Continuar
                      </button>
                      <button type="button" onClick={() => rename(career)} aria-label={`Renomear ${career.save_name}`} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:border-primary/30 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => duplicate(career)} aria-label={`Duplicar ${career.save_name}`} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:border-primary/30 hover:text-primary"><Copy className="h-4 w-4" /></button>
                      <button type="button" onClick={() => archive(career)} aria-label={`Arquivar ${career.save_name}`} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:border-amber-300/30 hover:text-amber-300"><Archive className="h-4 w-4" /></button>
                      <button type="button" onClick={() => remove(career)} aria-label={`Excluir ${career.save_name}`} className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-2.5 text-rose-300 transition hover:bg-rose-400/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/10 p-4 sm:px-6">
            <p className="text-xs text-muted-foreground">{filteredCareers.length} de {visibleCareers.length} carreira(s)</p>
            <button
              type="button"
              onClick={() => { setShowLoad(false); setShowCreate(true); }}
              className="inline-flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/15"
            >
              <Plus className="h-4 w-4" /> Nova carreira
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={(open) => {
        if (!open) {
          setSaveName('');
          setError('');
        }
        setShowCreate(open);
      }}>
        <DialogOverlay />
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-[2rem] border border-white/10 bg-[#090c12] p-6 shadow-2xl sm:p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Plus className="h-5 w-5" />
          </div>
          <DialogTitle className="mt-5 text-2xl font-black text-white">Nova carreira</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Dê um nome ao save. A identidade e o perfil do atleta serão definidos no tutorial.
          </DialogDescription>
          <form onSubmit={create} className="mt-6 space-y-5">
            <div>
              <label htmlFor="save-name" className="block text-sm font-bold text-white">Nome da carreira</label>
              <input
                id="save-name"
                autoFocus
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                maxLength={40}
                placeholder="Ex.: Rumo ao topo"
                className="mt-2 h-[3.25rem] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-muted-foreground focus:border-primary/45 focus:ring-2 focus:ring-primary/10"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Você poderá renomear depois.</span>
                <span className="tabular-nums">{saveName.length}/40</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !saveName.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Criando...' : 'Criar carreira'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
