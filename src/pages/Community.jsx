import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Heart, MessageCircle, Share2, Send, Trophy, Flame, Swords, Sparkles, X } from 'lucide-react';
import { ensureMyProfile, levelForXp } from '@/lib/padel';
import { LevelBadge } from '@/components/padel/Shared';
import { LoadingScreen, PageHeader, EmptyStateCard } from '@/components/padel/ui';

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
        const user = await base44.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const list = await base44.entities.Post.list('-created_date', 50);
        setPosts(list || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  async function publish() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await base44.entities.Post.create({
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
      const list = await base44.entities.Post.list('-created_date', 50);
      setPosts(list || []);
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  }

  async function toggleLike(post) {
    const userId = profile?.id || 'me';
    const liked = (post.liked_by || []).includes(userId);
    const liked_by = liked ? (post.liked_by || []).filter(u => u !== userId) : [...(post.liked_by || []), userId];
    try {
      const updated = await base44.entities.Post.update(post.id, { liked_by, likes: liked_by.length });
      setPosts(prev => prev.map(p => p.id === post.id ? updated : p));
    } catch (e) { console.error(e); }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Sparkles} title="Comunidade" subtitle="Feed esportivo do padel" accent="primary" />

      {/* Composer */}
      <div className="glass rounded-2xl p-4">
        <div className="flex gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0 overflow-hidden">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary">{(profile?.sport_name || 'J')[0]?.toUpperCase()}</span>}
          </div>
          <div className="flex-1 space-y-2">
            <textarea
              rows={2}
              className="padel-input resize-none"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Compartilhe sua jornada no padel..."
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {Object.entries(POST_TYPE_META).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => setPostType(key)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${postType === key ? `${meta.color}` : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
              <button
                onClick={publish}
                disabled={submitting || !content.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Publicar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {posts.length === 0 ? (
          <EmptyStateCard icon={MessageCircle} message="Nenhuma publicação ainda. Seja o primeiro a compartilhar!" />
        ) : (
          posts.map((post) => {
            const meta = POST_TYPE_META[post.post_type] || POST_TYPE_META.geral;
            const liked = (post.liked_by || []).includes(profile?.id || 'me');
            return (
              <div key={post.id} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {post.author_avatar ? <img src={post.author_avatar} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary">{(post.author_name || '?')[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{post.author_name}</p>
                    {post.author_level && <LevelBadge level={post.author_level} size="sm" />}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${meta.color}`}>
                    <meta.icon className="h-3 w-3" /> {meta.label}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap mb-3">{post.content}</p>
                {post.image_url && <img src={post.image_url} alt="" className="rounded-xl w-full mb-3" />}
                <div className="flex items-center gap-4 pt-2 border-t border-border/40">
                  <button onClick={() => toggleLike(post)} className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${liked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}>
                    <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} /> {post.likes || 0}
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <MessageCircle className="h-4 w-4" /> Comentários
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <Share2 className="h-4 w-4" /> Compartilhar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}