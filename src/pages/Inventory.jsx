import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Package, ShoppingBag, Check, Zap, Coins } from 'lucide-react';
import { ensureMyProfile, ATTRIBUTES, incrementMissionProgress } from '@/lib/padel';
import { RarityBadge, RARITY_STYLES } from '@/components/padel/GameShared';
import { Page, PageContent, PageHeader, PageSkeleton, Surface, SurfaceHeader, StatCard, StatusBadge, EmptyState, Button } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import ItemImage from '@/components/shop/ItemImage';
import { recordFinancialEntry } from '@/lib/financialLedger.js';
import { toggleEquipItem } from '@/game-core/equipmentLifecycle.js';
import { computeEquipmentModifiers, totalAppliedModifier } from '@/lib/equipmentModifiers.js';
const CATEGORY_LABELS = {
  raquete: 'Raquetes',
  grip: 'Grips',
  bola: 'Bolas',
  roupa: 'Vestimenta',
  tenis: 'Tênis',
  mochila: 'Mochilas',
  acessorio_tec: 'Tecnologia',
  colecionavel: 'Colecionáveis',
  acessorio: 'Acessórios',
};
// Slots principais do "locker" do atleta (seção 19/20 do redesign de
// Carreira) — usados só para o resumo do topo; o inventário completo abaixo
// continua agrupado por todas as categorias reais do catálogo.
const EQUIPMENT_SLOTS = [
  { category: 'raquete', label: 'Raquete' },
  { category: 'tenis', label: 'Tênis' },
  { category: 'roupa', label: 'Roupa' },
  { category: 'acessorio', label: 'Acessório' },
];

export default function Inventory() {
  const [profile, setProfile] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [shopMap, setShopMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [selling, setSelling] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const [inv, shopItems] = await Promise.all([
          p ? localGame.entities.PlayerInventory.filter({ profile_id: p.id }) : [],
          localGame.entities.ShopItem.list(),
        ]);
        setInventory(inv || []);
        const map = {};
        (shopItems || []).forEach(s => { map[s.id] = s; });
        setShopMap(map);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  async function toggleEquip(invItem) {
    if (!profile) return;
    setToggling(invItem.id);
    try {
      const wasEquipped = invItem.equipped;
      // LOCAL-9B: equipar/desequipar só troca as flags do inventário (um item
      // por categoria) e o nome da raquete. O bônus nunca é gravado no
      // atributo-base: é derivado do catálogo (equipmentModifiers.js) na
      // partida e na exibição, então o treino não perde margem de teto.
      const { invUpdates, profileUpdates } = await toggleEquipItem({ profile, inventory, target: invItem, shopItems: shopMap });

      setProfile(prev => ({ ...prev, ...profileUpdates }));
      setInventory(prev => prev.map(i => {
        const upd = invUpdates.find(u => u.id === i.id);
        return upd ? { ...i, equipped: upd.equipped, applied_bonus: upd.applied_bonus } : i;
      }));

      if (!wasEquipped) {
        incrementMissionProgress(profile.id, 'equip_item').catch(() => {});
      }
      toast({
        title: wasEquipped ? 'Item desequipado' : 'Item equipado!',
        description: invItem.item_name,
      });
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível completar a ação.', variant: 'destructive' });
    } finally { setToggling(null); }
  }

  async function sellItem(invItem) {
    if (invItem.equipped) return;
    const shopItem = shopMap[invItem.item_id];
    const sellPrice = Math.floor((shopItem?.price || 0) * 0.3);
    setSelling(invItem.id);
    try {
      await localGame.entities.PlayerInventory.delete(invItem.id);
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        coins: (profile.coins || 0) + sellPrice,
      });
      await recordFinancialEntry({ id: `inventory-sale-${invItem.id}`, profileId: profile.id, date: profile.career_date, type: 'income', category: 'loja', description: `Venda: ${invItem.item_name}`, amount: sellPrice });
      setProfile(updated);
      setInventory(prev => prev.filter(i => i.id !== invItem.id));
      toast({ title: 'Item vendido!', description: `${invItem.item_name} vendido por ${sellPrice} moedas.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível vender o item.', variant: 'destructive' });
    } finally { setSelling(null); }
  }

  if (loading) {
    return <PageSkeleton variant="grid" rows={6} />;
  }

  const categories = [...new Set(inventory.map(i => i.category))];
  const equippedCount = inventory.filter(item => item.equipped).length;
  // LOCAL-9B (9A-12): soma do que o equipamento REALMENTE acrescenta aos
  // atributos-base (um item por categoria, limite de 100), não a soma bruta
  // dos bônus declarados.
  const totalBonus = totalAppliedModifier(profile, computeEquipmentModifiers(inventory, shopMap));

  return (
    <Page>
      <PageContent>
        <PageHeader
          eyebrow="Equipamentos da carreira"
          title="Inventário"
          description="Gerencie seus itens, monte o equipamento ideal e acompanhe os bônus ativos no atleta."
          icon={Package}
          tone="info"
          action={<Link to="/game/shop" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"><ShoppingBag className="h-4 w-4" /> Abrir loja</Link>}
          stats={[<StatusBadge key="items" tone="info">{inventory.length} itens</StatusBadge>, <StatusBadge key="equipped" tone="success">{equippedCount} equipados</StatusBadge>]}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Itens possuídos" value={inventory.length} detail={`${categories.length} categorias`} icon={Package} tone="brand" />
          <StatCard label="Equipados" value={equippedCount} detail="Bônus ativos" icon={Check} tone="success" />
          <StatCard label="Bônus total" value={`+${totalBonus}`} detail="Soma dos atributos ativos" icon={Zap} tone="premium" />
        </div>

        {inventory.length === 0 ? (
          <EmptyState icon={Package} title="Seu inventário está vazio" description="Visite a loja para comprar seu primeiro equipamento e começar a personalizar o atleta." action={<Link to="/game/shop" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"><ShoppingBag className="h-4 w-4" /> Ir para a loja</Link>} />
        ) : (
        <>
        <Surface variant="elevated">
          <SurfaceHeader title="Equipado agora" description="O que o seu atleta está usando em cada slot principal." icon={Check} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {EQUIPMENT_SLOTS.map(slot => {
              const equippedItem = inventory.find(item => item.category === slot.category && item.equipped);
              const shopItem = equippedItem ? shopMap[equippedItem.item_id] : null;
              const bonus = shopItem?.attribute_bonus || {};
              return (
                <div key={slot.category} className="rounded-xl bg-secondary/30 p-3 flex items-start gap-2">
                  {equippedItem && (
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-secondary/60 flex items-center justify-center overflow-hidden">
                      <ItemImage item={shopItem} variant="icon" className="h-full w-full" glyphClassName="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{slot.label}</p>
                    {equippedItem ? (
                      <>
                        <p className="mt-1 truncate text-xs font-bold">{equippedItem.item_name}</p>
                        {Object.keys(bonus).length > 0 && (
                          <p className="mt-0.5 truncate text-[9px] text-primary">{Object.entries(bonus).map(([key, val]) => `+${val} ${ATTRIBUTES.find(a => a.key === key)?.label || key}`).join(' · ')}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Vazio</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>
        {categories.map(cat => (
          <Surface key={cat} variant="elevated" padding="default">
            <SurfaceHeader title={CATEGORY_LABELS[cat] || cat} description={`${inventory.filter(item => item.category === cat).length} itens nesta categoria`} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {inventory.filter(i => i.category === cat).map(invItem => {
                const shopItem = shopMap[invItem.item_id];
                const rarity = RARITY_STYLES[invItem.rarity] || RARITY_STYLES.comum;
                const bonus = shopItem?.attribute_bonus || {};
                return (
                  <div key={invItem.id} className={`glass rounded-2xl p-4 flex flex-col gap-2 bg-gradient-to-br ${rarity.card} ${invItem.equipped ? 'ring-2 ring-primary/50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 rounded-xl bg-secondary/60 flex items-center justify-center overflow-hidden">
                        <ItemImage item={shopItem} variant="icon" className="h-full w-full" glyphClassName="h-6 w-6 text-primary" />
                      </div>
                      {invItem.equipped && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold px-1.5 py-0.5">
                          <Check className="h-2.5 w-2.5" /> Equipado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm leading-tight">{invItem.item_name}</h3>
                    </div>
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
                    <div className="mt-auto pt-2 flex gap-2">
                      <Button
                        level={invItem.equipped ? 'secondary' : 'primary'}
                        size="sm"
                        onClick={() => toggleEquip(invItem)}
                        disabled={toggling === invItem.id}
                        className="flex-1"
                      >
                        {toggling === invItem.id ? '...' : invItem.equipped ? 'Desequipar' : 'Equipar'}
                      </Button>
                      {!invItem.equipped && (
                        <Button
                          level="ghost"
                          size="sm"
                          onClick={() => sellItem(invItem)}
                          disabled={selling === invItem.id}
                          className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                          title={`Vender por ${Math.floor((shopMap[invItem.item_id]?.price || 0) * 0.3)} moedas`}
                        >
                          {selling === invItem.id ? (
                            <div className="w-3 h-3 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin" />
                          ) : (
                            <><Coins className="h-3 w-3" />{Math.floor((shopMap[invItem.item_id]?.price || 0) * 0.3)}</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        ))}
        </>
      )}
      </PageContent>
    </Page>
  );
}