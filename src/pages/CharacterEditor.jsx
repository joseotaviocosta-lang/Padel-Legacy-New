import React, { useEffect, useState, useCallback } from 'react';
import { Palette, Shirt, Disc, Sparkles, User, BookOpen, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { LoadingScreen, PageHeader, TabBar, PrimaryButton } from '@/components/padel/ui';
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
      if (existing && existing.length > 0) {
        setCustomization(normalizeCharacterCustomization(existing[0], p.id));
      } else {
        setCustomization(normalizeCharacterCustomization(null, p.id));
      }
      setDirty(false);
    } catch (e) {
      console.error(e);
      setLoadError('Não foi possível carregar a aparência desta carreira.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = useCallback((key, value) => {
    setCustomization(prev => prev ? applyCharacterCustomizationChange(prev, key, value) : prev);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!customization) return;
    setSaving(true);
    try {
      const payload = normalizeCharacterCustomization(customization, profile?.id);
      let saved;
      if (payload.id) {
        saved = await localGame.entities.CharacterCustomization.update(payload.id, payload);
      } else {
        saved = await localGame.entities.CharacterCustomization.create(payload);
      }
      setCustomization(normalizeCharacterCustomization(saved, profile?.id));
      setDirty(false);
      toast({ title: 'Personagem salvo!', description: 'Suas customizações foram aplicadas.' });
    } catch (e) {
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
    <div role="alert" className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <span className="flex-1">{loadError || 'A aparência não está disponível.'}</span>
      <button type="button" onClick={load} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Tentar novamente</button>
    </div>
  );

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        icon={Palette}
        title="Editor de Personagem"
        subtitle="Personalize cada detalhe do seu atleta"
        accent="purple"
      >
        <button type="button" onClick={handleReset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> Resetar
        </button>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CharacterPreview data={customization} profile={profile} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="segmented" />

          <div className="glass rounded-2xl p-4">
            {activeTab === 'appearance' && <AppearanceEditor data={customization} update={update} />}
            {activeTab === 'clothing' && <ClothingEditor data={customization} update={update} />}
            {activeTab === 'equipment' && <EquipmentEditor data={customization} update={update} />}
            {activeTab === 'style' && <StyleEditor data={customization} update={update} />}
            {activeTab === 'identity' && <IdentityEditor data={customization} update={update} />}
            {activeTab === 'history' && <HistoryEditor data={customization} update={update} />}
          </div>

          <div className="sticky bottom-20 md:bottom-4 z-30">
            <PrimaryButton onClick={handleSave} disabled={saving} className="w-full">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : dirty ? 'Salvar alterações' : 'Personagem salvo'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
