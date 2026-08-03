import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, BadgeCheck, Flame, TrendingUp, Send } from 'lucide-react';
import { AUTHOR_TYPES, getViralStatus, generateAutoComment } from '@/lib/socialNetwork';

const POST_TYPE_LABELS = {
  resultado: 'Resultado', conquista: 'Conquista', torneio: 'Torneio',
  critica: 'Crítica', elogio: 'Elogio', rumor: 'Rumor',
  tendencia: 'Tendência', motivacional: 'Motivacional', geral: 'Geral',
};

export default function SocialPost({ post, profile, onLike, onComment, onShare }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [autoComments, setAutoComments] = useState([]);

  const authorMeta = AUTHOR_TYPES[post.author_type] || AUTHOR_TYPES.torcedor;
  const viral = getViralStatus(post);
  const liked = (post.liked_by || []).includes(profile?.id || 'me');

  async function handleComment() {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await onComment(post, commentText.trim());
      setCommentText('');

      // Generate an auto-reply comment from a fan
      if (Math.random() > 0.4) {
        const reply = generateAutoComment(profile);
        setTimeout(() => {
          setAutoComments(prev => [...prev, reply]);
        }, 800 + Math.random() * 1200);
      }
    } catch (e) { console.error(e); }
    setSubmitting(false);
  }

  const allComments = [...(post.comments || []), ...autoComments];

  return (
    <div className={`glass rounded-2xl p-4 ${viral === 'mega' ? 'border-amber-500/40 glow-primary' : viral ? 'border-primary/30' : ''}`}>
      {/* Author header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative shrink-0">
          <div className={`h-10 w-10 rounded-xl ${authorMeta.bg} flex items-center justify-center`}>
            <span className="text-lg">{authorMeta.emoji}</span>
          </div>
          {post.author_verified && (
            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
              <BadgeCheck className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm truncate">{post.author_name}</p>
            {post.author_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">@{post.author_handle || 'anon'}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className={`text-[9px] font-bold uppercase tracking-wide ${authorMeta.color}`}>{authorMeta.label}</span>
          </div>
        </div>
        {viral && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold uppercase ${viral === 'mega' ? 'bg-amber-500/15 text-amber-400' : 'bg-primary/15 text-primary'}`}>
            {viral === 'mega' ? <><Flame className="h-3 w-3" /> Mega Viral</> : <><TrendingUp className="h-3 w-3" /> Viral</>}
          </div>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap mb-2">{post.content}</p>

      {/* Trend tag */}
      {post.trend_tag && (
        <div className="mb-2">
          <span className="text-xs font-bold text-primary">{post.trend_tag}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-border/40">
        <button
          onClick={() => onLike(post)}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${liked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} /> {post.likes || 0}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-4 w-4" /> {allComments.length || ''}
        </button>
        <button
          onClick={() => onShare(post)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Share2 className="h-4 w-4" /> {post.shares || 0}
        </button>
        {post.follower_gain > 0 && (
          <span className="ml-auto text-[10px] font-bold text-green-400">+{post.follower_gain} seguidores</span>
        )}
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
          {allComments.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-2">Seja o primeiro a comentar!</p>
          ) : (
            allComments.slice(-5).map((c, i) => {
              const cMeta = AUTHOR_TYPES[c.author_type] || AUTHOR_TYPES.torcedor;
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className={`h-6 w-6 rounded-lg ${cMeta.bg} flex items-center justify-center shrink-0`}>
                    <span className="text-xs">{cMeta.emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">{c.author_name}</span>
                      <span className="text-[9px] text-muted-foreground">@{c.author_handle}</span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-tight">{c.content}</p>
                  </div>
                  {c.likes > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                      <Heart className="h-2.5 w-2.5" /> {c.likes}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {/* Comment input */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleComment(); }}
              placeholder="Escreva um comentário..."
              className="padel-input flex-1 text-xs py-1.5 px-3"
              disabled={submitting}
            />
            <button
              onClick={handleComment}
              disabled={submitting || !commentText.trim()}
              className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}