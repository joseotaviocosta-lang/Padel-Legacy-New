import React, { useEffect, useState } from 'react';
import { Sparkles, Send, Users, TrendingUp, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ensureMyProfile, levelForXp } from '@/lib/padel';
import { PageHeader, LoadingScreen, EmptyStateCard } from '@/components/padel/ui';
import SocialPost from '@/components/social/SocialPost';
import TrendPanel from '@/components/social/TrendPanel';
import { generateBatchAutoPosts, generateAutoPost, calculateFollowerGain, getViralStatus, AUTHOR_TYPES } from '@/lib/socialNetwork';
import { useToast } from '@/components/ui/use-toast';

const POST_TYPE_META = {
  geral: { label: 'Geral', color: 'text-primary bg-primary/10' },
  resultado: { label: 'Resultado', color: 'text-cyan-400 bg-cyan-500/10' },
  conquista: { label: 'Conquista', color: 'text-amber-400 bg-amber-500/10' },
  torneio: { label: 'Torneio', color: 'text-purple-400 bg-purple-500/10' },
  critica: { label: 'Crítica', color: 'text-red-400 bg-red-500/10' },
  elogio: { label: 'Elogio', color: 'text-green-400 bg-green-500/10' },
  rumor: { label: 'Rumor', color: 'text-orange-400 bg-orange-500/10' },
  motivacional: { label: 'Motivacional', color: 'text-blue-400 bg-blue-500/10' },
};

export default function Social() {
  const [posts, setPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState('geral');
  const [submitting, setSubmitting] = useState(false);
  const [activeTrend, setActiveTrend] = useState(null);
  const [followers, setFollowers] = useState(0);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const user = await base44.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);

      // Calculate followers from fan_appeal
      const baseFollowers = (p?.fan_appeal || 50) * 120;
      setFollowers(baseFollowers);

      const list = await base44.entities.Post.list('-created_date', 30);
      let allPosts = list || [];

      // Auto-generate posts if feed is thin
      if (allPosts.length < 10) {
        const autoPosts = generateBatchAutoPosts(p, 12);
        try {
          await base44.entities.Post.bulkCreate(autoPosts);
        } catch (e) { console.error(e); }
        const refreshedList = await base44.entities.Post.list('-created_date', 30);
        allPosts = refreshedList || [];
      }

      // Occasionally generate a new auto-post when visiting
      if (Math.random() > 0.5 && allPosts.length > 0) {
        const newPost = generateAutoPost(p);
        try {
          await base44.entities.Post.create(newPost);
          allPosts = [newPost, ...allPosts];
        } catch (e) { console.error(e); }
      }

      setPosts(allPosts);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function publish() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const post = await base44.entities.Post.create({
        author_name: profile?.sport_name || 'Jogador',
        author_handle: (profile?.sport_name || 'jogador').toLowerCase().replace(/\s/g, ''),
        author_avatar: profile?.avatar_url || '',
        author_level: levelForXp(profile?.xp || 0),
        author_type: 'jogador',
        author_verified: (profile?.fan_appeal || 0) >= 70,
        content: content.trim(),
        post_type: postType,
        likes: 0,
        liked_by: [],
        shares: 0,
        comments: [],
        is_viral: false,
        follower_gain: 0,
        profile_id: profile?.id,
        career_date: profile?.career_date,
      });
      setContent('');
      setPostType('geral');
      setPosts(prev => [post, ...prev]);
      toast({ title: 'Publicado!', description: 'Sua mensagem está na rede social.' });
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  }

  async function handleLike(post) {
    const userId = profile?.id || 'me';
    const liked = (post.liked_by || []).includes(userId);
    const liked_by = liked ? (post.liked_by || []).filter(u => u !== userId) : [...(post.liked_by || []), userId];
    const newLikes = liked_by.length;

    let updates = { liked_by, likes: newLikes };

    // Check if post just went viral
    const wasViral = getViralStatus(post);
    const isNowViral = newLikes >= 50;
    if (!wasViral && isNowViral && !liked) {
      updates.is_viral = true;
      const gain = calculateFollowerGain({ ...post, likes: newLikes }, profile);
      if (gain > 0) {
        updates.follower_gain = gain;
        setFollowers(prev => prev + gain);
        // Increase fan appeal
        const newFanAppeal = Math.min(100, (profile.fan_appeal || 50) + 2);
        try {
          const updated = await base44.entities.PlayerProfile.update(profile.id, { fan_appeal: newFanAppeal });
          setProfile(updated);
        } catch (e) { console.error(e); }
        toast({ title: '🔥 Post Viralizou!', description: `+${gain} seguidores ganhos!` });
      }
    }

    try {
      const updated = await base44.entities.Post.update(post.id, updates);
      setPosts(prev => prev.map(p => p.id === post.id ? updated : p));
    } catch (e) { console.error(e); }
  }

  async function handleComment(post, text) {
    const comment = {
      author_name: profile?.sport_name || 'Você',
      author_handle: (profile?.sport_name || 'jogador').toLowerCase().replace(/\s/g, ''),
      author_type: 'jogador',
      content: text,
      created_date: new Date().toISOString(),
      likes: 0,
    };
    const newComments = [...(post.comments || []), comment];
    try {
      const updated = await base44.entities.Post.update(post.id, { comments: newComments });
      setPosts(prev => prev.map(p => p.id === post.id ? updated : p));
    } catch (e) { console.error(e); }
  }

  async function handleShare(post) {
    try {
      const updated = await base44.entities.Post.update(post.id, { shares: (post.shares || 0) + 1 });
      setPosts(prev => prev.map(p => p.id === post.id ? updated : p));
      // Small follower gain for sharing
      if (Math.random() > 0.7) {
        const gain = Math.floor(Math.random() * 5) + 1;
        setFollowers(prev => prev + gain);
        toast({ title: 'Compartilhado!', description: `+${gain} seguidores` });
      } else {
        toast({ title: 'Compartilhado!', description: 'Seus seguidores viram o post.' });
      }
    } catch (e) { console.error(e); }
  }

  if (loading) return <LoadingScreen />;

  const filteredPosts = activeTrend
    ? posts.filter(p => p.trend_tag === activeTrend)
    : posts;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Sparkles} title="Rede Social" subtitle="Atletas, clubes, patrocinadores e torcedores postam em tempo real" accent="primary" />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-xl font-black tabular-nums">{followers.toLocaleString('pt-BR')}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Seguidores</span>
        </div>
        <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1">
          <TrendingUp className="h-4 w-4 text-amber-400" />
          <span className="text-xl font-black tabular-nums">{posts.filter(p => p.is_viral).length}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Posts Virais</span>
        </div>
        <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1">
          <Zap className="h-4 w-4 text-cyan-400" />
          <span className="text-xl font-black tabular-nums">{posts.filter(p => p.post_type === 'critica').length}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Críticas</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: Feed + Composer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Composer */}
          <div className="glass rounded-2xl p-4">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0 overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-black text-primary">{(profile?.sport_name || 'J')[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <textarea
                  rows={2}
                  className="padel-input resize-none"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Compartilhe algo com seus seguidores..."
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1 overflow-x-auto scrollbar-none">
                    {Object.entries(POST_TYPE_META).map(([key, meta]) => (
                      <button
                        key={key}
                        onClick={() => setPostType(key)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${postType === key ? meta.color : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {meta.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={publish}
                    disabled={submitting || !content.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" /> Publicar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active trend filter */}
          {activeTrend && (
            <div className="glass rounded-xl p-2.5 flex items-center justify-between border border-primary/20">
              <span className="text-xs font-bold text-primary">Filtrando: {activeTrend}</span>
              <button onClick={() => setActiveTrend(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Limpar</button>
            </div>
          )}

          {/* Feed */}
          <div className="space-y-3">
            {filteredPosts.length === 0 ? (
              <EmptyStateCard icon={Sparkles} message="Nenhuma publicação ainda. Seja o primeiro!" />
            ) : (
              filteredPosts.map(post => (
                <SocialPost
                  key={post.id}
                  post={post}
                  profile={profile}
                  onLike={handleLike}
                  onComment={handleComment}
                  onShare={handleShare}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Trends */}
        <div className="space-y-4">
          <TrendPanel activeTrend={activeTrend} onTrendClick={setActiveTrend} />

          {/* Author types info */}
          <div className="glass rounded-2xl p-4">
            <h2 className="font-bold text-sm mb-3">Quem posta aqui?</h2>
            <div className="space-y-2">
              {Object.entries(AUTHOR_TYPES).map(([key, meta]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`h-7 w-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                    <span className="text-sm">{meta.emoji}</span>
                  </div>
                  <span className="text-xs font-semibold">{meta.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}