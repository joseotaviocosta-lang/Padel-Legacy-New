import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Sparkles, Dumbbell, Trophy, Heart, FastForward, Swords, CheckCircle } from 'lucide-react';
import { isInjured, canTrainToday, canPlayMatchToday, isRetired } from '@/lib/padel';

// Analyzes the player's current state and returns the recommended next action.
export function getNextStep(profile, upcomingTournaments) {
  if (!profile) return null;

  if (isRetired(profile)) {
    return {
      icon: CheckCircle,
      title: 'Carreira concluída',
      description: 'Você se aposentou. Revise seu legado e Hall da Fama.',
      to: '/game/legacy',
      cta: 'Ver Legado',
      accent: 'amber',
    };
  }

  if (!profile.court_side) {
    return {
      icon: Users,
      title: 'Escolha seu lado',
      description: 'Complete a missão "Escolha seu lado" no Tutorial.',
      to: '/game/missions',
      cta: 'Ir para a missão',
      accent: 'primary',
    };
  }

  if ((profile.unspent_attribute_points || 0) > 0 && (profile.matches_played || 0) === 0) {
    return {
      icon: Sparkles,
      title: 'Distribua seus atributos',
      description: `Você tem ${profile.unspent_attribute_points} pontos para distribuir antes de começar.`,
      to: '/game',
      cta: 'Distribuir pontos',
      accent: 'primary',
    };
  }

  if (!profile.partner_id) {
    return {
      icon: Users,
      title: 'Selecione um parceiro',
      description: 'Você precisa de uma dupla para jogar torneios e partidas.',
      to: '/partners?view=offers',
      cta: 'Escolher dupla',
      accent: 'cyan',
    };
  }

  if (isInjured(profile)) {
    return {
      icon: Heart,
      title: 'Recuperando lesão',
      description: 'Você está lesionado. Avance o dia para se recuperar.',
      to: '/game/training',
      cta: 'Avançar dia',
      accent: 'red',
    };
  }

  // Check for playable tournament this month
  const playableTournament = (upcomingTournaments || []).find(t => {
    const tMonth = t.month || (t.start_date ? new Date(t.start_date + 'T00:00:00').getMonth() + 1 : 0);
    const careerMonth = profile.career_date ? new Date(profile.career_date + 'T00:00:00').getMonth() + 1 : 1;
    return tMonth === careerMonth && t.status === 'inscricoes';
  });

  if (playableTournament) {
    return {
      icon: Trophy,
      title: `Torneio disponível: ${playableTournament.name}`,
      description: `Tier ${playableTournament.tier}. Inscreva-se e dispute o título!`,
      to: '/tournaments',
      cta: 'Ir para torneios',
      accent: 'amber',
    };
  }

  const trainStatus = canTrainToday(profile);
  const matchStatus = canPlayMatchToday(profile);
  const energy = profile.energy || 0;

  if (energy < 30) {
    return {
      icon: Heart,
      title: 'Energia baixa',
      description: 'Avance um dia sem atividade para recuperar energia. Para recuperação contínua, contrate um fisioterapeuta na equipe.',
      to: '/game/training',
      cta: 'Recuperar',
      accent: 'red',
    };
  }

  if (trainStatus.allowed) {
    return {
      icon: Dumbbell,
      title: 'Hora de treinar',
      description: `Você tem ${trainStatus.remaining} treino(s) disponível(is) hoje. Evolua seus atributos!`,
      to: '/game/training',
      cta: 'Treinar agora',
      accent: 'primary',
    };
  }

  if (matchStatus.allowed) {
    return {
      icon: Swords,
      title: 'Jogue uma partida treino',
      description: 'Pratique sem afetar o ranking. Ganhe XP e moedas.',
      to: '/matches',
      cta: 'Jogar partida',
      accent: 'cyan',
    };
  }

  return {
    icon: FastForward,
    title: 'Avance o dia',
    description: 'Você concluiu todas as atividades de hoje. Avance o calendário para continuar.',
    to: '/game',
    cta: 'Avançar dia',
    accent: 'primary',
  };
}

const ACCENT_STYLES = {
  primary: { bg: 'bg-primary/10', border: 'border-primary/30', text: 'text-primary', btn: 'bg-primary text-primary-foreground' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', btn: 'bg-amber-500 text-amber-950' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', btn: 'bg-cyan-500 text-cyan-950' },
  red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', btn: 'bg-red-500 text-red-950' },
};

export default function NextStepCard({ profile, upcomingTournaments, onAction }) {
  const step = getNextStep(profile, upcomingTournaments);
  if (!step) return null;

  const style = ACCENT_STYLES[step.accent] || ACCENT_STYLES.primary;
  const Icon = step.icon;

  const className = `glass rounded-2xl p-4 border ${style.border} ${style.bg} flex items-center gap-4 hover:scale-[1.01] transition-all press-scale group w-full text-left`;

  const content = (
    <>
      <div className={`h-12 w-12 rounded-xl ${style.bg} flex items-center justify-center shrink-0 ring-1 ${style.border}`}>
        <Icon className={`h-6 w-6 ${style.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-wider ${style.text}`}>Próximo passo</span>
        </div>
        <h3 className="font-bold text-sm leading-tight">{step.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">{step.description}</p>
      </div>
      <div className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ${style.btn} font-bold text-xs shrink-0 group-hover:gap-2 transition-all`}>
        {step.cta} <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </>
  );

  if (onAction) {
    return (
      <button type="button" onClick={onAction} className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link to={step.to} className={className}>
      {content}
    </Link>
  );
}
