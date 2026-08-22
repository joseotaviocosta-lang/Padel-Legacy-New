import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ShoppingBag, Coins, Check, Lock, Package, Search, SlidersHorizontal, TrendingUp, TrendingDown, Flame } from 'lucide-react';
import { ensureMyProfile, ATTRIBUTES, incrementMissionProgress } from '@/lib/padel';
import { Page, PageContent, PageHeader, PageSkeleton, CardGrid, StatCard, Surface, StatusBadge, EmptyState, Tabs, Button, FilterPills } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import EquippedView from '@/components/shop/EquippedView';
import ItemDetailModal from '@/components/shop/ItemDetailModal';
import MarketEventsBanner from '@/components/shop/MarketEventsBanner';
import { RARITY_STYLES, RARITY_ORDER, CATEGORY_META } from '@/lib/equipmentCatalog';
import { computeItemPrice, BADGE_COLORS, isMarketEventActive, normalizeMarketEvent, seedMarket } from '@/lib/marketEngine';
import { ensureExpandedShopCatalog, normalizeShopItem, getShopItemAccess } from '@/lib/storeCatalog';
import { loadModuleTasks, safeModuleTask } from '@/lib/moduleLoading';
import { getEquipmentMarketState } from '@/lib/sportsEconomyV26';

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
  { id: 'recommended', label: 'Recomendados para mim' },
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
  const [ownership, setOwnership] = useState('market');
  const [sort, setSort] = useState('recommended');
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
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const { shopItems, inventory, events, histories, contracts } = await loadModuleTasks({
          shopItems: { task: () => localGame.entities.ShopItem.filter({ is_available: true }, 'catalog_order', 1000), fallback: [], label: 'itens da loja' },
          inventory: { task: () => p ? localGame.entities.PlayerInventory.filter({ profile_id: p.id }) : [], fallback: [], label: 'inventário' },
          events: { task: () => localGame.entities.MarketEvent.filter({ is_active: true }, '-priority', 20), fallback: [], label: 'eventos do mercado' },
          histories: { task: () => localGame.entities.MarketPriceHistory.filter({}, '-last_updated_date', 200), fallback: [], label: 'histórico de preços' },
          contracts: { task: () => p ? localGame.entities.PlayerContract.filter({ profile_id: p.id, is_active: true }) : [], fallback: [], label: 'contratos ativos' },
        }, { timeoutMs: 8000 });
        setItems((shopItems || []).filter(Boolean).map(normalizeShopItem).map(item => ({ ...item, price: safePrice(item.price) })));
        setOwnedIds(new Set((inventory || []).map(i => i.item_id)));
        setEquippedItems((inventory || []).filter(i => i.equipped));
        setMarketEvents((events || []).map(normalizeMarketEvent).filter((event) => isMarketEventActive(event, p?.career_date)));
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

  const accessMap = useMemo(() => {
    const map = {};
    items.forEach(item => { map[item.id] = getShopItemAccess(profile, item); });
    return map;
  }, [items, profile]);


  const marketAvailabilityMap = useMemo(() => {
    const map = {};
    const marketProfile = { ...(profile || {}), active_sponsor_names: playerSponsors };
    items.forEach(item => { map[item.id] = getEquipmentMarketState(item, marketProfile); });
    return map;
  }, [items, profile, playerSponsors]);

  const progressionStats = useMemo(() => {
    const unlocked = items.filter(item => accessMap[item.id]?.unlocked).length;
    const marketAvailable = items.filter(item => marketAvailabilityMap[item.id]?.available || ownedIds.has(item.id)).length;
    const affordable = items.filter(item => accessMap[item.id]?.unlocked && (priceMap[item.id]?.currentPrice ?? item.price) <= (profile?.coins || 0)).length;
    return { unlocked, locked: Math.max(0, items.length - unlocked), affordable, marketAvailable };
  }, [items, accessMap, priceMap, profile?.coins, marketAvailabilityMap, ownedIds]);

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
    if (ownership === 'market') result = result.filter(i => marketAvailabilityMap[i.id]?.available || ownedIds.has(i.id));
    if (ownership === 'owned') result = result.filter(i => ownedIds.has(i.id));
    if (ownership === 'not_owned') result = result.filter(i => !ownedIds.has(i.id));
    if (ownership === 'affordable') result = result.filter(i => accessMap[i.id]?.unlocked && (priceMap[i.id]?.currentPrice ?? i.price) <= (profile?.coins || 0));
    if (ownership === 'unlocked') result = result.filter(i => accessMap[i.id]?.unlocked);
    if (ownership === 'locked') result = result.filter(i => !accessMap[i.id]?.unlocked);
    if (search) result = result.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()));

    const rarityVal = (r) => RARITY_ORDER.indexOf(r);
    const getPrice = (item) => safePrice(priceMap[item.id]?.currentPrice, safePrice(item?.price));
    switch (sort) {
      case 'recommended': result = [...result].sort((a, b) => {
        const accessA = accessMap[a.id]?.unlocked ? 0 : 1;
        const accessB = accessMap[b.id]?.unlocked ? 0 : 1;
        if (accessA !== accessB) return accessA - accessB;
        const ownedA = ownedIds.has(a.id) ? 1 : 0;
        const ownedB = ownedIds.has(b.id) ? 1 : 0;
        if (ownedA !== ownedB) return ownedA - ownedB;
        return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || getPrice(a) - getPrice(b);
      }); break;
      case 'price_asc': result = [...result].sort((a, b) => getPrice(a) - getPrice(b)); break;
      case 'price_desc': result = [...result].sort((a, b) => getPrice(b) - getPrice(a)); break;
      case 'discount': result = [...result].sort((a, b) => (priceMap[b.id]?.discount || 0) - (priceMap[a.id]?.discount || 0)); break;
      case 'premium': result = [...result].sort((a, b) => (priceMap[b.id]?.premium || 0) - (priceMap[a.id]?.premium || 0)); break;
      case 'rarity_desc': result = [...result].sort((a, b) => rarityVal(b.rarity) - rarityVal(a.rarity)); break;
      case 'rarity_asc': result = [...result].sort((a, b) => rarityVal(a.rarity) - rarityVal(b.rarity)); break;
      case 'name_asc': result = [...result].sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return result;
  }, [items, category, rarity, manufacturer, subcategory, ownership, sort, search, priceMap, accessMap, ownedIds, profile?.coins, marketAvailabilityMap]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > paged.length;

  useEffect(() => { setPage(1); }, [category, rarity, manufacturer, subcategory, ownership, sort, search]);
  useEffect(() => { setSubcategory('all'); }, [category]);

  function currentEquippedFor(item) {
    if (!item) return null;
    const equippedInCategory = equippedItems.find(inv => inv.category === item.category);
    return equippedInCategory ? items.find(shopEntry => shopEntry.id === equippedInCategory.item_id) : null;
  }

  async function buy(item) {
    if (!profile) return;
    const marketState = marketAvailabilityMap[item.id];
    if (!marketState?.available && !ownedIds.has(item.id)) {
      toast({ title: 'Item fora da rotação', description: marketState?.reason || 'Este equipamento pode voltar em outro mês.', variant: 'destructive' });
      return;
    }
    const access = getShopItemAccess(profile, item);
    if (!access.unlocked) {
      toast({ title: 'Equipamento ainda bloqueado', description: `Você precisa de ${access.reasons.join(', ')}.`, variant: 'destructive' });
      return;
    }
    const pricing = priceMap[item.id];
    const currentPrice = safePrice(pricing?.currentPrice, safePrice(item?.price));
    if ((profile.coins || 0) < currentPrice) {
      toast({ title: 'Moedas insuficientes', description: `Você precisa de ${formatCoins(currentPrice)} moedas.`, variant: 'destructive' });
      return;
    }
    setBuying(item.id);
    try {
      await localGame.entities.PlayerInventory.create({
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
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        coins: (profile.coins || 0) - currentPrice,
      });
      setProfile(updated);
      setOwnedIds(prev => new Set([...prev, item.id]));
      incrementMissionProgress(profile.id, 'buy_item').catch(() => {});

      // Update demand in MarketPriceHistory
      const hist = priceHistories.find(h => h.item_id === item.id);
      if (hist) {
        localGame.entities.MarketPriceHistory.update(hist.id, {
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
    return <PageSkeleton variant="grid" rows={6} />;
  }

  return (
    <Page size="default" className="animate-fade-in">
      <PageContent>
        <PageHeader
          eyebrow="Equipamentos e performance"
          icon={ShoppingBag}
          title="Loja de Equipamentos"
          description="Compare melhorias, acompanhe a rotação mensal e invista apenas no que combina com sua evolução."
          tone="premium"
          breadcrumb={['Desenvolvimento', 'Loja']}
          action={<>
            <div className="inline-flex items-center gap-2 rounded-xl border border-premium/25 bg-premium/10 px-3 py-2 text-sm font-black text-premium"><Coins className="h-4 w-4" />{Number(profile?.coins || 0).toLocaleString('pt-BR')}</div>
            <Link to="/game/inventory" className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/50 px-3 py-2 text-xs font-extrabold text-muted-foreground transition hover:text-foreground"><Package className="h-4 w-4" />Inventário</Link>
          </>}
          stats={[
            <StatusBadge key="rotation" tone="premium">Rotação mensal</StatusBadge>,
            <StatusBadge key="catalog" tone="info">{items.length} itens no catálogo</StatusBadge>,
          ]}
        />

        <CardGrid columns={4}>
          <StatCard label="Disponíveis agora" value={progressionStats.marketAvailable} detail="rotação atual" icon={ShoppingBag} tone="premium" />
          <StatCard label="Liberados" value={progressionStats.unlocked} detail="para sua carreira" icon={Check} tone="success" />
          <StatCard label="Acessíveis" value={progressionStats.affordable} detail="cabem no orçamento" icon={Coins} tone="warning" />
          <StatCard label="Bloqueados" value={progressionStats.locked} detail="objetivos futuros" icon={Lock} tone="neutral" />
        </CardGrid>

      {/* Live Market Events Banner */}
      {marketEvents.length > 0 && (
        <MarketEventsBanner events={marketEvents} careerDate={profile?.career_date} />
      )}

      {/* View toggle — separa claramente Loja de Equipados (seção 23) */}
      <Tabs
        tabs={[
          { key: 'shop', label: 'Loja', icon: ShoppingBag },
          { key: 'equipped', label: 'Equipados', icon: Check, count: equippedItems.length },
        ]}
        activeTab={view}
        onTabChange={setView}
      />

      {view === 'equipped' ? (
        <EquippedView equippedItems={equippedItems} items={items} />
      ) : (
        <>
          {/* Search + filters toggle */}
          <Surface padding="compact" className="flex gap-2">
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
          </Surface>

          {/* Category filter — M4.2.2: FilterPills compartilhado (shrink-0 real), não mais uma faixa própria sem proteção contra compressão */}
          <FilterPills filters={CATEGORIES} activeFilter={category} onFilterChange={setCategory} />

          {/* Advanced filters */}
          {showFilters && (
            <Surface className="space-y-3 animate-slide-up">
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
                  <option value="market" className="bg-card">Disponíveis neste mês</option>
                  <option value="all" className="bg-card">Catálogo completo</option>
                  <option value="not_owned" className="bg-card">Ainda não adquiridos</option>
                  <option value="owned" className="bg-card">Já adquiridos</option>
                  <option value="affordable" className="bg-card">Posso comprar agora</option>
                  <option value="unlocked" className="bg-card">Liberados para minha carreira</option>
                  <option value="locked" className="bg-card">Bloqueados / objetivos futuros</option>
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
            </Surface>
          )}

          {/* Results count */}
          <p className="text-xs text-muted-foreground px-1">
            {filtered.length} {filtered.length === 1 ? 'item encontrado' : 'itens encontrados'}
          </p>

          {/* Items grid */}
          {filtered.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Nenhum equipamento encontrado" description="Altere os filtros ou consulte o catálogo completo para encontrar outras opções." />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 animate-stagger">
                {paged.map(item => {
                  const cat = CATEGORY_META[item.category] || CATEGORY_META.acessorio;
                  const rarityStyle = RARITY_STYLES[item.rarity] || RARITY_STYLES.comum;
                  const owned = ownedIds.has(item.id);
                  const pricing = priceMap[item.id];
                  const currentPrice = safePrice(pricing?.currentPrice, safePrice(item?.price));
                  const access = accessMap[item.id] || getShopItemAccess(profile, item);
                  const canAfford = access.unlocked && (profile?.coins || 0) >= currentPrice;
                  const hist = priceHistories.find(h => h.item_id === item.id);
                  const isLimited = hist?.is_limited_stock && hist?.stock_remaining >= 0;
                  const stockLeft = hist?.stock_remaining || 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      className={`glass rounded-2xl p-3 flex flex-col gap-2 text-left bg-gradient-to-br ${rarityStyle.card} hover:border-primary/40 hover:scale-[1.02] transition-all press-scale relative overflow-hidden ${!access.unlocked ? 'opacity-75' : ''}`}
                    >
                      {!access.unlocked && (
                        <span className="absolute inset-x-2 bottom-2 z-20 rounded-lg bg-background/90 border border-border px-2 py-1.5 text-[8px] font-bold text-muted-foreground flex items-center gap-1">
                          <Lock className="h-3 w-3" /> {access.reasons[0]}
                        </span>
                      )}
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
                <Button level="ghost" onClick={() => setPage(p => p + 1)} className="w-full">
                  Carregar mais ({filtered.length - paged.length} restantes)
                </Button>
              )}
            </>
          )}
        </>
      )}

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          owned={ownedIds.has(detailItem.id)}
          access={accessMap[detailItem.id] || getShopItemAccess(profile, detailItem)}
          canAfford={(accessMap[detailItem.id]?.unlocked ?? false) && (profile?.coins || 0) >= safePrice(priceMap[detailItem.id]?.currentPrice, safePrice(detailItem.price))}
          buying={buying === detailItem.id}
          onBuy={() => buy(detailItem)}
          onClose={() => setDetailItem(null)}
          pricing={priceMap[detailItem.id]}
          currentEquipped={currentEquippedFor(detailItem)}
        />
      )}
      </PageContent>
    </Page>
  );
}
