import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper, Mic, Users, Star, TrendingUp, Sparkles } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, incrementMissionProgress } from '@/lib/padel';
import { LoadingScreen, EmptyStateCard } from '@/components/padel/ui';
import { CardGrid, ModalShell, Page, PageContent, PageHeader, StatCard, Surface } from '@/components/design-system';
import ArticleCard from '@/components/press/ArticleCard';
import JournalistCard from '@/components/press/JournalistCard';
import InterviewModal from '@/components/press/InterviewModal';
import { getPendingInterviews, pickJournalist, applyReputationEffects, reconcileJournalistCatalog } from '@/lib/pressData';
import { useToast } from '@/components/ui/use-toast';
import {
  buildOfficialInterviewProgressPatch,
  findOfficialInterviewMatch,
  isPostMatchInterview,
} from '@/lib/postMatchInterview.js';

export default function Press() {
  const [searchParams] = useSearchParams();
  const openedResourceRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [articles, setArticles] = useState([]);
  const [journalists, setJournalists] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [partnership, setPartnership] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') === 'interviews' ? 'interviews' : searchParams.get('tab') === 'journalists' ? 'journalists' : 'feed');
  const [activeInterview, setActiveInterview] = useState(null);
  const [activeJournalist, setActiveJournalist] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'interviews' || requestedTab === 'journalists' || requestedTab === 'feed') {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  async function load() {
    setLoading(true);
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);

      if (p) {
        const [arts, mats, events, partnerships, tournamentRegistrations] = await Promise.all([
          localGame.entities.PressArticle.filter({ profile_id: p.id }, '-created_date', 50),
          localGame.entities.Match.filter({ profile_id: p.id }, '-created_date', 20),
          localGame.entities.CalendarEvent.filter({ profile_id: p.id }, 'start_date', 100),
          localGame.entities.Partnership.filter({ profile_id: p.id }, '-created_date', 20).catch(() => []),
          localGame.entities.TournamentRegistration.filter({ profile_id: p.id }, '-registered_at', 100).catch(() => []),
        ]);
        setArticles(arts || []);
        setRecentMatches(mats || []);
        setCalendarEvents(events || []);
        setPartnership((partnerships || []).find(item => item.is_active || item.status === 'active') || null);
        setRegistrations(tournamentRegistrations || []);

        // Load or seed journalists for this profile
        const existing = await localGame.entities.PressJournalist.filter({ profile_id: p.id }, null, 50);
        const reconciliation = reconcileJournalistCatalog(existing, p.id);
        const created = [];
        for (const journalist of reconciliation.missing) {
          created.push(await localGame.entities.PressJournalist.upsert(journalist.id, journalist));
        }
        const createdById = new Map(created.map(item => [item.id, item]));
        setJournalists(reconciliation.records.map(item => createdById.get(item.id) || item));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const pendingInterviews = profile
    ? getPendingInterviews(profile, recentMatches, { calendarEvents, partnership, registrations }).filter(interview => {
        return !articles.some(article =>
          (article.source_event_id === interview.sourceId || article.related_event === interview.relatedEvent) &&
          (
            article.article_type === 'entrevista' ||
            article.article_type === 'repercussao' ||
            article.article_type === 'rumor' ||
            article.article_type === 'especulacao' ||
            article.article_type === 'previsao'
          )
        );
      })
    : [];

  async function handleStartInterview(interview) {
    // Pick journalist based on interview type
    const bias = interview.questionCategory === 'post_loss' || interview.questionCategory === 'rumor' ? 'critical' : 'any';
    const journalist = pickJournalist(bias);
    // Find in saved journalists or use template
    const saved = journalists.find(j => j.name === journalist.name) || journalist;
    setActiveInterview(interview);
    setActiveJournalist(saved);
  }

  useEffect(() => {
    const interviewId = searchParams.get('interview');
    const sourceId = searchParams.get('source');
    const requestKey = interviewId || sourceId;
    if (!requestKey || loading || openedResourceRef.current === requestKey) return;
    const interview = pendingInterviews.find((item) => item.id === interviewId || item.sourceId === sourceId || item.sourceId === interviewId);
    openedResourceRef.current = requestKey;
    setActiveTab('interviews');
    if (interview) {
      void handleStartInterview(interview);
      return;
    }
    const resolvedArticle = articles.find((article) => article.source_event_id === sourceId || article.source_event_id === interviewId || article.id === interviewId);
    if (resolvedArticle) setSelectedArticle(resolvedArticle);
  }, [articles, journalists, loading, pendingInterviews, searchParams]);

  async function handleCompleteInterview(result) {
    const { headline, content, tone, effects, journalist, interview } = result;

    try {
      const postMatch = isPostMatchInterview(interview);
      const officialMatch = postMatch ? findOfficialInterviewMatch(interview, recentMatches, profile) : null;
      if (postMatch && !officialMatch) {
        toast({ title: 'Entrevista indisponível', description: 'Esta partida não é um resultado oficial de torneio.', variant: 'destructive' });
        return false;
      }

      const processedSources = new Set(profile.processed_press_interview_sources || []);
      const alreadyProcessed = processedSources.has(interview.sourceId);
      const answered = articles.find((item) => item.source_event_id === interview.sourceId && item.interview_status === 'answered');
      if (answered && alreadyProcessed) return true;

      if (postMatch && !alreadyProcessed) {
        await incrementMissionProgress(
          profile.id,
          ['complete_interview', 'give_interview', 'respond_interview'],
          1,
          profile.career_date,
          { triggerEventId: interview.sourceId },
        );
      }

      // Create article
      const articleId = `press-response-${interview.id}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
      const article = await localGame.entities.PressArticle.upsert(articleId, {
        profile_id: profile.id,
        journalist_id: journalist.id,
        journalist_name: journalist.name,
        outlet: journalist.outlet,
        article_type: interview.questionCategory === 'post_win' ? 'repercussao'
          : interview.questionCategory === 'post_loss' ? 'repercussao'
          : interview.questionCategory === 'rumor' ? 'rumor'
          : interview.questionCategory === 'speculation' ? 'especulacao'
          : interview.questionCategory === 'prediction' ? 'previsao'
          : 'entrevista',
        title: headline,
        content,
        tone,
        reputation_change: effects.reputation || 0,
        fan_appeal_change: effects.fan_appeal || 0,
        sponsor_appeal_change: effects.sponsor_appeal || 0,
        morale_change: effects.morale || 0,
        related_event: interview.relatedEvent,
        source_event_id: interview.sourceId,
        interview_status: 'answered',
        answered_at: new Date().toISOString(),
        career_date: profile.career_date,
        is_read: false,
      });

      // Efeitos e contadores são aplicados uma única vez por sourceId, mesmo
      // após retry/reload. O artigo usa upsert com a mesma identidade.
      if (!alreadyProcessed) {
        const progressPatch = postMatch
          ? buildOfficialInterviewProgressPatch(profile, interview, recentMatches)
          : {};
        const profileUpdates = {
          ...applyReputationEffects(profile, effects),
          ...progressPatch,
          processed_press_interview_sources: [...processedSources, interview.sourceId].slice(-200),
        };
        const updated = await localGame.entities.PlayerProfile.update(profile.id, profileUpdates);
        setProfile(updated);
      }

      // Update journalist bias
      if (journalist.id && !alreadyProcessed) {
        try {
          const newBias = Math.max(-100, Math.min(100, (journalist.bias_toward_player || 0) + (effects.journalist_bias || 0)));
          await localGame.entities.PressJournalist.update(journalist.id, {
            bias_toward_player: newBias,
            interviews_done: (journalist.interviews_done || 0) + 1,
          });
        } catch (e) { console.error(e); }
      }

      // Atualiza a interface localmente sem desmontar e remontar o modal.
      setArticles(prev => [article, ...prev].slice(0, 50));
      if (!alreadyProcessed) setJournalists(prev => prev.map(item =>
        item.id === journalist.id
          ? {
              ...item,
              bias_toward_player: Math.max(-100, Math.min(100, (item.bias_toward_player || 0) + (effects.journalist_bias || 0))),
              interviews_done: (item.interviews_done || 0) + 1,
            }
          : item
      ));

      toast({
        title: 'Entrevista Publicada!',
        description: `${journalist.name} publicou: "${headline.substring(0, 50)}..."`,
      });

      return true;
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro', description: 'Falha ao publicar entrevista.', variant: 'destructive' });
      return false;
    }
  }

  async function handleReadArticle(article) {
    if (!article.is_read) {
      try {
        await localGame.entities.PressArticle.update(article.id, { is_read: true });
        await load();
      } catch (e) { console.error(e); }
    }
    setSelectedArticle(article);
  }

  if (loading) return <LoadingScreen />;

  const fanAppeal = profile?.fan_appeal || 50;
  const sponsorAppeal = profile?.sponsor_appeal || 50;
  const morale = profile?.morale || 70;
  const unreadCount = articles.filter(a => !a.is_read).length;

  return (
    <Page size="default">
      <PageContent>
      <PageHeader
        eyebrow="Relacionamento com a mídia"
        title="Imprensa Esportiva"
        description="Entrevistas, coletivas, rumores e repercussões. Suas respostas moldam reputação, fãs e patrocinadores."
        icon={Newspaper}
        tone="brand"
        breadcrumb={['Mundo', 'Imprensa']}
      />

      <CardGrid columns={3}>
        <StatCard label="Apego dos fãs" value={fanAppeal} detail="Popularidade com o público" icon={Star} tone="brand" />
        <StatCard label="Patrocinadores" value={sponsorAppeal} detail="Atratividade comercial" icon={TrendingUp} tone="premium" />
        <StatCard label="Moral" value={morale} detail="Momento emocional" icon={Sparkles} tone="info" />
      </CardGrid>

      <Surface padding="compact">
      <div className="flex gap-2">
        {[
          { id: 'feed', label: 'Feed', icon: Newspaper, badge: unreadCount },
          { id: 'interviews', label: 'Entrevistas', icon: Mic, badge: pendingInterviews.length },
          { id: 'journalists', label: 'Jornalistas', icon: Users },
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.badge > 0 && <span className="text-[10px] bg-background/30 px-1.5 py-0.5 rounded-full">{t.badge}</span>}
            </button>
          );
        })}
      </div>
      </Surface>

      {/* Feed Tab */}
      {activeTab === 'feed' && (
        articles.length === 0 ? (
          <EmptyStateCard icon={Newspaper} title="Nenhuma notícia ainda" message="Complete entrevistas e jogue partidas para gerar manchetes." />
        ) : (
          <div className="space-y-3 animate-stagger">
            {articles.map(a => (
              <ArticleCard key={a.id} article={a} onClick={() => handleReadArticle(a)} />
            ))}
          </div>
        )
      )}

      {/* Interviews Tab */}
      {activeTab === 'interviews' && (
        pendingInterviews.length === 0 ? (
          <EmptyStateCard icon={Mic} title="Sem entrevistas agendadas" message="Jogue partidas para desbloquear entrevistas." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
            {pendingInterviews.map(interview => (
              <div key={interview.id} className="glass rounded-2xl p-4 hover-lift">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Mic className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{interview.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{interview.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleStartInterview(interview)}
                  className="w-full py-2 rounded-xl bg-primary/15 text-primary font-semibold text-sm hover:bg-primary/25 transition-colors flex items-center justify-center gap-2"
                >
                  <Mic className="h-4 w-4" /> Iniciar
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Journalists Tab */}
      {activeTab === 'journalists' && (
        journalists.length === 0 ? (
          <EmptyStateCard icon={Users} title="Nenhum jornalista" message="Os jornalistas aparecerão aqui." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger">
            {journalists.map(j => (
              <JournalistCard key={j.id} journalist={j} onClick={() => setActiveJournalist(j)} />
            ))}
          </div>
        )
      )}

      {/* Interview Modal */}
      {activeInterview && activeJournalist && (
        <InterviewModal
          interview={activeInterview}
          journalist={activeJournalist}
          profile={profile}
          onClose={() => { setActiveInterview(null); setActiveJournalist(null); }}
          onComplete={handleCompleteInterview}
        />
      )}

      {/* Article Detail Modal */}
      {selectedArticle && (
        <ModalShell open onClose={() => setSelectedArticle(null)} title={selectedArticle.title} description={`${selectedArticle.outlet} · ${selectedArticle.journalist_name}`} size="sm">
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1">
                <p className="text-[9px] font-bold uppercase tracking-wide text-primary mb-1">{selectedArticle.outlet}</p>
                <p className="font-bold text-base leading-tight">{selectedArticle.title}</p>
              </div>
              <button onClick={() => setSelectedArticle(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Fechar</button>
            </div>
            <div className="flex items-center gap-2 mb-3 text-[10px] text-muted-foreground">
              <span>Por {selectedArticle.journalist_name}</span>
              <span>·</span>
              <span>{selectedArticle.career_date}</span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedArticle.content}</p>
            {(selectedArticle.reputation_change !== 0 || selectedArticle.fan_appeal_change !== 0) && (
              <div className="mt-4 pt-3 border-t border-border/40">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Impacto na Reputação</p>
                <div className="flex flex-wrap gap-2">
                  {selectedArticle.reputation_change !== 0 && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${selectedArticle.reputation_change > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {selectedArticle.reputation_change > 0 ? '+' : ''}{selectedArticle.reputation_change} Reputação
                    </span>
                  )}
                  {selectedArticle.fan_appeal_change !== 0 && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${selectedArticle.fan_appeal_change > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {selectedArticle.fan_appeal_change > 0 ? '+' : ''}{selectedArticle.fan_appeal_change} Fãs
                    </span>
                  )}
                  {selectedArticle.sponsor_appeal_change !== 0 && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${selectedArticle.sponsor_appeal_change > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {selectedArticle.sponsor_appeal_change > 0 ? '+' : ''}{selectedArticle.sponsor_appeal_change} Patrocinadores
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Journalist Detail Modal */}
      {activeJournalist && !activeInterview && (
        <ModalShell open onClose={() => setActiveJournalist(null)} title={activeJournalist.name} description={`${activeJournalist.outlet} · ${activeJournalist.nationality}`} size="sm">
          <div>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-4xl">{activeJournalist.avatar_emoji}</span>
              <div className="flex-1">
                <p className="font-bold text-base">{activeJournalist.name}</p>
                <p className="text-xs text-muted-foreground">{activeJournalist.outlet} · {activeJournalist.nationality}</p>
              </div>
              <button onClick={() => setActiveJournalist(null)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
            </div>
            <div className="glass rounded-xl p-3 bg-secondary/30 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Estilo</p>
              <p className="text-sm italic">"{activeJournalist.signature_style}"</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="glass rounded-xl p-2.5 bg-secondary/30">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">Personalidade</p>
                <p className="text-xs font-bold text-primary">{activeJournalist.personality}</p>
              </div>
              <div className="glass rounded-xl p-2.5 bg-secondary/30">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">Especialidade</p>
                <p className="text-xs font-bold text-cyan-400">{activeJournalist.specialty}</p>
              </div>
            </div>
            <div className="glass rounded-xl p-2.5 bg-secondary/30 mt-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Relação com você</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(activeJournalist.bias_toward_player || 0) >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.abs(activeJournalist.bias_toward_player || 0)}%` }}
                  />
                </div>
                <span className="text-xs font-bold">{activeJournalist.bias_toward_player || 0}</span>
              </div>
            </div>
          </div>
        </ModalShell>
      )}
      </PageContent>
    </Page>
  );
}
