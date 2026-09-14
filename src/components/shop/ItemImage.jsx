import React, { useState } from 'react';
import { Package, Disc, Crown, Circle, Target, Shirt, Briefcase, Zap, Footprints } from 'lucide-react';
import { CATEGORY_META } from '@/lib/equipmentCatalog';

const ICON_MAP = { Disc, Crown, Circle, Target, Shirt, Briefcase, Zap, Package, Footprints };

/**
 * Loja Fase 1 — pipeline de imagem de item. Renderiza `item.image_url`
 * quando presente; cai no ícone/emoji atual quando ausente OU se a imagem
 * falhar ao carregar (nenhum estado quebra o card). Nenhum asset é gerado
 * ainda — este componente só fica pronto para receber `image_url` quando
 * as imagens forem produzidas (Fase seguinte).
 *
 * `variant="emoji"` (padrão) usa CATEGORY_META[category].emoji — já varia
 * por categoria, é o que a Shop mostra hoje. `variant="icon"` usa o ícone
 * lucide de `item.icon` (Inventory/EquippedView mostram hoje) — na prática
 * quase todo item do catálogo gerado declara `icon: 'Package'`, então esse
 * modo normalmente cai no ícone genérico; mantido para não mudar a
 * aparência dos consumidores que já usam esse padrão.
 */
export default function ItemImage({ item, variant = 'emoji', className = '', glyphClassName = '' }) {
  const [failed, setFailed] = useState(false);
  const category = CATEGORY_META[item?.category] || CATEGORY_META.acessorio;
  const hasImage = Boolean(item?.image_url) && !failed;
  const label = item?.name || category.label;

  if (hasImage) {
    return (
      <img
        src={item.image_url}
        alt={label}
        loading="lazy"
        className={`object-contain ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  if (variant === 'icon') {
    const Icon = ICON_MAP[item?.icon] || Package;
    return <Icon className={glyphClassName || 'h-6 w-6 text-primary'} aria-label={label} />;
  }

  return (
    <span className={`text-xl ${glyphClassName}`} role="img" aria-label={label}>
      {category.emoji}
    </span>
  );
}
