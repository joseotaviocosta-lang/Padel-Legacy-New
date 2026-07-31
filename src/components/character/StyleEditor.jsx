import React from 'react';
import { IDLE_ANIMATIONS, CELEBRATIONS, VICTORY_POSES, ACCESSORIES } from '@/lib/characterCatalog';
import { OptionGrid, MultiSelectGrid } from './CharacterShared';

export default function StyleEditor({ data, update }) {
  return (
    <div className="space-y-5">
      <OptionGrid label="Animação de Repouso" options={IDLE_ANIMATIONS} value={data.idle_animation} onChange={v => update('idle_animation', v)} columns={3} />
      <OptionGrid label="Comemoração de Ponto" options={CELEBRATIONS} value={data.celebration} onChange={v => update('celebration', v)} columns={4} />
      <OptionGrid label="Pose de Vitória" options={VICTORY_POSES} value={data.victory_pose} onChange={v => update('victory_pose', v)} columns={3} />
      <MultiSelectGrid label="Acessórios Pessoais" options={ACCESSORIES} selected={data.accessories} onToggle={toggleAccessory(data, update)} columns={4} />
    </div>
  );
}

function toggleAccessory(data, update) {
  return (id) => {
    const list = data.accessories || [];
    const next = list.includes(id) ? list.filter(a => a !== id) : [...list, id];
    update('accessories', next);
  };
}