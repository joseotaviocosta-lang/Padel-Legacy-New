import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { QUESTION_BANKS, fillTemplate, generateHeadline, generateArticleContent, toneFromEffects } from '@/lib/pressData';
import { ModalShell } from '@/components/design-system';

const PERSONALITY_LABELS = {
  critico: 'Crítico', sensacionalista: 'Sensacionalista', tecnico: 'Técnico',
  passional: 'Passional', neutro: 'Neutro', provocador: 'Provocador',
};

const TONE_LABELS = {
  humilde: { label: 'Humilde', color: 'text-green-400 bg-green-500/15' },
  confiante: { label: 'Confiante', color: 'text-primary bg-primary/15' },
  neutro: { label: 'Neutro', color: 'text-muted-foreground bg-secondary/50' },
  arrogante: { label: 'Arrogante', color: 'text-red-400 bg-red-500/15' },
  fechado: { label: 'Festivo', color: 'text-cyan-400 bg-cyan-500/15' },
  provocativo: { label: 'Provocativo', color: 'text-orange-400 bg-orange-500/15' },
  controverso: { label: 'Controverso', color: 'text-purple-400 bg-purple-500/15' },
};

export default function InterviewModal({ interview, journalist, profile, onClose, onComplete }) {
  const questions = QUESTION_BANKS[interview.questionCategory] || [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultData, setResultData] = useState(null);

  if (questions.length === 0) {
    return (
      <ModalShell open onClose={onClose} title="Entrevista" size="sm">
        <div>
          <p className="text-sm text-muted-foreground">Nenhuma pergunta disponível.</p>
          <button onClick={onClose} className="mt-4 text-xs text-primary font-bold">Fechar</button>
        </div>
      </ModalShell>
    );
  }

  const question = questions[currentIdx];
  const isLast = currentIdx === questions.length - 1;
  const totalEffects = answers.reduce((acc, a) => {
    Object.keys(a.effects || {}).forEach(k => { acc[k] = (acc[k] || 0) + a.effects[k]; });
    return acc;
  }, { fan_appeal: 0, sponsor_appeal: 0, morale: 0, reputation: 0, journalist_bias: 0 });

  function handleAnswer(answer) {
    if (saving || done) return;
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    if (isLast) {
      finish(newAnswers);
    } else {
      setCurrentIdx(currentIdx + 1);
    }
  }

  async function finish(allAnswers) {
    const effects = allAnswers.reduce((acc, a) => {
      Object.keys(a.effects || {}).forEach(k => { acc[k] = (acc[k] || 0) + a.effects[k]; });
      return acc;
    }, { fan_appeal: 0, sponsor_appeal: 0, morale: 0, reputation: 0, journalist_bias: 0 });

    const tone = toneFromEffects(effects);
    const playerName = profile?.sport_name || 'O Jogador';
    const opponent = interview.opponent || 'o adversário';
    const vars = { player: playerName, opponent };

    let headlineType = interview.questionCategory === 'post_win' ? 'win_convincing'
      : interview.questionCategory === 'post_loss' ? 'loss_close'
      : interview.questionCategory === 'rumor' ? 'rumor_partner'
      : interview.questionCategory === 'speculation' ? 'speculation'
      : interview.questionCategory === 'prediction' ? 'prediction'
      : 'praise';

    const headline = generateHeadline(headlineType, vars);
    const content = generateArticleContent(headlineType, tone, journalist, vars);

    setSaving(true);
    try {
      const completed = await onComplete({ headline, content, tone, effects, journalist, interview });
      if (completed !== false) {
        setResultData({ headline, effects });
        setDone(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <ModalShell open onClose={onClose} title="Entrevista publicada" description={journalist.name} size="sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{journalist.avatar_emoji}</span>
            <div>
              <p className="font-bold text-sm">{journalist.name}</p>
              <p className="text-[10px] text-muted-foreground">{journalist.outlet}</p>
            </div>
          </div>
          <div className="glass rounded-xl p-3 mb-3 bg-secondary/30">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Manchete Publicada</p>
            <p className="text-sm font-bold leading-tight">{(resultData?.effects?.reputation || 0) >= 0 ? '⭐' : '⚠️'} {resultData?.headline || 'Entrevista publicada'}</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Entrevista publicada! Reputação atualizada.</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {totalEffects.fan_appeal !== 0 && <EffectChip label="Apego Fãs" value={totalEffects.fan_appeal} />}
            {totalEffects.sponsor_appeal !== 0 && <EffectChip label="Apego Patroc." value={totalEffects.sponsor_appeal} />}
            {totalEffects.morale !== 0 && <EffectChip label="Moral" value={totalEffects.morale} />}
            {totalEffects.reputation !== 0 && <EffectChip label="Reputação" value={totalEffects.reputation} />}
          </div>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" /> Concluir
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open onClose={onClose} title={interview.title || 'Entrevista'} description={`${journalist.name} · ${journalist.outlet}`} size="sm">
      <div>
        {/* Journalist header */}
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border/40">
          <span className="text-3xl">{journalist.avatar_emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{journalist.name}</p>
            <p className="text-[10px] text-muted-foreground">{journalist.outlet} · {journalist.nationality}</p>
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded mt-1">
              {PERSONALITY_LABELS[journalist.personality]}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Interview title */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">{interview.title}</p>
          <p className="text-[11px] text-muted-foreground">{interview.description}</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-4">
          {questions.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i <= currentIdx ? 'bg-primary' : 'bg-secondary/60'}`} />
          ))}
        </div>

        {/* Question */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-primary font-bold mb-1.5">Pergunta {currentIdx + 1}</p>
          <p className="text-sm font-medium leading-relaxed">{fillTemplate(question.text, { opponent: interview.opponent, player: profile?.sport_name })}</p>
        </div>

        {/* Answers */}
        <div className="space-y-2">
          {question.answers.map((answer, i) => {
            const toneInfo = TONE_LABELS[answer.tone] || TONE_LABELS.neutro;
            return (
              <button
                key={i}
                onClick={() => handleAnswer(answer)}
                disabled={saving}
                className="w-full text-left p-3 rounded-xl glass hover:border-primary/40 hover:bg-primary/5 transition-all group disabled:opacity-50 disabled:cursor-wait"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs leading-relaxed flex-1">{answer.text}</p>
                  <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${toneInfo.color}`}>
                    {toneInfo.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Skip */}
        <button onClick={onClose} className="w-full mt-3 text-[10px] text-muted-foreground hover:text-foreground font-medium">
          Cancelar entrevista
        </button>
      </div>
    </ModalShell>
  );
}

function EffectChip({ label, value }) {
  const positive = value > 0;
  return (
    <div className={`glass rounded-lg p-2 text-center ${positive ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
      <p className={`text-sm font-black ${positive ? 'text-green-400' : 'text-red-400'}`}>{positive ? '+' : ''}{value}</p>
      <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}
