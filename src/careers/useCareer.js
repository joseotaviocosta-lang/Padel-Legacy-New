import { useContext } from 'react';
import { CareerContext } from './CareerContext.jsx';

export function useCareer() {
  const context = useContext(CareerContext);
  if (!context) {
    throw new Error('useCareer must be used within a CareerProvider');
  }
  return context;
}
