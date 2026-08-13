import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug, Cog, ExternalLink, Gauge, Headphones, Info, Sliders, Volume2, VolumeX, BriefcaseBusiness } from 'lucide-react';
import { useCareer } from '@/careers/useCareer.js';
import { loadUiSoundPreferences, saveUiSoundPreferences, playUiSound } from '@/lib/uiSound.js';
import {
  BrandMark,
  Page,
  PageContent,
  PageHeader,
  PageSection,
  Surface,
  SurfaceHeader,
  StatusBadge,
  useMotionPolicy,
} from '@/components/design-system';

function betaLabel(version) {
  if (!version) return 'Closed Beta';
  if (/rc/i.test(version)) return 'Release Candidate';
  if (/beta/i.test(version)) return 'Closed Beta';
  return version;
}

export default function Settings() {
  const { activeCareer } = useCareer();
  const motion = useMotionPolicy();
  const [sound, setSound] = useState(() => loadUiSoundPreferences());
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta';

  function toggleSound() {
    const next = saveUiSoundPreferences({ enabled: !sound.enabled });
    setSound(next);
    if (next.enabled) window.setTimeout(() => playUiSound('notification'), 20);
  }

  function changeVolume(event) {
    setSound(saveUiSoundPreferences({ volume: Number(event.target.value) }));
  }

  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          eyebrow="Preferências"
          title="Configurações"
          description="Ajustes de interface, áudio e informações sobre esta versão do Padel Legacy."
          icon={Cog}
          tone="neutral"
          breadcrumb={['Mais', 'Configurações']}
        />

        {/* Jogo */}
        <PageSection>
          <Surface>
            <SurfaceHeader title="Jogo" description="Carreira ativa e gerenciamento de saves." icon={BriefcaseBusiness} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{activeCareer?.career_name || activeCareer?.player_name || 'Nenhuma carreira ativa'}</p>
                <p className="text-xs text-muted-foreground">{activeCareer ? 'Save local protegido neste dispositivo.' : 'Crie ou carregue uma carreira para começar.'}</p>
              </div>
              <Link to="/careers" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary">
                <ExternalLink className="h-3.5 w-3.5" /> Gerenciar carreiras
              </Link>
            </div>
          </Surface>
        </PageSection>

        {/* Interface / Áudio */}
        <PageSection>
          <Surface>
            <SurfaceHeader title="Interface e áudio" description="Sons de clique e notificação da interface." icon={Headphones} />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Sons da interface</p>
                <p className="text-xs text-muted-foreground">Efeitos curtos ao interagir com botões e notificações.</p>
              </div>
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={sound.enabled}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${sound.enabled ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-secondary/50 text-muted-foreground'}`}
              >
                {sound.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {sound.enabled ? 'Ativado' : 'Desativado'}
              </button>
            </div>
            {sound.enabled && (
              <label className="mt-4 block text-xs font-bold text-muted-foreground">
                Volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sound.volume}
                  onChange={changeVolume}
                  onMouseUp={() => playUiSound('neutral')}
                  className="mt-2 w-full accent-primary"
                  aria-label="Volume dos sons da interface"
                />
              </label>
            )}
          </Surface>
        </PageSection>

        {/* Performance / Acessibilidade */}
        <PageSection>
          <Surface>
            <SurfaceHeader
              title="Performance e acessibilidade"
              description="Detectado automaticamente pelo dispositivo e pelo sistema operacional."
              icon={Gauge}
            />
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={motion.reducedMotion ? 'warning' : 'success'}>
                {motion.reducedMotion ? 'Movimento reduzido ativo' : 'Movimento completo'}
              </StatusBadge>
              <StatusBadge tone={motion.lowPower ? 'warning' : 'success'}>
                {motion.lowPower ? 'Modo de economia' : 'Desempenho padrão'}
              </StatusBadge>
              <StatusBadge tone={motion.compactViewport ? 'info' : 'neutral'}>
                {motion.compactViewport ? 'Layout compacto' : 'Layout padrão'}
              </StatusBadge>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Esses modos seguem as preferências do seu sistema (redução de movimento, economia de dados, memória e núcleos do dispositivo). Ainda não há alternância manual nesta versão.
            </p>
          </Surface>
        </PageSection>

        {/* Dados */}
        <PageSection>
          <Surface>
            <SurfaceHeader title="Dados" description="Backup, exportação de save e diagnóstico técnico." icon={Sliders} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Backup interno, exportação do save e relatórios de teste continuam na Central BETA — abra pelo botão
              {' '}
              <StatusBadge tone="warning" icon={Bug}>BETA</StatusBadge>
              {' '}
              fixado no canto da tela.
            </p>
          </Surface>
        </PageSection>

        {/* Sobre */}
        <PageSection>
          <Surface>
            <SurfaceHeader title="Sobre" icon={Info} />
            <div className="flex items-center gap-4">
              <BrandMark size={48} />
              <div>
                <p className="text-lg font-black tracking-tight">Padel Legacy</p>
                <p className="text-xs text-muted-foreground">Versão {version} · {betaLabel(version)}</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Simulador de carreira de padel profissional. Todos os dados de carreira ficam salvos localmente neste dispositivo, sem servidores externos.
            </p>
          </Surface>
        </PageSection>
      </PageContent>
    </Page>
  );
}
