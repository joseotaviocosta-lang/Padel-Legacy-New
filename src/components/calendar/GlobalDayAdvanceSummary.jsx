import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DayAdvanceSummary from './DayAdvanceSummary';

export default function GlobalDayAdvanceSummary() {
  const [summary, setSummary] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleDayAdvanced = event => {
      // Agenda a renderização para o próximo frame, depois que a página terminar
      // de atualizar seu próprio estado. Isso reduz travamentos visuais.
      window.requestAnimationFrame(() => setSummary(event.detail));
    };
    window.addEventListener('padel:day-advanced', handleDayAdvanced);
    return () => window.removeEventListener('padel:day-advanced', handleDayAdvanced);
  }, []);

  return (
    <DayAdvanceSummary
      summary={summary}
      onClose={() => setSummary(null)}
      onOpenCalendar={() => {
        setSummary(null);
        navigate('/game/calendar');
      }}
    />
  );
}
