import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

if (import.meta.env.DEV) {
  import('./dev/registerDevTests.js').catch((error) => {
    console.error('[dev-tests] Não foi possível registrar os testes de desenvolvimento.', error);
  });

  import('./gameplay/tests/WorldTourPhysicalConditionTest.js');
  import('./gameplay/tests/WorldTourMedicalCenterTest.js');
  import('./gameplay/tests/ContextualPressTest.js');
  import('./gameplay/tests/SequentialContextRegressionTest.js');
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
