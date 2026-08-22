import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { buildTrainingCenterRoute, TRAINING_CENTER_VIEWS } from '@/navigation/routes.js';

/**
 * Adaptador da rota legada /matches.
 * A experiência funcional vive em PracticeMatchView dentro do hub unificado.
 */
function Matches() {
  const [searchParams] = useSearchParams();
  const params = /** @type {Record<string, unknown>} */ ({});
  searchParams.forEach((value, key) => { params[key] = value; });
  delete params.view;
  return <Navigate replace to={buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.MATCH, params)} />;
}

export default React.memo(Matches);
