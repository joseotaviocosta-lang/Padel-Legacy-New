import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareer } from './useCareer.js';

export function ActiveCareerGuard({ children }) {
  const { activeCareer, loading, refreshActiveCareer } = useCareer();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const verificationRef = useRef(false);

  useEffect(() => {
    if (loading || activeCareer || verificationRef.current) return undefined;
    let active = true;
    verificationRef.current = true;
    setVerifying(true);
    refreshActiveCareer()
      .then((career) => {
        if (active && !career) navigate('/careers', { replace: true });
      })
      .catch(() => {
        if (active) navigate('/careers', { replace: true });
      })
      .finally(() => {
        verificationRef.current = false;
        if (active) setVerifying(false);
      });
    return () => { active = false; };
  }, [activeCareer, loading, navigate, refreshActiveCareer]);

  if (loading || verifying || !activeCareer) {
    return <div className="p-4">Carregando carreira...</div>;
  }

  return children;
}
