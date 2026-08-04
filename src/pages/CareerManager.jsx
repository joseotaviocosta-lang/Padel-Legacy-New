import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Play, Plus, Trash2, Pencil, UserRound, Archive, Sparkles, ShieldCheck, Activity, CalendarDays, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogOverlay, DialogTitle, DialogDescription } from '@/components/ui/dialog.jsx';
import { useCareer } from '@/careers/useCareer.js';
import { PageHeader, GlassCard, PrimaryButton, InfoBanner } from '@/components/padel/ui.jsx';

const positionLabel = (value) => (value === 'esquerda' ? 'Esquerda' : value === 'direita' ? 'Direita' : value === 'versatil' ? 'Versátil' : 'A definir');
const styleLabel = (value = '') => (!value || value === 'equilibrado' ? 'A definir' : value.charAt(0).toUpperCase() + value.slice(1));
const careerTypeLabel = (value) => (value === 'experiment' ? 'Experimento' : 'Carreira');

const worldNews = [
  {
    id: 'world-tour',
    category: 'World Tour',
    headline: 'Top 8 fecha a temporada com mais pontos',
    description: 'A tabela mundial se aquece com as últimas apostas do circuito internacional.',
  },
  {
    id: 'new-sponsor',
    category: 'Patrocínio',
    headline: 'Nova proposta de grife para patrocínio local',
    description: 'Marcas do país estão analisando seu desempenho de duplas.',
  },
  {
    id: 'training-camp',
    category: 'Treinamento',
    headline: 'Treino de elite previsto para esta semana',
    description: 'A comissão técnica recomenda foco em defesa e transição de rede.',
  },
];

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} • ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return value;
  }
};

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
  const [saveName, setSaveName] = useState('');

  const visibleCareers = useMemo(() => careers.filter((career) => !career.archived), [careers]);
  const latestCareer = visibleCareers[0] || null;

  const run = async (fn) => {
    try {
      setError('');
      return await fn();
    } catch (e) {
      setError(e.message || 'Operação não concluída.');
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

  const latestSummary = useMemo(() => {
    if (!latestCareer) return null;
    return {
      name: latestCareer.save_name,
      player: latestCareer.player_name || latestCareer.save_name || 'Atleta',
      rank: latestCareer.ranking_position || '—',
      season: latestCareer.season || '—',
      type: careerTypeLabel(latestCareer.career_type),
      lastPlayed: formatTimestamp(latestCareer.last_played_at),
      createdAt: formatDate(latestCareer.created_at),
      side: positionLabel(latestCareer.court_side),
      style: styleLabel(latestCareer.play_style),
    };
  }, [latestCareer]);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/15 via-transparent to-transparent blur-3xl" />
      <div className="max-w-6xl mx-auto relative space-y-8">
        <PageHeader
          icon={Sparkles}
          title="Bem-vindo à arena"
          subtitle="Seu acervo local de carreiras, renovado com visual cinematográfico e navegação imediata."
          accent="primary"
        >
          <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-end">
            <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-primary">Offline</span>
          </div>
        </PageHeader>

        {(error || providerError) && (
          <InfoBanner variant="error">
            {error || providerError}
          </InfoBanner>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <GlassCard className="overflow-hidden bg-slate-950/80 border border-white/10 shadow-2xl shadow-primary/10">
            <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr] p-6">
              <div className="space-y-5">
                <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm uppercase tracking-[0.35em] text-primary/80">Aquecimento</p>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">Retome sua carreira ou comece uma nova jornada.</h2>
                    <p className="text-sm text-muted-foreground">Todas as suas carreiras locais são armazenadas aqui. Crie, continue ou organize saves com um clique.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-background/70 p-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground uppercase tracking-[0.3em] mb-4">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Segurança local
                    </div>
                    <p className="text-lg font-semibold">Salvamento offline instantâneo</p>
                    <p className="mt-2 text-sm text-muted-foreground">Seus saves são mantidos no dispositivo e podem ser acessados imediatamente.</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-background/70 p-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground uppercase tracking-[0.3em] mb-4">
                      <Activity className="h-4 w-4 text-amber-400" />
                      Impulso de hoje
                    </div>
                    <p className="text-lg font-semibold">Explore sua próxima partida</p>
                    <p className="mt-2 text-sm text-muted-foreground">Use o painel para escolher o save certo e continuar direto no game.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-[#02070d]/80 p-6 shadow-inner shadow-primary/5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-primary/70">Carreira mais recente</p>
                    <h3 className="mt-2 text-xl font-black">{latestSummary?.name || 'Nenhuma carreira ativa'}</h3>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                    <UserRound className="h-6 w-6" />
                  </div>
                </div>
                {latestSummary ? (
                  <div className="mt-6 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl bg-slate-950/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Jogador</p>
                        <p className="mt-2 font-bold">{latestSummary.player}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-950/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Tipo</p>
                        <p className="mt-2 font-bold">{latestSummary.type}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-3xl bg-slate-950/70 p-4 text-sm">
                        <p className="text-muted-foreground uppercase tracking-[0.3em]">Ranking</p>
                        <p className="mt-2 text-lg font-black tabular-nums">#{latestSummary.rank}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-950/70 p-4 text-sm">
                        <p className="text-muted-foreground uppercase tracking-[0.3em]">Temporada</p>
                        <p className="mt-2 font-black">{latestSummary.season}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-950/70 p-4 text-sm">
                        <p className="text-muted-foreground uppercase tracking-[0.3em]">Última vez</p>
                        <p className="mt-2 font-semibold">{latestSummary.lastPlayed}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl bg-slate-950/70 p-4 text-sm">
                        <p className="text-muted-foreground uppercase tracking-[0.3em]">Lado</p>
                        <p className="mt-2 font-semibold">{latestSummary.side}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-950/70 p-4 text-sm">
                        <p className="text-muted-foreground uppercase tracking-[0.3em]">Estilo</p>
                        <p className="mt-2 font-semibold">{latestSummary.style}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl bg-slate-950/70 p-5 text-sm text-muted-foreground">
                    Crie uma nova carreira para começar a gerar histórico de partidas e progressão.
                  </div>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <PrimaryButton onClick={() => { setError(''); setShowCreate(true); }} disabled={creating || loading}>
                    <Plus className="h-4 w-4" /> Nova carreira
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => { if (latestCareer) play(latestCareer.id); }}
                    disabled={!latestCareer || loading}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" /> Continuar
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="overflow-hidden bg-slate-950/80 border border-white/10 shadow-2xl shadow-primary/10">
            <div className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Radar de notícias</p>
                  <h3 className="mt-2 text-2xl font-black">Notícias do mundo</h3>
                </div>
                <div className="rounded-3xl bg-amber-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">Atual</div>
              </div>

              <div className="mt-6 space-y-4">
                {worldNews.map((news) => (
                  <div key={news.id} className="rounded-3xl border border-white/10 bg-background/70 p-4 hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      <span>{news.category}</span>
                      <span className="text-foreground/70">Agora</span>
                    </div>
                    <h4 className="mt-2 font-semibold">{news.headline}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{news.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Seus saves</p>
                <h2 className="text-2xl font-black">Biblioteca de carreiras</h2>
              </div>
              <button
                type="button"
                onClick={() => { setError(''); setShowCreate(true); }}
                className="inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15"
              >
                <Plus className="h-4 w-4" /> Novo save
              </button>
            </div>

            {loading ? (
              <div className="mt-6 rounded-3xl bg-slate-950/70 p-6 text-center text-sm text-muted-foreground">Carregando saves locais...</div>
            ) : visibleCareers.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-slate-950/70 p-8 text-center">
                <UserRound className="mx-auto h-10 w-10 text-primary" />
                <p className="mt-4 text-lg font-semibold">Nenhum save encontrado</p>
                <p className="mt-2 text-sm text-muted-foreground">Crie uma carreira e ela aparecerá aqui imediatamente.</p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {visibleCareers.map((career) => (
                  <article key={career.id} className="group rounded-3xl border border-white/10 bg-slate-950/70 p-5 transition hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-bold tracking-tight">{career.save_name}</h3>
                          {career.career_type === 'experiment' && (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] uppercase tracking-[0.3em] text-primary">Experimento</span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{career.player_name || career.save_name} · {positionLabel(career.court_side)} · {styleLabel(career.play_style)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => play(career.id)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-3xl bg-primary text-primary-foreground transition hover:scale-[1.02]"
                        aria-label={`Continuar ${career.save_name}`}
                      >
                        <Play className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm text-muted-foreground">
                      <div className="rounded-3xl bg-background/60 p-3">
                        <p className="uppercase tracking-[0.3em]">Temporada</p>
                        <p className="mt-2 font-semibold">{career.season || '—'}</p>
                      </div>
                      <div className="rounded-3xl bg-background/60 p-3">
                        <p className="uppercase tracking-[0.3em]">Atualizado</p>
                        <p className="mt-2 font-semibold">{formatDate(career.updated_at)}</p>
                      </div>
                      <div className="rounded-3xl bg-background/60 p-3">
                        <p className="uppercase tracking-[0.3em]">Save</p>
                        <p className="mt-2 font-semibold">{career.career_type === 'experiment' ? 'Experimento' : 'Normal'}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => play(career.id)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                      >
                        <Play className="h-4 w-4" /> Jogar
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicate(career)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:border-primary/30"
                      >
                        <Copy className="h-4 w-4" /> Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => rename(career)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:border-primary/30"
                      >
                        <Pencil className="h-4 w-4" /> Renomear
                      </button>
                      <button
                        type="button"
                        onClick={() => archive(career)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:border-primary/30"
                      >
                        <Archive className="h-4 w-4" /> Arquivar
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(career)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-destructive/40 bg-rose-500/5 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Painel rápido</p>
                <h2 className="text-2xl font-black">Perfis & ações</h2>
              </div>
              <div className="rounded-3xl bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">Resumo</div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-primary/20 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Carreiras salvas</p>
                    <p className="mt-2 text-3xl font-black tabular-nums">{visibleCareers.length}</p>
                  </div>
                  <TrendingUp className="h-7 w-7 text-amber-400" />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Último save</p>
                    <p className="mt-2 font-semibold">{latestSummary?.lastPlayed || '—'}</p>
                  </div>
                  <CalendarDays className="h-7 w-7 text-cyan-400" />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Carreira mais ativa</p>
                    <p className="mt-2 font-semibold">{latestSummary?.name || 'Nenhuma carreira'}</p>
                  </div>
                  <ShieldCheck className="h-7 w-7 text-primary" />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
              <p className="font-semibold">Dica</p>
              <p className="mt-2">Use o botão “Novo save” para gerar rapidamente uma carreira focada em tutorial, e continue no botão “Jogar” sempre que quiser entrar direto no game.</p>
            </div>
          </GlassCard>
        </div>

        <Dialog open={showCreate} onOpenChange={(open) => {
          if (!open) {
            setSaveName('');
            setError('');
          }
          setShowCreate(open);
        }}>
          <DialogOverlay />
          <DialogContent className="w-full max-w-lg rounded-3xl border border-primary/20 bg-background p-6 shadow-2xl">
            <DialogTitle className="text-2xl font-black">Identifique seu save</DialogTitle>
            <DialogDescription className="mt-2 text-sm text-muted-foreground">O nome do atleta continuará sendo definido pelo tutorial.</DialogDescription>
            <form onSubmit={create} className="mt-6 space-y-4">
              <div>
                <label htmlFor="save-name" className="block text-sm font-semibold text-foreground">Nome da carreira</label>
                <input
                  id="save-name"
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  maxLength={40}
                  placeholder="Ex.: Minha carreira principal"
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                />
                <div className="mt-2 text-right text-xs text-muted-foreground">{saveName.length}/40</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-3xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:border-primary/30"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !saveName.trim()}
                  className="inline-flex items-center gap-2 rounded-3xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar carreira'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
