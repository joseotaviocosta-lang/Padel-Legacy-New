import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareer } from './useCareer.js';

export function ActiveCareerGuard({ children }) {
  const { activeCareer, loading } = useCareer();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !activeCareer) {
      navigate('/careers', { replace: true });
    }
  }, [activeCareer, loading, navigate]);

  if (loading || !activeCareer) {
    return <div className="p-4">Carregando carreira...</div>;
  }

  return children;
}
