import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ModuleErrorBoundary extends React.Component {
  state = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error(`[${this.props.moduleName || 'Módulo'}] erro isolado`, error, info);
  }

  retry = () => this.setState(({ retryKey }) => ({ error: null, retryKey: retryKey + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="m-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <h2 className="font-black">Não foi possível abrir {this.props.moduleName || 'este módulo'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">O restante do jogo continua disponível. Tente recarregar somente esta área.</p>
              <button onClick={this.retry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                <RotateCcw className="h-4 w-4" /> Tentar novamente
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}
