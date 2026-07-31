import React from 'react';
import { X, MessageCircle, Gift, Dumbbell, Heart, ThumbsDown, Hand } from 'lucide-react';

const ACTIONS = [
  { id: 'elogiar', label: 'Elogiar', icon: MessageCircle, color: 'text-green-400', desc: 'Elogiar em entrevista (+4)' },
  { id: 'provocar', label: 'Provocar', icon: ThumbsDown, color: 'text-red-400', desc: 'Provocação pública (-6)' },
  { id: 'convidar_treino', label: 'Treinar', icon: Dumbbell, color: 'text-primary', desc: 'Convidar para treinar (+6)' },
  { id: 'presente', label: 'Presentear', icon: Gift, color: 'text-amber-400', desc: 'Presente com item (+8)' },
  { id: 'apoiar', label: 'Apoiar', icon: Heart, color: 'text-pink-400', desc: 'Apoio em dificuldade (+5)' },
  { id: 'ignorar', label: 'Ignorar', icon: Hand, color: 'text-slate-400', desc: 'Ignorar em evento (-2)' },
];

export default function InteractionPanel({ relationship, onInteract, onClose }) {
  if (!relationship) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Interagir com</p>
          <p className="font-bold text-sm">{relationship.target_name}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onInteract(action.id)}
              className="glass rounded-xl p-2.5 flex flex-col items-center gap-1 hover-lift press-scale"
            >
              <Icon className={`h-5 w-5 ${action.color}`} />
              <span className="text-[10px] font-bold">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}