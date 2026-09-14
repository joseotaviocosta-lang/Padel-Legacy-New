import React from 'react';
import { CATEGORY_META, RARITY_STYLES } from '@/lib/equipmentCatalog';
import { Surface } from '@/components/design-system';
import ItemImage from '@/components/shop/ItemImage';

// Categorias sem camada correspondente na boneca (grip, bola, mochila,
// acessorio_tec, colecionavel, acessorio) — exibidas aqui como badges
// reaproveitando o mesmo ItemImage (ícone redondo categoria×raridade) que a
// Loja e o Inventário já usam. Some da tela quando nada dessas categorias
// está equipado — não inventa "slot vazio".
export default function EquippedBadgeRow({ badges }) {
  if (!badges || badges.length === 0) return null;

  return (
    <Surface variant="premium" padding="compact">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Equipado (sem exibição na boneca)</p>
      <div className="flex flex-wrap gap-2">
        {badges.map(badge => {
          const meta = CATEGORY_META[badge.category] || CATEGORY_META.acessorio;
          const rarityStyle = RARITY_STYLES[badge.rarity] || RARITY_STYLES.comum;
          return (
            <div
              key={badge.category}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${rarityStyle.badge}`}
              title={`${badge.item_name} · ${meta.label}`}
            >
              <div className="h-6 w-6 flex-shrink-0">
                <ItemImage
                  item={{ name: badge.item_name, image_url: badge.image_url, category: badge.category, icon: badge.icon }}
                  variant="icon"
                  className="h-6 w-6"
                  glyphClassName="h-6 w-6"
                />
              </div>
              <span className="text-[10px] font-semibold leading-tight max-w-[7rem] truncate">{badge.item_name}</span>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
