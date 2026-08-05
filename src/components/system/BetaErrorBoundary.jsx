import React from 'react';
import { AlertTriangle, BriefcaseBusiness, Download, RefreshCw } from 'lucide-react';
import { downloadBetaDiagnosticReport, registerBoundaryError } from '@/lib/betaDiagnostics.js';

export default class BetaErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    registerBoundaryError(error, info, 'global');
    if (import.meta.env.DEV) console.error('[beta] erro global capturado', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="min-h-screen bg-background p-5 flex items-center justify-center">
        <section role="alert" className="w-full max-w-xl rounded-3xl border border-destructive/30 bg-card p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-destructive/10 p-3 text-destructive"><AlertTriangle className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-destructive">Versão beta</p>
              <h1 className="mt-1 text-xl font-black">O jogo encontrou um erro inesperado</h1>
              <p className="mt-2 text-sm text-muted-foreground">Sua carreira não foi apagada. Exporte o diagnóstico e tente recarregar. Caso o erro continue, volte ao gerenciador de carreiras.</p>
              <code className="mt-4 block max-h-28 overflow-auto rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">{this.state.error?.message || 'Erro desconhecido'}</code>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => downloadBetaDiagnosticReport()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"><Download className="h-4 w-4" /> Diagnóstico</button>
                <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><RefreshCw className="h-4 w-4" /> Recarregar</button>
                <button type="button" onClick={() => { window.location.href = '/careers'; }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"><BriefcaseBusiness className="h-4 w-4" /> Carreiras</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
