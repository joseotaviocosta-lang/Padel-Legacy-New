import React from 'react';
import { COLORS } from '@/lib/characterCatalog';
import { ColorPicker, ToggleRow, SectionLabel, FallbackControl } from './CharacterShared';

export default function ClothingEditor({ data, update, overriddenCategories = [], overriddenItemNames = {} }) {
  const roupaOverridden = overriddenCategories.includes('roupa');
  const tenisOverridden = overriddenCategories.includes('tenis');
  return (
    <div className="space-y-5">
      <FallbackControl overridden={roupaOverridden} itemName={overriddenItemNames.roupa}>
        <ColorPicker label="Cor da Camisa" options={COLORS} value={data.shirt_color} onChange={v => update('shirt_color', v)} />
      </FallbackControl>
      <ColorPicker label="Cor do Shorts" options={COLORS} value={data.shorts_color} onChange={v => update('shorts_color', v)} />
      <FallbackControl overridden={tenisOverridden} itemName={overriddenItemNames.tenis}>
        <ColorPicker label="Cor do Calçado" options={COLORS} value={data.shoes_color} onChange={v => update('shoes_color', v)} />
      </FallbackControl>

      <SectionLabel>Acessórios de Quadra</SectionLabel>
      <ToggleRow label="Headband" value={data.headband} onChange={v => update('headband', v)} />
      {data.headband && <ColorPicker label="Cor da Headband" options={COLORS} value={data.headband_color} onChange={v => update('headband_color', v)} />}
      <ToggleRow label="Wristband" value={data.wristband} onChange={v => update('wristband', v)} />
      {data.wristband && <ColorPicker label="Cor da Wristband" options={COLORS} value={data.wristband_color} onChange={v => update('wristband_color', v)} />}
    </div>
  );
}