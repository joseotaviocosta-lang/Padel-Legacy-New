import React from 'react';
import { SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, FACE_TYPES, BUILDS } from '@/lib/characterCatalog';
import { ColorPicker, OptionGrid, SliderRow, LockedControl, SuggestionNotice } from './CharacterShared';
import { isFieldLocked } from '@/lib/characterFieldLocks';
import { getSuggestedPhysicalRange } from '@/lib/characterPhysicalSuggestion';

function buildLabelFor(id) {
  return BUILDS.find(b => b.id === id)?.label || id;
}

export default function AppearanceEditor({ data, update, profile }) {
  const buildLocked = isFieldLocked(data, 'build');
  const heightLocked = isFieldLocked(data, 'height_cm');
  // Sugestão só faz sentido antes do primeiro save — depois disso os campos
  // já estão travados (Fase A) e mostram o próprio aviso de trava.
  const suggestion = (!buildLocked && !heightLocked)
    ? getSuggestedPhysicalRange({
      handedness: profile?.handedness,
      preferredSide: profile?.preferred_side,
      playStyle: profile?.play_style,
    })
    : null;

  return (
    <div className="space-y-5">
      <ColorPicker label="Tom de Pele" options={SKIN_TONES} value={data.skin_tone} onChange={v => update('skin_tone', v)} />
      <OptionGrid label="Estilo de Cabelo" options={HAIR_STYLES} value={data.hair_style} onChange={v => update('hair_style', v)} />
      <ColorPicker label="Cor do Cabelo" options={HAIR_COLORS} value={data.hair_color} onChange={v => update('hair_color', v)} />
      <ColorPicker label="Cor dos Olhos" options={EYE_COLORS} value={data.eye_color} onChange={v => update('eye_color', v)} />
      <OptionGrid label="Formato do Rosto" options={FACE_TYPES} value={data.face_type} onChange={v => update('face_type', v)} />

      {suggestion && (
        <SuggestionNotice
          heightRange={suggestion.heightRange}
          buildLabel={buildLabelFor(suggestion.suggestedBuild)}
          secondaryBuildLabel={suggestion.secondaryBuild ? buildLabelFor(suggestion.secondaryBuild) : null}
          rationale={suggestion.rationale}
          sideNote={suggestion.sideNote}
        />
      )}

      <LockedControl locked={buildLocked}>
        <OptionGrid label="Biotype" options={BUILDS} value={data.build} onChange={v => update('build', v)} />
      </LockedControl>
      <LockedControl locked={heightLocked}>
        <SliderRow label="Altura" value={data.height_cm} onChange={v => update('height_cm', v)} min={155} max={210} unit=" cm" />
      </LockedControl>
    </div>
  );
}