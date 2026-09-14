import React from 'react';
import { COLORS, RACKET_MODELS } from '@/lib/characterCatalog';
import { ColorPicker, OptionGrid, FallbackControl } from './CharacterShared';

export default function EquipmentEditor({ data, update, overriddenCategories = [], overriddenItemNames = {} }) {
  const raqueteOverridden = overriddenCategories.includes('raquete');
  return (
    <div className="space-y-5">
      <FallbackControl overridden={raqueteOverridden} itemName={overriddenItemNames.raquete}>
        <OptionGrid label="Modelo de Raquete" options={RACKET_MODELS} value={data.racket_model} onChange={v => update('racket_model', v)} columns={3} />
        <div className="mt-3">
          <ColorPicker label="Cor da Raquete" options={COLORS} value={data.racket_color} onChange={v => update('racket_color', v)} />
        </div>
      </FallbackControl>
      <ColorPicker label="Cor do Grip" options={COLORS} value={data.grip_color} onChange={v => update('grip_color', v)} />
    </div>
  );
}