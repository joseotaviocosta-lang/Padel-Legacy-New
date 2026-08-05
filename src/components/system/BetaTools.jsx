import { useEffect, useState } from 'react';
import { Bug, Copy, Download, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCareer } from '@/careers/useCareer.js';
import { buildBetaDiagnosticReport, downloadBetaDiagnosticReport, installBetaDiagnostics } from '@/lib/betaDiagnostics.js';

export default function BetaTools({ compact = false }) {
  const location = useLocation();
  const { activeCareer } = useCareer();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => installBetaDiagnostics(), []);

  async function copyReport() {
    const report = buildBetaDiagnosticReport({ career: activeCareer, pathname: location.pathname });
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Relatar problema da versão beta" className={`inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 font-black text-amber-300 transition-colors hover:bg-amber-400/15 ${compact ? 'h-9 w-9 p-0' : 'px-3 py-2 text-xs'}`}>
        <Bug className="h-4 w-4" /> {!compact && 'BETA'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ferramentas da versão beta">
          <section className="w-full max-w-lg rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Padel Legacy Beta</p><h2 className="mt-1 text-lg font-black">Relatar um problema</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Ao encontrar um erro, descreva o que estava fazendo e anexe o diagnóstico. O arquivo não inclui senha nem conteúdo completo da sua carreira.</p>
            <div className="mt-4 rounded-2xl bg-secondary/55 p-3 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Versão:</strong> {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta'}</p>
              <p><strong className="text-foreground">Tela:</strong> {location.pathname}</p>
              <p><strong className="text-foreground">Carreira:</strong> {activeCareer?.career_id || 'nenhuma'}</p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={copyReport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary"><Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar diagnóstico'}</button>
              <button type="button" onClick={() => downloadBetaDiagnosticReport({ career: activeCareer, pathname: location.pathname })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Baixar diagnóstico</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
