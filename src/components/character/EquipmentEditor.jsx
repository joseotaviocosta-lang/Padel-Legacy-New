import React from 'react';
import { COLORS, RACKET_MODELS } from '@/lib/characterCatalog';
import { ColorPicker, OptionGrid } from './CharacterShared';

export default function EquipmentEditor({ data, update }) {
  return (
    <div className="space-y-5">
      <OptionGrid label="Modelo de Raquete" options={RACKET_MODELS} value={data.racket_model} onChange={v => update('racket_model', v)} columns={3} />
      <ColorPicker label="Cor da Raquete" options={COLORS} value={data.racket_color} onChange={v => update('racket_color', v)} />
      <ColorPicker label="Cor do Grip" options={COLORS} value={data.grip_color} onChange={v => update('grip_color', v)} />
    </div>
  );
}