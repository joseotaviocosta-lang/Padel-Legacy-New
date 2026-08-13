import React, { useEffect, useState } from 'react';
import { Database, Users, Bot, Trophy, Building2, Briefcase, Package, RefreshCw, Sparkles, AlertTriangle, CheckCircle, Target, Calendar } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { generateDemoData, resetCareer } from '@/lib/demoData';
import { CardGrid, Page, PageContent, PageHeader, PageSkeleton, StatCard, Surface } from '@/components/design-system';

const TONES = { primary: 'brand', cyan: 'info', amber: 'warning', purple: 'premium', green: 'success', rose: 'danger' };

export default function DatabaseManager() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);
  const [profile, setProfile] = useState(null);

  const loadCounts = async () => {
    setLoading(true);
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      const entities = ['AthleteProfile', 'Coach', 'Sponsor', 'Club', 'Tournament', 'ShopItem', 'WorldEvent', 'TeamRanking', 'CareerLegacy', 'Mission', 'Season'];
      const results = await Promise.all(
        entities.map(async (name) => {
          try {
            const list = await localGame.entities[name].list('-created_date', 1);
            return { name, count: list?.length || 0 };
          } catch {
            return { name, count: 0, error: true };
          }
        })
      );
      setCounts(results);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadCounts(); }, []);

  async function handleGenerateDemo() {
    setActionLoading('demo');
    setResultMsg(null);
    try {
      const results = await generateDemoData();
      const created = Object.entries(results)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      setResultMsg({ type: 'success', text: `Dados de demonstração criados! ${created || 'Tudo já estava populado.'}` });
      await loadCounts();
    } catch (e) {
      setResultMsg({ type: 'error', text: `Erro ao gerar dados: ${e.message || e}` });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  }

  async function handleResetCareer() {
    setActionLoading('reset');
    setResultMsg(null);
    try {
      await resetCareer(profile.id);
      setResultMsg({ type: 'success', text: 'Carreira reiniciada! Seu perfil voltou ao estado inicial.' });
      await loadCounts();
    } catch (e) {
      setResultMsg({ type: 'error', text: `Erro ao reiniciar: ${e.message || e}` });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  }

  const ICONS = { AthleteProfile: Bot, Coach: Users, Sponsor: Briefcase, Club: Building2, Tournament: Trophy, ShopItem: Package, WorldEvent: Database, TeamRanking: Trophy, CareerLegacy: Database, Mission: Target, Season: Calendar };
  const LABELS = { AthleteProfile: 'Atletas', Coach: 'Treinadores', Sponsor: 'Patrocinadores', Club: 'Clubes', Tournament: 'Torneios', ShopItem: 'Equipamentos', WorldEvent: 'Eventos do Mundo', TeamRanking: 'Rankings de Duplas', CareerLegacy: 'Legados', Mission: 'Missões', Season: 'Temporadas' };
  const ACCENTS = { AthleteProfile: 'cyan', Coach: 'primary', Sponsor: 'amber', Club: 'green', Tournament: 'purple', ShopItem: 'rose', WorldEvent: 'primary', TeamRanking: 'amber', CareerLegacy: 'purple', Mission: 'cyan', Season: 'green' };

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  return (
    <Page size="default">
      <PageContent>
      <PageHeader
        icon={Database}
        title="Banco de Dados"
        description="Visão geral e gerenciamento do universo do jogo."
        tone="neutral"
        breadcrumb={['Gestão', 'Banco de dados']}
        action={(
          <button onClick={loadCounts} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        )}
      />

      {/* Result feedback */}
      {resultMsg && (
        <div className={`glass rounded-2xl p-4 border flex items-center gap-3 ${resultMsg.type === 'success' ? 'border-primary/40 bg-primary/5' : 'border-red-500/40 bg-red-500/5'}`}>
          {resultMsg.type === 'success' ? <CheckCircle className="h-5 w-5 text-primary shrink-0" /> : <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />}
          <p className={`text-sm ${resultMsg.type === 'success' ? 'text-primary' : 'text-red-300'}`}>{resultMsg.text}</p>
          <button onClick={() => setResultMsg(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Fechar</button>
        </div>
      )}

      {/* Entity counts */}
      <CardGrid columns={3}>
        {(counts || []).map(({ name, count, error }) => {
          const Icon = ICONS[name] || Database;
          const tone = TONES[ACCENTS[name]] || 'brand';
          return (
            <StatCard
              key={name}
              icon={Icon}
              tone={tone}
              label={LABELS[name] || name}
              value={error ? '—' : count.toLocaleString('pt-BR')}
              detail={error ? 'Indisponível' : 'registros'}
            />
          );
        })}
      </CardGrid>

      {/* Actions */}
      <Surface className="space-y-4">
        <h3 className="text-sm font-bold">Gerenciamento</h3>

        {/* Generate Demo Data */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Gerar Dados de Demonstração</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cria um conjunto moderado de dados iniciais: temporada ativa, treinadores, patrocinadores, clubes, torneios, atletas, missões e equipamentos. Seguro — não duplica registros existentes.
            </p>
          </div>
          {confirmAction === 'demo' ? (
            <div className="flex gap-2 shrink-0">
              <button onClick={handleGenerateDemo} disabled={actionLoading === 'demo'} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50">
                {actionLoading === 'demo' ? 'Gerando...' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmAction(null)} className="px-3 py-2 rounded-xl glass text-xs font-semibold text-muted-foreground">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmAction('demo')} disabled={actionLoading !== null} className="px-3 py-2 rounded-xl bg-primary/15 text-primary font-bold text-xs hover:bg-primary/25 transition-colors shrink-0 disabled:opacity-50">
              Gerar
            </button>
          )}
        </div>

        <div className="border-t border-border/40" />

        {/* Reset Career */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Reiniciar Carreira</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apaga todos os dados da sua carreira (partidas, treinos, calendário, contratos, investimentos, conquistas) e reseta seu perfil ao estado inicial. Os dados do universo (torneios, clubes, treinadores) não são afetados.
            </p>
          </div>
          {confirmAction === 'reset' ? (
            <div className="flex gap-2 shrink-0">
              <button onClick={handleResetCareer} disabled={actionLoading === 'reset'} className="px-3 py-2 rounded-xl bg-red-500 text-white font-bold text-xs disabled:opacity-50">
                {actionLoading === 'reset' ? 'Reiniciando...' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmAction(null)} className="px-3 py-2 rounded-xl glass text-xs font-semibold text-muted-foreground">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmAction('reset')} disabled={actionLoading !== null} className="px-3 py-2 rounded-xl bg-red-500/15 text-red-400 font-bold text-xs hover:bg-red-500/25 transition-colors shrink-0 disabled:opacity-50">
              Reiniciar
            </button>
          )}
        </div>
      </Surface>

      <Surface>
        <h3 className="text-sm font-bold mb-2">Conteúdo do Banco de Dados</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          O universo do Padel Legacy contém milhares de registros: atletas com personalidades, atributos e biografias únicas;
          treinadores especializados; patrocinadores de múltiplos setores; clubes em cidades reais; torneios com calendário
          anual; equipamentos de marcas reais; além de rankings, legados e eventos do mundo vivo.
        </p>
      </Surface>
      </PageContent>
    </Page>
  );
}