import React from 'react';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, FLAGS, VOICE_TYPES, CELEBRATIONS } from '@/lib/characterCatalog';

export default function CharacterPreview({ data, profile }) {
  if (!data) return null;

  const skin = SKIN_TONES.find(s => s.id === data.skin_tone)?.color || '#e8b88a';
  const hair = HAIR_COLORS.find(h => h.id === data.hair_color)?.color || '#1a1a1a';
  const eyes = EYE_COLORS.find(item => item.id === data.eye_color)?.color || '#5c3317';
  const flag = FLAGS[data.nationality] || '🏳️';
  const voice = VOICE_TYPES.find(v => v.id === data.voice_type)?.label || 'Médio';
  const hasGlasses = (data.accessories || []).includes('oculos');
  const hasCap = (data.accessories || []).includes('bone');
  const hasBandana = (data.accessories || []).includes('bandana');
  const hasTiara = (data.accessories || []).includes('tiara');
  const hasNecklace = (data.accessories || []).includes('colar');

  const buildWidths = { magro: 'w-20', atletico: 'w-24', musculoso: 'w-28', robusto: 'w-32' };
  const bodyWidth = buildWidths[data.build] || 'w-24';

  const heightScale = data.height_cm < 170 ? 'scale-90' : data.height_cm < 180 ? 'scale-95' : data.height_cm < 190 ? 'scale-100' : 'scale-105';
  const faceShapes = { quadrada: 'rounded-xl', redonda: 'rounded-full', oval: 'rounded-[46%]', angular: 'rounded-[35%_35%_50%_50%]' };
  const faceShape = faceShapes[data.face_type] || faceShapes.oval;
  const hairShapes = {
    curto: '-top-1 -inset-x-1 h-5 rounded-t-full',
    medio: '-top-1 -inset-x-1 h-7 rounded-t-full rounded-b-lg',
    longo: '-top-1 -inset-x-2 h-12 rounded-t-full rounded-b-xl',
    'trençado': '-top-1 inset-x-0 h-6 rounded-t-full border-b-4 border-dotted',
    preso: '-top-1 -inset-x-1 h-5 rounded-t-full',
  };

  return (
    <div className="glass rounded-2xl p-5 sticky top-20">
      {/* Identity bar */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 mb-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-primary">{data.title || 'O Novato'}</span>
        </div>
        <h2 className="font-black text-lg leading-none">{profile?.sport_name || 'Atleta'}</h2>
        <p className="text-xs text-muted-foreground mt-1">{flag} {data.nationality} · Voz {voice}</p>
      </div>

      {/* Avatar */}
      <div
        data-testid="character-preview"
        data-skin-tone={data.skin_tone}
        data-hair-style={data.hair_style}
        data-hair-color={data.hair_color}
        data-eye-color={data.eye_color}
        data-face-type={data.face_type}
        data-shirt={data.shirt_color}
        data-shorts={data.shorts_color}
        data-shoes={data.shoes_color}
        className={`flex flex-col items-center origin-top transition-transform ${heightScale}`}
      >
        {/* Hat layer */}
        {hasCap && <div className="w-20 h-3 rounded-t-full mb-[-2px] z-10" style={{ background: data.shirt_color }} />}
        {hasTiara && <div className="w-16 h-2 rounded-full mb-[-1px] z-10 bg-amber-400" />}

        {/* Head */}
        <div className={`relative w-16 h-16 transition-all ${faceShape}`} style={{ background: skin }}>
          {/* Hair */}
          {data.hair_style !== 'rapado' && (
            <div className={`absolute transition-all ${hairShapes[data.hair_style] || hairShapes.curto}`} style={{ background: hair }} />
          )}
          {data.hair_style === 'preso' && (
            <div className="absolute top-0 right-0 w-3 h-6 rounded-full" style={{ background: hair }} />
          )}
          {/* Bandana */}
          {hasBandana && <div className="absolute top-1 inset-x-0 h-2 rounded-full bg-red-500" />}
          {/* Headband */}
          {data.headband && <div className="absolute top-2.5 inset-x-0 h-1.5 rounded-full" style={{ background: data.headband_color }} />}
          {/* Eyes */}
          <div className="absolute top-7 left-4 w-1.5 h-1.5 rounded-full border border-black/30" style={{ background: eyes }} />
          <div className="absolute top-7 right-4 w-1.5 h-1.5 rounded-full border border-black/30" style={{ background: eyes }} />
          {/* Glasses */}
          {hasGlasses && <div className="absolute top-6 left-2 right-2 h-2.5 rounded-full border-2 border-slate-800" />}
          {/* Smile */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-4 h-1.5 border-b-2 border-slate-700 rounded-full" />
          {/* Earring */}
          {(data.accessories || []).includes('brinco') && <div className="absolute bottom-4 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
        </div>

        {/* Neck */}
        <div className="w-3 h-2" style={{ background: skin }} />

        {/* Body (shirt) */}
        <div className={`relative ${bodyWidth} h-14 rounded-t-xl`} style={{ background: data.shirt_color }}>
          {/* Necklace */}
          {hasNecklace && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-1 rounded-full bg-amber-400" />}
          {/* Wristbands */}
          {data.wristband && <div className="absolute bottom-0 left-0 w-3 h-1.5 rounded" style={{ background: data.wristband_color }} />}
          {data.wristband && <div className="absolute bottom-0 right-0 w-3 h-1.5 rounded" style={{ background: data.wristband_color }} />}
          {/* Watch */}
          {(data.accessories || []).includes('relogio') && <div className="absolute bottom-0 left-1 w-2.5 h-2.5 rounded-full bg-slate-700" />}
          {/* Bracelet */}
          {(data.accessories || []).includes('pulseira') && <div className="absolute bottom-0.5 right-1 w-3 h-1 rounded-full bg-amber-500" />}
        </div>

        {/* Shorts */}
        <div className={`${bodyWidth} h-7 rounded-b-lg`} style={{ background: data.shorts_color }} />

        {/* Legs */}
        <div className="flex gap-1">
          <div className="w-3 h-5 rounded-b" style={{ background: skin }} />
          <div className="w-3 h-5 rounded-b" style={{ background: skin }} />
        </div>

        {/* Shoes */}
        <div className="flex gap-1">
          <div className="w-5 h-2.5 rounded-full rounded-bl-none" style={{ background: data.shoes_color }} />
          <div className="w-5 h-2.5 rounded-full rounded-br-none" style={{ background: data.shoes_color }} />
        </div>
      </div>

      {/* Racket */}
      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-border/40">
        <div className="h-6 w-4 rounded-full border-2" style={{ borderColor: data.racket_color, background: data.racket_color + '30' }}>
          <div className="h-3 w-px mx-auto mt-3" style={{ background: data.grip_color }} />
        </div>
        <span className="text-[10px] text-muted-foreground">Raquete {data.racket_model}</span>
      </div>

      {/* Visual identity */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <span className="h-4 w-4 rounded-full" style={{ background: data.primary_color }} />
        <span className="h-4 w-4 rounded-full" style={{ background: data.secondary_color }} />
        <span className="text-lg">{data.signature_emoji}</span>
      </div>

      {/* Languages */}
      {(data.languages || []).length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mt-3">
          {data.languages.map(lang => (
            <span key={lang} className="text-[9px] rounded-full bg-secondary/60 px-2 py-0.5 text-muted-foreground">{lang}</span>
          ))}
        </div>
      )}

      {/* Celebration preview */}
      <div className="text-center mt-3">
        <span className="text-2xl">
          {CELEBRATIONS.find(c => c.id === data.celebration)?.emoji || '✊'}
        </span>
      </div>
    </div>
  );
}
