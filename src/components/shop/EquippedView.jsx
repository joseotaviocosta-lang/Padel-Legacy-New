import React from 'react';
import { Check, Package, Disc, Crown, Circle, Target, Shirt, Briefcase, Zap } from 'lucide-react';
import { RarityBadge, RARITY_STYLES } from '@/components/padel/GameShared';
import { ATTRIBUTES } from '@/lib/padel';

const ICON_MAP = { Disc, Crown, Circle, Target, Shirt, Briefcase, Zap, Package };

const CATEGORY_LABELS = {
  raquete: 'Raquetes',
  grip: 'Grips',
  bola: 'Bolas',
  roupa: 'Vestimenta',
  mochila: 'Mochilas',
  acessorio: 'Acessórios',
};

export default function EquippedView({ equippedItems, items }) {
  const shopMap = {};
  (items || []).forEach(i => { shopMap[i.id] = i; });

  if (!equippedItems || equippedItems.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center">
        <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum item equipado no momento.</p>
        <p className="text-xs text-muted-foreground mt-1">Equipe itens no inventário para ver os bônus ativos aqui.</p>
      </div>
    );
  }

  const categories = [...new Set(equippedItems.map(i => i.category))];

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-3 border border-primary/20 bg-primary/5 flex items-center gap-2">
        <Check className="h-4 w-4 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground">
          Estes são os itens que você está usando agora. Consulte esta lista antes de comprar para evitar itens repetidos da mesma categoria.
        </p>
      </div>
      {categories.map(cat => (
        <div key={cat} className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-bold">{CATEGORY_LABELS[cat] || cat}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {equippedItems.filter(i => i.category === cat).map(invItem => {
              const shopItem = shopMap[invItem.item_id];
              const Icon = (shopItem && ICON_MAP[shopItem.icon]) || Package;
              const rarity = RARITY_STYLES[invItem.rarity] || RARITY_STYLES.comum;
              const bonus = shopItem?.attribute_bonus || {};
              return (
                <div key={invItem.id} className={`glass rounded-2xl p-4 flex flex-col gap-2 bg-gradient-to-br ${rarity.card} ring-2 ring-primary/50`}>
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 rounded-xl bg-secondary/60 flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold px-1.5 py-0.5">
                      <Check className="h-2.5 w-2.5" /> Equipado
                    </span>
                  </div>
                  <h3 className="font-bold text-sm leading-tight">{invItem.item_name}</h3>
                  <RarityBadge rarity={invItem.rarity} />
                  {bonus && Object.keys(bonus).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(bonus).map(([key, val]) => {
                        const attr = ATTRIBUTES.find(a => a.key === key);
                        return (
                          <span key={key} className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5">
                            +{val} {attr?.label || key}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}