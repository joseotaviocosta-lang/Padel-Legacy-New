import { useEffect, useMemo, useState, useCallback } from 'react';
import { CareerContext } from './CareerContext.jsx';
import { CareerManager } from './CareerManager.js';
import { gameRepository } from '@/gameplay/services/runtime.js';

const careerManager = new CareerManager();

export function CareerProvider({ children }) {
  const [careers, setCareers] = useState([]);
  const [activeCareer, setActiveCareer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reloadCareers = useCallback(async () => {
    try {
      const careerList = await careerManager.listCareers({ includeArchived: true });
      setCareers(careerList);
      setError('');
      return careerList;
    } catch (e) {
      console.error('CareerProvider reloadCareers', e);
      setError(e.message || 'Falha ao carregar carreiras');
      throw e;
    }
  }, []);

  const selectCareer = useCallback(async (careerId) => {
    setLoading(true);
    try {
      const careerData = await careerManager.loadCareer(careerId);
      gameRepository.setActiveCareer(careerData);
      setActiveCareer(careerData);
      setError('');
      return careerData;
    } finally {
      setLoading(false);
    }
  }, []);

  const createCareer = useCallback(async (payload) => {
    const result = await careerManager.createCareer(payload);
    gameRepository.setActiveCareer(result.career);
    setActiveCareer(result.career);
    await reloadCareers();
    return result;
  }, [reloadCareers]);

  const renameCareer = useCallback(async (careerId, newName) => {
    await careerManager.renameCareer(careerId, newName);
    if (activeCareer?.career_id === careerId) await selectCareer(careerId);
    await reloadCareers();
  }, [activeCareer?.career_id, reloadCareers, selectCareer]);

  const duplicateCareer = useCallback(async (careerId, options = {}) => {
    const result = await careerManager.duplicateCareer(careerId, options);
    await reloadCareers();
    return result;
  }, [reloadCareers]);

  const archiveCareer = useCallback(async (careerId) => {
    await careerManager.archiveCareer(careerId);
    if (activeCareer?.career_id === careerId) {
      setActiveCareer(null);
      gameRepository.clearActiveCareer();
    }
    await reloadCareers();
  }, [activeCareer?.career_id, reloadCareers]);

  const deleteCareer = useCallback(async (careerId) => {
    await careerManager.deleteCareer(careerId, { confirmed: true });
    if (activeCareer?.career_id === careerId) {
      setActiveCareer(null);
      gameRepository.clearActiveCareer();
    }
    await reloadCareers();
  }, [activeCareer?.career_id, reloadCareers]);

  const refreshActiveCareer = useCallback(async () => {
    const career = await gameRepository.getActiveCareer({ fresh: true });
    setActiveCareer(career);
    return career;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        await reloadCareers();
        const lastId = await careerManager.getLastCareer();
        if (lastId && mounted) {
          const career = await careerManager.loadCareer(lastId);
          gameRepository.setActiveCareer(career);
          setActiveCareer(career);
        }
      } catch (e) {
        if (mounted) setError(e.message || 'Falha ao inicializar carreiras');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [reloadCareers]);

  const contextValue = useMemo(() => ({
    careers, activeCareer, loading, error, selectCareer, createCareer,
    renameCareer, duplicateCareer, archiveCareer, deleteCareer,
    reloadCareers, refreshActiveCareer,
  }), [careers, activeCareer, loading, error, selectCareer, createCareer, renameCareer,
    duplicateCareer, archiveCareer, deleteCareer, reloadCareers, refreshActiveCareer]);

  return <CareerContext.Provider value={contextValue}>{children}</CareerContext.Provider>;
}
