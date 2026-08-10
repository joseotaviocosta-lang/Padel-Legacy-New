import React from 'react';
import { X, Coins, Lock, Shield, Weight, Calendar, Factory, BookOpen, TrendingUp, TrendingDown } from 'lucide-react';
import { RARITY_STYLES, CATEGORY_META, SUBCATEGORY_LABELS } from '@/lib/equipmentCatalog';
import { ATTRIBUTES } from '@/lib/padel';
import { BADGE_COLORS } from '@/lib/marketEngine';
import { ModalShell } from '@/components/design-system';

export default function ItemDetailModal({ item, owned, canAfford, access, onBuy, buying, onClose, pricing }) {
  const rarity = RARITY_STYLES[item.rarity] || RARITY_STYLES.comum;
  const cat = CATEGORY_META[item.category] || CATEGORY_META.acessorio;
  const subLabel = SUBCATEGORY_LABELS[item.subcategory] || item.subcategory;

  return (
    <ModalShell open={Boolean(item)} onClose={onClose} title={item.name} description={`${rarity.label} · ${cat.label}`} size="sm">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`h-12 w-12 rounded-2xl bg-secondary/60 flex items-center justify-center text-2xl shrink-0`}>
              {cat.emoji}
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-base leading-tight">{item.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${rarity.badge}`}>{rarity.label}</span>
                <span className="text-[10px] text-muted-foreground">{cat.label}</span>
                {subLabel && subLabel !== item.subcategory && (
                  <span className="text-[9px] text-muted-foreground">· {subLabel}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/50 shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">{item.description}</p>

        {/* Specs grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="glass rounded-xl p-2.5 flex items-center gap-2">
            <Factory className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[8px] uppercase text-muted-foreground">Fabricante</p>
              <p className="text-[11px] font-semibold truncate">{item.manufacturer}</p>
            </div>
          </div>
          <div className="glass rounded-xl p-2.5 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <div>
              <p className="text-[8px] uppercase text-muted-foreground">Lançamento</p>
              <p className="text-[11px] font-semibold">{item.release_year}</p>
            </div>
          </div>
          <div className="glass rounded-xl p-2.5 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-green-400 shrink-0" />
            <div>
              <p className="text-[8px] uppercase text-muted-foreground">Durabilidade</p>
              <p className="text-[11px] font-semibold">{item.durability}/100</p>
            </div>
          </div>
          {item.weight && (
            <div className="glass rounded-xl p-2.5 flex items-center gap-2">
              <Weight className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <div>
                <p className="text-[8px] uppercase text-muted-foreground">Peso</p>
                <p className="text-[11px] font-semibold">{item.weight}g</p>
              </div>
            </div>
          )}
        </div>

        {/* Raquete specs */}
        {item.category === 'raquete' && (
          <div className="glass rounded-xl p-3 mb-4">
            <p className="text-[9px] uppercase text-muted-foreground font-bold mb-2">Especificações da raquete</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[8px] text-muted-foreground">Formato</p>
                <p className="text-[10px] font-bold capitalize">{item.shape}</p>
              </div>
              <div>
                <p className="text-[8px] text-muted-foreground">Balanceamento</p>
                <p className="text-[10px] font-bold capitalize">{item.balance}</p>
              </div>
              <div>
                <p className="text-[8px] text-muted-foreground">País</p>
                <p className="text-[10px] font-bold">{item.country}</p>
              </div>
            </div>
          </div>
        )}

        {/* Attribute bonuses */}
        {item.attribute_bonus && Object.keys(item.attribute_bonus).length > 0 && (
          <div className="glass rounded-xl p-3 mb-4 border border-primary/20">
            <p className="text-[9px] uppercase text-muted-foreground font-bold mb-2">Bônus de atributos</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(item.attribute_bonus).map(([key, val]) => {
                const attr = ATTRIBUTES.find(a => a.key === key);
                const isNegative = val < 0;
                return (
                  <span key={key} className={`inline-flex items-center gap-0.5 rounded-md text-[10px] font-bold px-2 py-1 ${isNegative ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                    {isNegative ? '' : '+'}{val} {attr?.label || key}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* History */}
        {item.history && (
          <div className="glass rounded-xl p-3 mb-4">
            <p className="text-[9px] uppercase text-muted-foreground font-bold mb-1.5 flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-primary" /> História
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{item.history}</p>
          </div>
        )}

        {/* Collection */}
        {item.collection && (
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-[9px] text-muted-foreground">Coleção:</span>
            <span className="text-[9px] font-semibold text-cyan-400">{item.collection}</span>
          </div>
        )}

        {/* Market info */}
        {pricing && !owned && (pricing.discount > 0 || pricing.premium > 0 || pricing.events.length > 0 || pricing.sponsorDiscount > 0) && (
          <div className="glass rounded-xl p-3 mb-4 border border-primary/20">
            <p className="text-[9px] uppercase text-muted-foreground font-bold mb-2 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-primary" /> Mercado Vivo
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pricing.discount > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-md text-[10px] font-bold px-2 py-1 bg-green-500/10 text-green-400">
                  <TrendingDown className="h-3 w-3" /> {pricing.discount}% OFF
                </span>
              )}
              {pricing.premium > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-md text-[10px] font-bold px-2 py-1 bg-red-500/10 text-red-400">
                  <TrendingUp className="h-3 w-3" /> {pricing.premium}% ágio
                </span>
              )}
              {pricing.sponsorDiscount > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-md text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary">
                  🤝 {pricing.sponsorDiscount}% patrocinado
                </span>
              )}
              {pricing.events.map((ev, i) => (
                <span key={i} className={`inline-flex items-center gap-0.5 rounded-md text-[10px] font-bold px-2 py-1 border ${BADGE_COLORS[ev.badge_color] || BADGE_COLORS.primary}`}>
                  {ev.image_emoji} {ev.badge_label || ev.title}
                </span>
              ))}
            </div>
          </div>
        )}

        {access && !access.unlocked && (
          <div className="glass rounded-xl p-3 mb-4 border border-amber-500/30 bg-amber-500/5">
            <p className="text-[9px] uppercase text-amber-400 font-bold mb-2 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Requisitos para desbloquear
            </p>
            <div className="space-y-1">
              {access.reasons.map(reason => (
                <p key={reason} className="text-[11px] text-muted-foreground">• {reason}</p>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Este item continuará visível como objetivo de evolução, mas não pode ser comprado antecipadamente.</p>
          </div>
        )}

        {/* Buy button */}
        {owned ? (
          <div className="w-full py-2.5 rounded-xl bg-secondary/50 text-foreground/50 text-xs font-bold flex items-center justify-center gap-1.5">
            ✓ Adquirido
          </div>
        ) : (
          <button
            onClick={onBuy}
            disabled={!canAfford || buying || (access && !access.unlocked)}
            className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              canAfford && access?.unlocked !== false ? 'bg-primary text-primary-foreground hover:opacity-90 glow-primary' : 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
            }`}
          >
            {buying ? (
              <><div className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Comprando</>
            ) : access && !access.unlocked ? (
              <><Lock className="h-4 w-4" /> Bloqueado pela progressão</>
            ) : canAfford ? (
              <>
                <Coins className="h-4 w-4" />
                {pricing?.currentPrice?.toLocaleString('pt-BR') ?? item.price.toLocaleString('pt-BR')}
                {pricing?.discount > 0 && (
                  <span className="text-[10px] line-through opacity-50">{item.price.toLocaleString('pt-BR')}</span>
                )}
              </>
            ) : (
              <><Lock className="h-4 w-4" /> {pricing?.currentPrice?.toLocaleString('pt-BR') ?? item.price.toLocaleString('pt-BR')}</>
            )}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
