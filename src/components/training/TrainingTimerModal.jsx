import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Dumbbell } from 'lucide-react';

const DURATION = 0; // instantâneo

export default function TrainingTimerModal({ training, onComplete, onCancel }) {
  const [seconds, setSeconds] = useState(DURATION);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (seconds === 0) {
      const t = setTimeout(() => onComplete(), 800);
      return () => clearTimeout(t);
    }
  }, [seconds]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pct = DURATION > 0 ? ((DURATION - seconds) / DURATION) * 100 : 100;
  const done = seconds === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        className="glass rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden"
      >
        {/* glow bg */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        {/* close */}
        {!done && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* animation area */}
        <div className="relative h-48 flex items-end justify-center mb-6">
          {/* court floor line */}
          <div className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* swinging racket */}
          <motion.div
            animate={done ? { rotate: 0, y: -8, opacity: 0.5 } : { rotate: [-28, 28, -28] }}
            transition={done ? {} : { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-0 origin-bottom"
          >
            <div className="h-14 w-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Dumbbell className="h-7 w-7 text-primary" />
            </div>
          </motion.div>

          {/* bouncing ball */}
          <motion.div
            animate={done ? { y: 0, scale: 1.3 } : { y: [0, -105, 0] }}
            transition={done ? {} : { duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
            className="relative z-10"
          >
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 shadow-[0_0_24px_rgba(250,204,21,0.5)]" />
          </motion.div>

          {/* ball shadow */}
          <motion.div
            animate={done ? { scale: 1.6, opacity: 0 } : { scale: [1, 0.3, 1], opacity: [0.5, 0.1, 0.5] }}
            transition={done ? {} : { duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-0 h-2.5 w-10 rounded-full bg-black/50"
          />
        </div>

        {/* timer or done */}
        {done ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center justify-center mb-1"
          >
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="h-6 w-6 text-primary" />
            </div>
          </motion.div>
        ) : (
          <h2 className="text-4xl font-black tabular-nums text-primary mb-1">
            {mins}:{secs.toString().padStart(2, '0')}
          </h2>
        )}

        <p className="text-sm text-muted-foreground mb-4">
          {done ? 'Treino concluído!' : `Treinando ${training?.label || ''}...`}
        </p>

        {/* progress bar */}
        <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">{Math.round(pct)}%</p>

        {!done && (
          <button
            onClick={onCancel}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar treino
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}