import React, { useEffect, useState, useCallback } from 'react';
import { Palette, Shirt, Disc, Sparkles, User, BookOpen, Save, RotateCcw, AlertTriangle, Eye } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { LoadingScreen, TabBar, PrimaryButton } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, Surface, StatCard, StatusBadge } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import CharacterPreview from '@/components/character/CharacterPreview';
import AppearanceEditor from '@/components/character/AppearanceEditor';
import ClothingEditor from '@/components/character/ClothingEditor';
import EquipmentEditor from '@/components/character/EquipmentEditor';
import StyleEditor from '@/components/character/StyleEditor';
import IdentityEditor from '@/components/character/IdentityEditor';
import HistoryEditor from '@/components/character/HistoryEditor';
import { applyCharacterCustomizationChange, DEFAULT_CHARACTER_CUSTOMIZATION, normalizeCharacterCustomization } from '@/lib/characterCustomization';

const TABS = [
  { key: 'appearance', label: 'Aparência', icon: Palette },
  { key: 'clothing', label: 'Roupas', icon: Shirt },
  { key: 'equipment', label: 'Equipamento', icon: Disc },
  { key: 'style', label: 'Estilo', icon: Sparkles },
  { key: 'identity', label: 'Identidade', icon: User },
  { key: 'history', label: 'História', icon: BookOpen },
];

export default function CharacterEditor() {
  const [profile, setProfile] = useState(null);
  const [customization, setCustomization] = useState(null);
  const [activeTab, setActiveTab] = useState('appearance');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      const existing = await localGame.entities.CharacterCustomization.filter({ profile_id: p.id }, null, 1);
      setCustomization(normalizeCharacterCustomization(existing?.[0] || null, p.id));
      setDirty(false);
    } catch (error) {
      console.error(error);
      setLoadError('Não foi possível carregar a aparência desta carreira.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = useCallback((key, value) => {
    setCustomization(previous => previous ? applyCharacterCustomizationChange(previous, key, value) : previous);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!customization) return;
    setSaving(true);
    try {
      const payload = normalizeCharacterCustomization(customization, profile?.id);
      const saved = payload.id
        ? await localGame.entities.CharacterCustomization.update(payload.id, payload)
        : await localGame.entities.CharacterCustomization.create(payload);
      setCustomization(normalizeCharacterCustomization(saved, profile?.id));
      setDirty(false);
      toast({ title: 'Personagem salvo!', description: 'Suas customizações foram aplicadas.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao salvar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCustomization(normalizeCharacterCustomization({
      ...DEFAULT_CHARACTER_CUSTOMIZATION,
      ...(customization?.id ? { id: customization.id } : {}),
    }, profile?.id));
    setDirty(true);
  };

  if (loading) return <LoadingScreen />;
  if (loadError || !customization) return (
    <div role="alert" className="m-6 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <span className="flex-1">{loadError || 'A aparência não está disponível.'}</span>
      <button type="button" onClick={load} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Tentar novamente</button>
    </div>
  );

  return (
    <Page>
      <PageContent>
        <PageHeader
          eyebrow="Identidade do atleta"
          title="Aparência e personalidade"
          description="Personalize o visual, a identidade e a história que acompanham sua carreira dentro e fora das quadras."
          icon={Palette}
          tone="premium"
          action={(
            <button type="button" onClick={handleReset} className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-xs font-bold text-muted-foreground transition hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
            </button>
          )}
          stats={[
            <StatusBadge key="status" tone={dirty ? 'warning' : 'success'}>{dirty ? 'Alterações pendentes' : 'Tudo salvo'}</StatusBadge>,
            <StatusBadge key="tab" tone="info">{TABS.find(tab => tab.key === activeTab)?.label}</StatusBadge>,
          ]}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(250px,0.78fr)_minmax(0,1.7fr)]">
          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Surface variant="premium" padding="compact">
              <CharacterPreview data={customization} profile={profile} />
            </Surface>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Nome em quadra" value={profile?.name || 'Atleta'} detail="Identidade pública" icon={User} tone="brand" />
              <StatCard label="Prévia" value="Ao vivo" detail="Atualização imediata" icon={Eye} tone="info" />
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <Surface padding="compact" className="sticky top-2 z-20 backdrop-blur-xl">
              <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="segmented" />
            </Surface>

            <Surface variant="elevated" padding="default" className="min-h-[420px]">
              {activeTab === 'appearance' && <AppearanceEditor data={customization} update={update} />}
              {activeTab === 'clothing' && <ClothingEditor data={customization} update={update} />}
              {activeTab === 'equipment' && <EquipmentEditor data={customization} update={update} />}
              {activeTab === 'style' && <StyleEditor data={customization} update={update} />}
              {activeTab === 'identity' && <IdentityEditor data={customization} update={update} />}
              {activeTab === 'history' && <HistoryEditor data={customization} update={update} />}
            </Surface>

            {/* Fase 15.2 (Bug 2/F2/F3): reserva o espaço que o CTA sticky abaixo
                ocupa quando "estacionado" (bottom-20 no mobile, bottom-4 a
                partir de md) — sem essa folga, rolar até o fim do editor
                deixava o último controle (ex.: slider de Altura) atrás da
                barra "PERSONAGEM SALVO". Altura derivada de tokens reais
                (--pl-sticky-save-h + a própria distância `bottom-*` do CTA +
                safe-area no mobile), nunca um valor de margem arbitrário. */}
            <div aria-hidden className="h-[calc(5rem+var(--pl-sticky-save-h)+var(--pl-safe-b)+0.75rem)] md:h-[calc(1rem+var(--pl-sticky-save-h)+0.75rem)]" />

            <div className="sticky bottom-20 z-30 md:bottom-4">
              <PrimaryButton onClick={handleSave} disabled={saving || !dirty} className="w-full shadow-2xl">
                <Save className="h-4 w-4" />
                {saving ? 'Salvando...' : dirty ? 'Salvar alterações' : 'Personagem salvo'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </PageContent>
    </Page>
  );
}
