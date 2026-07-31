import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ShoppingBag, Coins, Check, Lock, Package, Search, SlidersHorizontal, TrendingUp, TrendingDown, Flame } from 'lucide-react';
import { ensureMyProfile, ATTRIBUTES, incrementMissionProgress } from '@/lib/padel';
import { LoadingScreen, PageHeader, EmptyStateCard } from '@/components/padel/ui';
import { CoinBadge } from '@/components/padel/GameShared';
import { useToast } from '@/components/ui/use-toast';
import EquippedView from '@/components/shop/EquippedView';
import ItemDetailModal from '@/components/shop/ItemDetailModal';
import MarketEventsBanner from '@/components/shop/MarketEventsBanner';
import { RARITY_STYLES, RARITY_ORDER, CATEGORY_META } from '@/lib/equipmentCatalog';
import { computeItemPrice, BADGE_COLORS, seedMarket } from '@/lib/marketEngine';
import { ensureExpandedShopCatalog, normalizeShopItem } from '@/lib/storeCatalog';
import { loadModuleTasks, safeModuleTask } from '@/lib/moduleLoading';

const PAGE_SIZE = 24;

function safePrice(value, fallback = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function formatCoins(value) {
  return safePrice(value).toLocaleString('pt-BR');
}

const CATEGORIES = [
  { id: 'all', label: 'Todos', emoji: '🏷️' },
  { id: 'raquete', label: 'Raquetes', emoji: '🎾' },
  { id: 'grip', label: 'Grips', emoji: '🔘' },
  { id: 'bola', label: 'Bolas', emoji: '🟡' },
  { id: 'roupa', label: 'Vestuário', emoji: '👕' },
  { id: 'tenis', label: 'Tênis', emoji: '👟' },
  { id: 'mochila', label: 'Mochilas', emoji: '🎒' },
  { id: 'acessorio_tec', label: 'Tecnologia', emoji: '⚡' },
  { id: 'colecionavel', label: 'Colecionáveis', emoji: '👑' },
  { id: 'acessorio', label: 'Acessórios', emoji: '📦' },
];

const RARITIES = [
  { id: 'all', label: 'Todas' },
  ...RARITY_ORDER.map(r => ({ id: r, label: RARITY_STYLES[r].label })),
];

const SORTS = [
  { id: 'price_asc', label: 'Menor preço' },
  { id: 'price_desc', label: 'Maior preço' },
  { id: 'discount', label: 'Maior desconto' },
  { id: 'premium', label: 'Maior ágio' },
  { id: 'rarity_desc', label: 'Mais raro' },
  { id: 'rarity_asc', label: 'Menos raro' },
  { id: 'name_asc', label: 'A-Z' },
];

export default function Shop() {
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [ownedIds, setOwnedIds] = useState(new Set());
  const [category, setCategory] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [manufacturer, setManufacturer] = useState('all');
  const [subcategory, setSubcategory] = useState('all');
  const [ownership, setOwnership] = useState('all');
  const [sort, setSort] = useState('price_asc');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [view, setView] = useState('shop');
  const [equippedItems, setEquippedItems] = useState([]);
  const [detailItem, setDetailItem] = useState(null);
  const [marketEvents, setMarketEvents] = useState([]);
  const [priceHistories, setPriceHistories] = useState([]);
  const [playerSponsors, setPlayerSponsors] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        await safeModuleTask(() => seedMarket(), { label: 'semente do mercado', fallback: null, timeoutMs: 6000 });
        await safeModuleTask(() => ensureExpandedShopCatalog(), { label: 'catálogo ampliado', fallback: null, timeoutMs: 6000 });
        const user = await base44.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const { shopItems, inventory, events, histories, contracts } = await loadModuleTasks({
          shopItems: { task: () => base44.entities.ShopItem.filter({ is_available: true }, '-created_date', 500), fallback: [], label: 'itens da loja' },
          inventory: { task: () => p ? base44.entities.PlayerInventory.filter({ profile_id: p.id }) : [], fallback: [], label: 'inventário' },
          events: { task: () => base44.entities.MarketEvent.filter({ is_active: true }, '-priority', 20), fallback: [], label: 'eventos do mercado' },
          histories: { task: () => base44.entities.MarketPriceHistory.filter({}, '-last_updated_date', 200), fallback: [], label: 'histórico de preços' },
          contracts: { task: () => p ? base44.entities.PlayerContract.filter({ profile_id: p.id, is_active: true }) : [], fallback: [], label: 'contratos ativos' },
        }, { timeoutMs: 8000 });
        setItems((shopItems || []).filter(Boolean).map(normalizeShopItem).map(item => ({ ...item, price: safePrice(item.price) })));
        setOwnedIds(new Set((inventory || []).map(i => i.item_id)));
        setEquippedItems((inventory || []).filter(i => i.equipped));
        setMarketEvents(events || []);
        setPriceHistories(histories || []);
        setPlayerSponsors((contracts || []).map(c => c.sponsor_name));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ─── Dynamic price map ──────────────────────────────────────────────────
  const priceMap = useMemo(() => {
    const map = {};
    const histMap = {};
    (priceHistories || []).forEach(h => { histMap[h.item_id] = h; });
    (items || []).forEach(item => {
      map[item.id] = computeItemPrice(item, marketEvents, histMap[item.id], playerSponsors);
    });
    return map;
  }, [items, marketEvents, priceHistories, playerSponsors]);

  const manufacturers = useMemo(() => {
    const set = new Set(items.map(i => String(i.manufacturer || '').trim()).filter(Boolean));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [items]);

  const subcategories = useMemo(() => {
    const source = category === 'all' ? items : items.filter(i => i.category === category);
    const set = new Set(source.map(i => i.subcategory).filter(Boolean));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [items, category]);

  const filtered = useMemo(() => {
    let result = items;
    if (category !== 'all') result = result.filter(i => i.category === category);
    if (rarity !== 'all') result = result.filter(i => i.rarity === rarity);
    if (manufacturer !== 'all') result = result.filter(i => i.manufacturer === manufacturer);
    if (subcategory !== 'all') result = result.filter(i => i.subcategory === subcategory);
    if (ownership === 'owned') result = result.filter(i => ownedIds.has(i.id));
    if (ownership === 'not_owned') result = result.filter(i => !ownedIds.has(i.id));
    if (ownership === 'affordable') result = result.filter(i => (priceMap[i.id]?.currentPrice ?? i.price) <= (profile?.coins || 0));
    if (search) result = result.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()));

    const rarityVal = (r) => RARITY_ORDER.indexOf(r);
    const getPrice = (item) => safePrice(priceMap[item.id]?.currentPrice, safePrice(item?.price));
    switch (sort) {
      case 'price_asc': result = [...result].sort((a, b) => getPrice(a) - getPrice(b)); break;
      case 'price_desc': result = [...result].sort((a, b) => getPrice(b) - getPrice(a)); break;
      case 'discount': result = [...result].sort((a, b) => (priceMap[b.id]?.discount || 0) - (priceMap[a.id]?.discount || 0)); break;
      case 'premium': result = [...result].sort((a, b) => (priceMap[b.id]?.premium || 0) - (priceMap[a.id]?.premium || 0)); break;
      case 'rarity_desc': result = [...result].sort((a, b) => rarityVal(b.rarity) - rarityVal(a.rarity)); break;
      case 'rarity_asc': result = [...result].sort((a, b) => rarityVal(a.rarity) - rarityVal(b.rarity)); break;
      case 'name_asc': result = [...result].sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return result;
  }, [items, category, rarity, manufacturer, subcategory, ownership, sort, search, priceMap, ownedIds, profile?.coins]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > paged.length;

  useEffect(() => { setPage(1); }, [category, rarity, manufacturer, subcategory, ownership, sort, search]);
  useEffect(() => { setSubcategory('all'); }, [category]);

  async function buy(item) {
    if (!profile) return;
    const pricing = priceMap[item.id];
    const currentPrice = safePrice(pricing?.currentPrice, safePrice(item?.price));
    if ((profile.coins || 0) < currentPrice) {
      toast({ title: 'Moedas insuficientes', description: `Você precisa de ${formatCoins(currentPrice)} moedas.`, variant: 'destructive' });
      return;
    }
    setBuying(item.id);
    try {
      await base44.entities.PlayerInventory.create({
        profile_id: profile.id,
        item_id: item.id,
        item_name: item.name,
        category: item.category,
        rarity: item.rarity,
        equipped: false,
        acquired_date: new Date().toISOString().slice(0, 10),
        current_durability: item.durability || 100,
        usage_count: 0,
      });
      const updated = await base44.entities.PlayerProfile.update(profile.id, {
        coins: (profile.coins || 0) - currentPrice,
      });
      setProfile(updated);
      setOwnedIds(prev => new Set([...prev, item.id]));
      incrementMissionProgress(profile.id, 'buy_item').catch(() => {});

      // Update demand in MarketPriceHistory
      const hist = priceHistories.find(h => h.item_id === item.id);
      if (hist) {
        base44.entities.MarketPriceHistory.update(hist.id, {
          demand_score: Math.min(100, (hist.demand_score || 50) + 5),
          purchase_count: (hist.purchase_count || 0) + 1,
          stock_remaining: hist.is_limited_stock ? Math.max(0, (hist.stock_remaining || 0) - 1) : -1,
        }).catch(() => {});
      }

      toast({ title: 'Compra realizada!', description: `${item.name} adicionado ao inventário. ${pricing?.discount > 0 ? `Você economizou ${pricing.discount}%!` : ''}` });
      setDetailItem(null);
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível concluir a compra.', variant: 'destructive' });
    } finally { setBuying(null); }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={ShoppingBag} title="Loja de Equipamentos" subtitle={`${items.length} itens disponíveis`} accent="amber">
        <CoinBadge coins={profile?.coins || 0} size="md" />
        <Link to="/game/inventory" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <Package className="h-3.5 w-3.5" /> Inventário
        </Link>
      </PageHeader>

      {/* Live Market Events Banner */}
      {marketEvents.length > 0 && (
        <MarketEventsBanner events={marketEvents} />
      )}

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('shop')}
          className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${view === 'shop' ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground'}`}
        >
          <ShoppingBag className="h-4 w-4 inline mr-1.5" /> Loja
        </button>
        <button
          onClick={() => setView('equipped')}
          className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${view === 'equipped' ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground'}`}
        >
          <Check className="h-4 w-4 inline mr-1.5" /> Equipados ({equippedItems.length})
        </button>
      </div>

      {view === 'equipped' ? (
        <EquippedView equippedItems={equippedItems} items={items} />
      ) : (
        <>
          {/* Search + filters toggle */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar equipamento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl glass text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-1.5 ${showFilters ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground'}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          {/* Category filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                  category === cat.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{cat.emoji}</span> {cat.label}
              </button>
            ))}
          </div>

          {/* Advanced filters */}
          {showFilters && (
            <div className="glass rounded-2xl p-4 space-y-3 animate-slide-up">
              {/* Rarity */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Raridade</p>
                <div className="flex gap-1.5 flex-wrap">
                  {RARITIES.map(r => {
                    const style = r.id !== 'all' ? RARITY_STYLES[r.id] : null;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setRarity(r.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                          rarity === r.id
                            ? (style ? `${style.badge} ring-1` : 'bg-primary text-primary-foreground')
                            : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subcategory */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Subcategoria</p>
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass text-sm text-foreground focus:outline-none focus:border-primary/40"
                >
                  {subcategories.map(s => (
                    <option key={s} value={s} className="bg-card">{s === 'all' ? 'Todas as subcategorias' : s.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Ownership */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Situação</p>
                <select value={ownership} onChange={(e) => setOwnership(e.target.value)} className="w-full px-3 py-2 rounded-xl glass text-sm text-foreground focus:outline-none focus:border-primary/40">
                  <option value="all" className="bg-card">Todos os itens</option>
                  <option value="not_owned" className="bg-card">Ainda não adquiridos</option>
                  <option value="owned" className="bg-card">Já adquiridos</option>
                  <option value="affordable" className="bg-card">Posso comprar agora</option>
                </select>
              </div>

              {/* Manufacturer */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Fabricante</p>
                <select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass text-sm text-foreground focus:outline-none focus:border-primary/40"
                >
                  {manufacturers.map(m => (
                    <option key={m} value={m} className="bg-card">{m === 'all' ? 'Todos os fabricantes' : m}</option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Ordenar por</p>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass text-sm text-foreground focus:outline-none focus:border-primary/40"
                >
                  {SORTS.map(s => (
                    <option key={s.id} value={s.id} className="bg-card">{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Results count */}
          <p className="text-xs text-muted-foreground px-1">
            {filtered.length} {filtered.length === 1 ? 'item encontrado' : 'itens encontrados'}
          </p>

          {/* Items grid */}
          {filtered.length === 0 ? (
            <EmptyStateCard icon={ShoppingBag} message="Nenhum item encontrado com esses filtros." />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 animate-stagger">
                {paged.map(item => {
                  const cat = CATEGORY_META[item.category] || CATEGORY_META.acessorio;
                  const rarityStyle = RARITY_STYLES[item.rarity] || RARITY_STYLES.comum;
                  const owned = ownedIds.has(item.id);
                  const pricing = priceMap[item.id];
                  const currentPrice = safePrice(pricing?.currentPrice, safePrice(item?.price));
                  const canAfford = (profile?.coins || 0) >= currentPrice;
                  const hist = priceHistories.find(h => h.item_id === item.id);
                  const isLimited = hist?.is_limited_stock && hist?.stock_remaining >= 0;
                  const stockLeft = hist?.stock_remaining || 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      className={`glass rounded-2xl p-3 flex flex-col gap-2 text-left bg-gradient-to-br ${rarityStyle.card} hover:border-primary/40 hover:scale-[1.02] transition-all press-scale relative overflow-hidden`}
                    >
                      {/* Event badge */}
                      {pricing?.badge && (
                        <span className={`absolute top-2 right-2 z-10 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase ${BADGE_COLORS[pricing.badge.color] || BADGE_COLORS.primary}`}>
                          {pricing.badge.label}
                        </span>
                      )}
                      {/* Limited stock indicator */}
                      {isLimited && stockLeft <= 3 && !owned && (
                        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-0.5 rounded-full border border-red-500/40 bg-red-500/20 text-red-400 px-1.5 py-0.5 text-[7px] font-black uppercase">
                          <Flame className="h-2.5 w-2.5" /> {stockLeft} restam
                        </span>
                      )}
                      <div className="flex items-start justify-between">
                        <div className="h-10 w-10 rounded-xl bg-secondary/60 flex items-center justify-center text-xl">
                          {cat.emoji}
                        </div>
                        {!pricing?.badge && (
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase ${rarityStyle.badge}`}>
                            {rarityStyle.label}
                          </span>
                        )}
                      </div>
                      <div className="min-h-[2.5rem]">
                        <h3 className="font-bold text-[11px] leading-tight line-clamp-2">{item.name}</h3>
                        <p className="text-[9px] text-muted-foreground leading-snug line-clamp-1">{item.manufacturer}</p>
                      </div>
                      {item.attribute_bonus && Object.keys(item.attribute_bonus).length > 0 && (
                        <div className="flex flex-wrap gap-0.5">
                          {Object.entries(item.attribute_bonus).slice(0, 3).map(([key, val]) => {
                            const attr = ATTRIBUTES.find(a => a.key === key);
                            return (
                              <span key={key} className={`inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 ${val < 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                                {val < 0 ? '' : '+'}{val} {attr?.label?.slice(0, 3) || key.slice(0, 3)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-auto pt-1 flex flex-col gap-1">
                        {/* Price with discount/premium */}
                        {owned ? (
                          <span className="text-[10px] font-bold text-primary flex items-center gap-0.5">
                            <Check className="h-3 w-3" /> Adquirido
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {pricing && pricing.discount > 0 && (
                              <span className="text-[9px] text-muted-foreground line-through">{formatCoins(item.price)}</span>
                            )}
                            <span className={`text-xs font-bold flex items-center gap-0.5 ${canAfford ? (pricing?.discount > 0 ? 'text-green-400' : 'text-yellow-400') : 'text-muted-foreground'}`}>
                              {canAfford ? <Coins className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                              {formatCoins(currentPrice)}
                            </span>
                            {pricing?.discount > 0 && (
                              <span className="text-[8px] font-bold text-green-400 flex items-center">
                                <TrendingDown className="h-2.5 w-2.5" /> {pricing.discount}%
                              </span>
                            )}
                            {pricing?.premium > 0 && (
                              <span className="text-[8px] font-bold text-red-400 flex items-center">
                                <TrendingUp className="h-2.5 w-2.5" /> {pricing.premium}%
                              </span>
                            )}
                          </div>
                        )}
                        {pricing?.sponsorDiscount > 0 && (
                          <span className="text-[7px] text-primary font-semibold">🤝 {pricing.sponsorDiscount}% patrocinado</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Load more */}
              {hasMore && (
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="w-full py-3 rounded-xl glass text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Carregar mais ({filtered.length - paged.length} restantes)
                </button>
              )}
            </>
          )}
        </>
      )}

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          owned={ownedIds.has(detailItem.id)}
          canAfford={(profile?.coins || 0) >= safePrice(priceMap[detailItem.id]?.currentPrice, safePrice(detailItem.price))}
          buying={buying === detailItem.id}
          onBuy={() => buy(detailItem)}
          onClose={() => setDetailItem(null)}
          pricing={priceMap[detailItem.id]}
        />
      )}
    </div>
  );
}