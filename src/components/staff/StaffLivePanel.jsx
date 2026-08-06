import React from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit, CalendarCheck, MessageSquareText, Sparkles, UsersRound } from 'lucide-react';
import { Surface, SurfaceHeader, StatCard, StatusBadge, ProgressBar } from '@/components/design-system';

const moodTone = (score) => score >= 70 ? 'success' : score >= 45 ? 'warning' : 'danger';

export default function StaffLivePanel({ meeting }) {
  if (!meeting) return null;
  return <div className="space-y-4">
    <Surface variant="premium">
      <SurfaceHeader title="Comissão técnica viva" description="A equipe analisa a carreira em conjunto e explica cada recomendação." icon={UsersRound} action={<StatusBadge tone={moodTone(meeting.moral)}>Moral {meeting.moral}%</StatusBadge>} />
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Sinergia" value={`${meeting.synergy}%`} detail="integração entre especialistas" icon={Sparkles} tone={moodTone(meeting.synergy)} /><StatCard label="Profissionais" value={meeting.members} detail="especialistas ativos" icon={UsersRound} tone="info" /><StatCard label="Plano da semana" value={meeting.plan.label} detail="recomendação do treinador" icon={CalendarCheck} tone="brand" /></div>
    </Surface>
    <div className="grid gap-4 lg:grid-cols-2">
      <Surface><SurfaceHeader title="Reunião da comissão" description={`Semana iniciada em ${meeting.week}`} icon={MessageSquareText} />
        <div className="space-y-2">{meeting.notes.map((note, index) => <div key={`${note.role}-${index}`} className="rounded-xl bg-secondary/25 p-3"><p className="text-[10px] font-bold uppercase text-primary">{note.role}</p><p className="mt-1 text-xs font-semibold">{note.name}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{note.text}</p></div>)}</div>
      </Surface>
      <Surface><SurfaceHeader title="Clima profissional" description="Satisfação influencia evolução, renovação e permanência." icon={BrainCircuit} />
        <div className="space-y-3">{meeting.moods.length ? meeting.moods.map((member) => <div key={member.id}><div className="mb-1 flex items-center justify-between"><div><p className="text-xs font-bold">{member.name}</p><p className="text-[9px] text-muted-foreground">{member.role}</p></div><StatusBadge tone={moodTone(member.score)}>{member.label}</StatusBadge></div><ProgressBar value={member.score} max={100} /></div>) : <div className="rounded-xl bg-secondary/25 p-4 text-xs text-muted-foreground">Contrate profissionais de apoio para ampliar as análises da comissão.</div>}</div>
        <Link to="/communications" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary">Abrir histórico de reuniões <MessageSquareText className="h-3.5 w-3.5" /></Link>
      </Surface>
    </div>
  </div>;
}
