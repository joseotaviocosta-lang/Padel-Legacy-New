import React from 'react';
import { TITLES, NATIONALITIES, LANGUAGES, VOICE_TYPES, COLORS, SIGNATURE_EMOJIS } from '@/lib/characterCatalog';
import { OptionGrid, MultiSelectGrid, SliderRow, SectionLabel, ColorPicker } from './CharacterShared';
import { Volume2 } from 'lucide-react';

export default function IdentityEditor({ data, update }) {
  const titleOptions = TITLES.map(t => ({ id: t, label: t }));
  const natOptions = NATIONALITIES.map(n => ({ id: n, label: n }));

  return (
    <div className="space-y-5">
      <OptionGrid label="Título" options={titleOptions} value={data.title} onChange={v => update('title', v)} columns={2} />
      <OptionGrid label="Nacionalidade" options={natOptions} value={data.nationality} onChange={v => update('nationality', v)} columns={3} />
      <MultiSelectGrid label="Idiomas Falados" options={LANGUAGES.map(l => ({ id: l, label: l }))} selected={data.languages} onToggle={toggleLang(data, update)} columns={3} />

      <SectionLabel>Voz</SectionLabel>
      <OptionGrid options={VOICE_TYPES} value={data.voice_type} onChange={v => update('voice_type', v)} columns={3} />
      <SliderRow label="Gravidade (Pitch)" value={data.voice_pitch} onChange={v => update('voice_pitch', v)} />
      <SliderRow label="Velocidade" value={data.voice_speed} onChange={v => update('voice_speed', v)} />
      <button
        onClick={() => testVoice(data.voice_pitch, data.voice_speed)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
      >
        <Volume2 className="h-4 w-4" /> Testar Voz
      </button>

      <SectionLabel>Identidade Visual</SectionLabel>
      <ColorPicker label="Cor Primária" options={COLORS} value={data.primary_color} onChange={v => update('primary_color', v)} />
      <ColorPicker label="Cor Secundária" options={COLORS} value={data.secondary_color} onChange={v => update('secondary_color', v)} />
      <div>
        <SectionLabel>Emoji Assinatura</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {SIGNATURE_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => update('signature_emoji', emoji)}
              className={`h-9 w-9 rounded-xl flex items-center justify-center text-lg border-2 transition-all ${data.signature_emoji === emoji ? 'border-primary bg-primary/10 scale-110' : 'border-border glass'}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function toggleLang(data, update) {
  return (lang) => {
    const list = data.languages || [];
    const next = list.includes(lang) ? list.filter(l => l !== lang) : [...list, lang];
    update('languages', next);
  };
}

function testVoice(pitch, speed) {
  try {
    const u = new SpeechSynthesisUtterance('Olá! Estou pronto para jogar padel!');
    u.pitch = Math.max(0, Math.min(2, pitch / 50));
    u.rate = Math.max(0.5, Math.min(2, speed / 50));
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}