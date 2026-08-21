import React from 'react';
import { AlertCircle, Calendar, Crown, Dumbbell, FastForward, HeartPulse, Mail, Swords, Target, Trophy } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

// M4.3 (docs/MOBILE_M4_3_GAME_FLOW.md, Parte E): primitive compartilhado —
// no máximo 1 ação principal + 1 secundária, nunca um painel novo. Some
// quando não há ação relevante (Parte E: "deve desaparecer"). O resolver
// (getCareerNextAction, careerNextAction.js) nunca importa JSX — devolve
// uma chave de ícone (string), resolvida aqui, no único lugar que sabe
// desenhar.
const ICONS = {
  trophy: Trophy, dumbbell: Dumbbell, swords: Swords, calendar: Calendar,
  'fast-forward': FastForward, 'heart-pulse': HeartPulse, 'alert-circle': AlertCircle,
  target: Target, mail: Mail, crown: Crown,
};

function ActionButton({ action, level }) {
  if (!action) return null;
  const Icon = ICONS[action.icon] || null;
  return (
    <Button level={level} size="touch" onClick={action.onClick} disabled={action.disabled} className="min-w-0 flex-1 justify-center gap-2">
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="truncate">{action.label}</span>
    </Button>
  );
}

/**
 * @param {object} props
 * @param {{label:string,icon?:string,onClick:Function,disabled?:boolean}} [props.primary]
 * @param {{label:string,icon?:string,onClick:Function,disabled?:boolean}} [props.secondary]
 * @param {string} [props.description] - linha curta de contexto acima dos botões
 * @param {string} [props.className]
 */
export function ContextActionBar({ primary, secondary, description, className }) {
  if (!primary) return null;
  return (
    <div className={cn('flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/60 p-3', className)}>
      {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      <div className="flex items-center gap-2">
        <ActionButton action={primary} level="primary" />
        {secondary && <ActionButton action={secondary} level="secondary" />}
      </div>
    </div>
  );
}
