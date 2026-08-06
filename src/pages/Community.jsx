import React, { useEffect, useState } from 'react';
import { Flame, Heart, MessageCircle, Send, Share2, Sparkles, Swords, Trophy } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, levelForXp } from '@/lib/padel';
import { LevelBadge } from '@/components/padel/Shared';
import { EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import { CardGrid, Page, PageContent, PageHeader, PageSection, StatCard, StatusBadge, Surface } from '@/components/design-system';

const POST_TYPE_META = {
  resultado: { icon: Swords, color: 'text-cyan-400 bg-cyan-500/10', label: 'Resultado' },
  conquista: { icon: Trophy, color: 'text-amber-400 bg-amber-500/10', label: 'Conquista' },
  torneio: { icon: Flame, color: 'text-purple-400 bg-purple-500/10', label: 'Torneio' },
  geral: { icon: Sparkles, color: 'text-primary bg-primary/10', label: 'Geral' },
};

export default function Community() {
  const [posts, setPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState('geral');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const playerProfile = await ensureMyProfile(user);
        setProfile(playerProfile);
        const list = await localGame.entities.Post.list('-created_date', 50);
        setPosts(list || []);
      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    })();
  }, []);

  async function publish() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await localGame.entities.Post.create({
        author_name: profile?.sport_name || 'Jogador',
        author_avatar: profile?.avatar_url || '',
        author_level: levelForXp(profile?.xp || 0),
        content: content.trim(),
        post_type: postType,
        likes: 0,
        liked_by: [],
      });
      setContent('');
      setPostType('geral');
      const list = await localGame.entities.Post.list('-created_date', 50);
      setPosts(list || []);
    } catch (error) { console.error(error); }
    finally { setSubmitting(false); }
  }

  async function toggleLike(post) {
    const userId = profile?.id || 'me';
    const liked = (post.liked_by || []).includes(userId);
    const likedBy = liked ? (post.liked_by || []).filter((id) => id !== userId) : [...(post.liked_by || []), userId];
    try {
      const updated = await localGame.entities.Post.update(post.id, { liked_by: likedBy, likes: likedBy.length });
      setPosts((previous) => previous.map((item) => item.id === post.id ? updated : item));
    } catch (error) { console.error(error); }
  }

  if (loading) return <LoadingScreen />;

  const totalLikes = posts.reduce((sum, post) => sum + Number(post.likes || 0), 0);
  const resultPosts = posts.filter((post) => post.post_type === 'resultado').length;
  const achievementPosts = posts.filter((post) => post.post_type === 'conquista').length;

  return (
    <Page size="compact">
      <PageContent>
        <PageHeader
          eyebrow="Comunidade do circuito"
          title="Comunidade"
          description="Compartilhe sua trajetória, acompanhe resultados e participe da conversa do padel."
          icon={Sparkles}
          tone="brand"
          breadcrumb={['Mundo', 'Comunidade']}
          stats={[
            <StatusBadge key="posts" tone="brand" icon={MessageCircle}>{posts.length} publicações</StatusBadge>,
            <StatusBadge key="likes" tone="danger" icon={Heart}>{totalLikes} curtidas</StatusBadge>,
          ]}
        />

        <CardGrid columns={3}>
          <StatCard label="Publicações" value={posts.length} detail="Feed da comunidade" icon={MessageCircle} tone="brand" />
          <StatCard label="Resultados" value={resultPosts} detail="Partidas compartilhadas" icon={Swords} tone="info" />
          <StatCard label="Conquistas" value={achievementPosts} detail="Marcos celebrados" icon={Trophy} tone="premium" />
        </CardGrid>

        <Surface variant="elevated">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 to-secondary">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary">{(profile?.sport_name || 'J')[0]?.toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <textarea rows={3} className="padel-input resize-none" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Compartilhe sua jornada no padel..." />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1 overflow-x-auto scrollbar-none">
                  {Object.entries(POST_TYPE_META).map(([key, meta]) => (
                    <button key={key} onClick={() => setPostType(key)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${postType === key ? meta.color : 'text-muted-foreground hover:text-foreground'}`}>{meta.label}</button>
                  ))}
                </div>
                <button onClick={publish} disabled={submitting || !content.trim()} className="pl-button pl-button-primary inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  <Send className="h-4 w-4" />{submitting ? 'Publicando...' : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
        </Surface>

        <PageSection>
          {posts.length === 0 ? (
            <EmptyStateCard icon={MessageCircle} message="Nenhuma publicação ainda. Seja o primeiro a compartilhar!" />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const meta = POST_TYPE_META[post.post_type] || POST_TYPE_META.geral;
                const liked = (post.liked_by || []).includes(profile?.id || 'me');
                const TypeIcon = meta.icon;
                return (
                  <Surface key={post.id} variant="interactive" className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 to-secondary">
                        {post.author_avatar ? <img src={post.author_avatar} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary">{(post.author_name || '?')[0]?.toUpperCase()}</span>}
                      </div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{post.author_name}</p>{post.author_level && <LevelBadge level={post.author_level} size="sm" />}</div>
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${meta.color}`}><TypeIcon className="h-3 w-3" />{meta.label}</span>
                    </div>
                    <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{post.content}</p>
                    {post.image_url && <img src={post.image_url} alt="" className="mb-3 w-full rounded-xl" />}
                    <div className="flex flex-wrap items-center gap-4 border-t border-border/40 pt-3">
                      <button onClick={() => toggleLike(post)} className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${liked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}><Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />{post.likes || 0}</button>
                      <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"><MessageCircle className="h-4 w-4" />Comentários</button>
                      <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"><Share2 className="h-4 w-4" />Compartilhar</button>
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </PageSection>
      </PageContent>
    </Page>
  );
}
