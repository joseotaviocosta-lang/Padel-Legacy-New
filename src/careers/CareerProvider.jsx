import { useEffect, useMemo, useState, useCallback } from 'react';
import { CareerContext } from './CareerContext.jsx';
import { CareerManager } from './CareerManager.js';
import { gameRepository } from '@/gameplay/services/runtime.js';
import { missionRuntime } from '@/missions/missionSystem.js';
import { timeAsync } from '@/dev/performanceProbe.js';

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
    missionRuntime.setHydrationStatus('loading');
    try {
      const careerData = await careerManager.loadCareer(careerId);
      gameRepository.setActiveCareer(careerData);
      setActiveCareer(careerData);
      setError('');
      missionRuntime.setHydrationStatus('ready');
      return careerData;
    } catch (error) { missionRuntime.setHydrationStatus('error'); throw error; } finally {
      setLoading(false);
    }
  }, []);

  const createCareer = useCallback(async (payload) => {
    setLoading(true);
    missionRuntime.setHydrationStatus('loading');
    setError('');
    try {
      const result = await careerManager.createCareer(payload);

      // A navegação só recebe a carreira depois que CareerManager confirmou
      // que o arquivo principal está legível e o índice foi persistido.
      gameRepository.setActiveCareer(result.career);
      setActiveCareer(result.career);
      await reloadCareers();
      missionRuntime.setHydrationStatus('ready');
      return result;
    } catch (e) {
      setError(e.message || 'Falha ao criar carreira');
      missionRuntime.setHydrationStatus('error');
      throw e;
    } finally {
      setLoading(false);
    }
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
    (async () => timeAsync('startup: CareerProvider ready', async () => {
      setLoading(true);
      missionRuntime.setHydrationStatus('loading');
      try {
        await reloadCareers();
        const lastId = await careerManager.getLastCareer();
        if (lastId && mounted) {
          const career = await careerManager.loadCareer(lastId);
          gameRepository.setActiveCareer(career);
          setActiveCareer(career);
          missionRuntime.setHydrationStatus('ready');
        } else if (mounted) {
          missionRuntime.setHydrationStatus('idle');
        }
      } catch (e) {
        missionRuntime.setHydrationStatus('error');
        if (mounted) setError(e.message || 'Falha ao inicializar carreiras');
      } finally {
        if (mounted) setLoading(false);
      }
    }))();
    return () => { mounted = false; };
  }, [reloadCareers]);

  const contextValue = useMemo(() => ({
    careers, activeCareer, loading, hydrationStatus: missionRuntime.hydrationStatus, error, selectCareer, createCareer,
    renameCareer, duplicateCareer, archiveCareer, deleteCareer,
    reloadCareers, refreshActiveCareer,
  }), [careers, activeCareer, loading, error, selectCareer, createCareer, renameCareer,
    duplicateCareer, archiveCareer, deleteCareer, reloadCareers, refreshActiveCareer]);

  return <CareerContext.Provider value={contextValue}>{children}</CareerContext.Provider>;
}
