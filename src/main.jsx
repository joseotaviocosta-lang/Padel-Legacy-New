import { runMatchEngineTest } from '@/engine/match/MatchEngineTest.js';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from "./App.jsx";
import { setupStorageTest } from './storage';
import { setupCareerTest, setupCareerFlowTest } from './careers';
import { setupCareerMigrationTest } from './careers/CareerMigrationTest.js';
import { setupGameplayIntegrationTest } from './gameplay/tests/GameplayIntegrationTest.js';
import { setupSprint2IntegrationTest } from './gameplay/tests/Sprint2IntegrationTest.js';
import { setupProfileLoadingHotfixTest } from './gameplay/tests/ProfileLoadingHotfixTest.js';
import { setupInitializationRegressionTest } from './gameplay/tests/InitializationRegressionTest.js';
import "./index.css";

if (import.meta.env.DEV) {
  try {
    setupStorageTest();
  } catch (error) {
    console.error('[storage-test] Não foi possível registrar os testes de storage.', error);
  }
  try {
    setupCareerTest();
  } catch (error) {
    console.error('[career-test] Não foi possível registrar os testes de career.', error);
  }
  try {
    setupCareerMigrationTest();
  } catch (error) {
    console.error('[migration-test] Não foi possível registrar o teste de migração.', error);
  }
  try {
    setupGameplayIntegrationTest();
    setupSprint2IntegrationTest();
    setupProfileLoadingHotfixTest();
    setupInitializationRegressionTest();
  } catch (error) {
    console.error('[gameplay-test] Não foi possível registrar os testes de gameplay.', error);
  }
  try {
    setupCareerFlowTest();
  } catch (error) {
    console.error('[career-flow-test] Não foi possível registrar o teste de fluxo de carreira.', error);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

if (typeof window !== 'undefined') {
  window.PadelMatchEngineTest = { run: runMatchEngineTest };
}
