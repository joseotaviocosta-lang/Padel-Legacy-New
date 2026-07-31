import React from 'react';
import { SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, FACE_TYPES, BUILDS } from '@/lib/characterCatalog';
import { ColorPicker, OptionGrid, SliderRow } from './CharacterShared';

export default function AppearanceEditor({ data, update }) {
  return (
    <div className="space-y-5">
      <ColorPicker label="Tom de Pele" options={SKIN_TONES} value={data.skin_tone} onChange={v => update('skin_tone', v)} />
      <OptionGrid label="Estilo de Cabelo" options={HAIR_STYLES} value={data.hair_style} onChange={v => update('hair_style', v)} />
      <ColorPicker label="Cor do Cabelo" options={HAIR_COLORS} value={data.hair_color} onChange={v => update('hair_color', v)} />
      <ColorPicker label="Cor dos Olhos" options={EYE_COLORS} value={data.eye_color} onChange={v => update('eye_color', v)} />
      <OptionGrid label="Formato do Rosto" options={FACE_TYPES} value={data.face_type} onChange={v => update('face_type', v)} />
      <OptionGrid label="Biotype" options={BUILDS} value={data.build} onChange={v => update('build', v)} />
      <SliderRow label="Altura" value={data.height_cm} onChange={v => update('height_cm', v)} min={155} max={210} unit=" cm" />
    </div>
  );
}