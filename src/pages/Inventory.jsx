import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Package, ShoppingBag, Check, Disc, Crown, Circle, Target, Shirt, Briefcase, Zap, Coins } from 'lucide-react';
import { ensureMyProfile, ATTRIBUTES, incrementMissionProgress } from '@/lib/padel';
import { RarityBadge, RARITY_STYLES } from '@/components/padel/GameShared';
import { LoadingScreen } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, Surface, SurfaceHeader, StatCard, StatusBadge, EmptyState } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';

const ICON_MAP = { Disc, Crown, Circle, Target, Shirt, Briefcase, Zap };
const CATEGORY_LABELS = {
  raquete: 'Raquetes',
  grip: 'Grips',
  bola: 'Bolas',
  roupa: 'Vestimenta',
  mochila: 'Mochilas',
  acessorio: 'Acessórios',
};

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
      const shopItem = shopMap[invItem.item_id];
      const bonus = shopItem?.attribute_bonus || {};
      const wasEquipped = invItem.equipped;

      // Track running attribute state for correct multi-item math
      let working = { ...profile };
      const profileUpdates = {};
      const invUpdates = [];

      const applyToProfile = (key, newVal) => {
        working[key] = newVal;
        profileUpdates[key] = newVal;
      };

      if (wasEquipped) {
        // Unequip: remove bonuses
        for (const [key, val] of Object.entries(bonus)) {
          applyToProfile(key, Math.max(0, (working[key] || 0) - val));
        }
        if (invItem.category === 'raquete') profileUpdates.racket = '';
        invUpdates.push({ id: invItem.id, equipped: false });
      } else {
        // Unequip any currently equipped item in the same category
        const sameCategory = inventory.filter(i => i.category === invItem.category && i.equipped && i.id !== invItem.id);
        for (const other of sameCategory) {
          const otherShop = shopMap[other.item_id];
          const otherBonus = otherShop?.attribute_bonus || {};
          for (const [key, val] of Object.entries(otherBonus)) {
            applyToProfile(key, Math.max(0, (working[key] || 0) - val));
          }
          if (other.category === 'raquete') profileUpdates.racket = '';
          invUpdates.push({ id: other.id, equipped: false });
        }
        // Equip new item: add bonuses
        for (const [key, val] of Object.entries(bonus)) {
          applyToProfile(key, Math.min(100, (working[key] || 0) + val));
        }
        if (invItem.category === 'raquete') profileUpdates.racket = invItem.item_name;
        invUpdates.push({ id: invItem.id, equipped: true });
      }

      // Single profile update
      if (Object.keys(profileUpdates).length > 0) {
        await localGame.entities.PlayerProfile.update(profile.id, profileUpdates);
      }
      // Batch inventory updates
      if (invUpdates.length > 0) {
        await localGame.entities.PlayerInventory.bulkUpdate(invUpdates);
      }

      setProfile(prev => ({ ...prev, ...profileUpdates }));
      setInventory(prev => prev.map(i => {
        const upd = invUpdates.find(u => u.id === i.id);
        return upd ? { ...i, equipped: upd.equipped } : i;
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
      setProfile(updated);
      setInventory(prev => prev.filter(i => i.id !== invItem.id));
      toast({ title: 'Item vendido!', description: `${invItem.item_name} vendido por ${sellPrice} moedas.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível vender o item.', variant: 'destructive' });
    } finally { setSelling(null); }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  const categories = [...new Set(inventory.map(i => i.category))];
  const equippedCount = inventory.filter(item => item.equipped).length;
  const totalBonus = inventory.filter(item => item.equipped).reduce((sum, item) => {
    const bonus = shopMap[item.item_id]?.attribute_bonus || {};
    return sum + Object.values(bonus).reduce((subtotal, value) => subtotal + Number(value || 0), 0);
  }, 0);

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
        categories.map(cat => (
          <Surface key={cat} variant="elevated" padding="default">
            <SurfaceHeader title={CATEGORY_LABELS[cat] || cat} description={`${inventory.filter(item => item.category === cat).length} itens nesta categoria`} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {inventory.filter(i => i.category === cat).map(invItem => {
                const shopItem = shopMap[invItem.item_id];
                const Icon = (shopItem && ICON_MAP[shopItem.icon]) || Package;
                const rarity = RARITY_STYLES[invItem.rarity] || RARITY_STYLES.comum;
                const bonus = shopItem?.attribute_bonus || {};
                return (
                  <div key={invItem.id} className={`glass rounded-2xl p-4 flex flex-col gap-2 bg-gradient-to-br ${rarity.card} ${invItem.equipped ? 'ring-2 ring-primary/50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 rounded-xl bg-secondary/60 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
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
                      <button
                        onClick={() => toggleEquip(invItem)}
                        disabled={toggling === invItem.id}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                          invItem.equipped
                            ? 'bg-secondary/50 text-foreground hover:bg-secondary'
                            : 'bg-primary text-primary-foreground hover:opacity-90 glow-primary'
                        }`}
                      >
                        {toggling === invItem.id ? '...' : invItem.equipped ? 'Desequipar' : 'Equipar'}
                      </button>
                      {!invItem.equipped && (
                        <button
                          onClick={() => sellItem(invItem)}
                          disabled={selling === invItem.id}
                          className="px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                          title={`Vender por ${Math.floor((shopMap[invItem.item_id]?.price || 0) * 0.3)} moedas`}
                        >
                          {selling === invItem.id ? (
                            <div className="w-3 h-3 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin" />
                          ) : (
                            <><Coins className="h-3 w-3" />{Math.floor((shopMap[invItem.item_id]?.price || 0) * 0.3)}</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        ))
      )}
      </PageContent>
    </Page>
  );
}