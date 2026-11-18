import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Activity, ArrowDownLeft, ArrowDownUp, ArrowUpRight, BarChart3, Blocks, ChevronDown, ChevronLeft, ChevronRight, Code2, Coins, FileCode2, Fuel, Globe, Layers3, Menu, Moon, Network, Search, ShieldCheck, Sun, Monitor, WalletCards, X, type LucideIcon } from "lucide-react";
import { ExplorerLink } from "./ExplorerLink";
import { basePath } from "./network";
import { readStartupSearch } from './startup-search';

type Link = { path: string; label: string; icon: LucideIcon; views?: string[] };
const groups: { id: string; label: string; icon: LucideIcon; links: Link[] }[] = [
  { id: "chain", label: "Blockchain", icon: Network, links: [
    { path: "/txs", label: "transactions", icon: ArrowDownUp, views: ["transactions", "transaction"] },
    { path: "/internal-txs", label: "Internal transactions", icon: Layers3 },
    { path: "/deposits", label: "L1 → L2 deposits", icon: ArrowDownLeft },
    { path: "/withdrawals", label: "L2 → L1 withdrawals", icon: ArrowUpRight },
    { path: "/blocks", label: "blocks", icon: Blocks, views: ["blocks", "block"] },
    { path: "/batches", label: "Transaction batches", icon: Layers3 },
    { path: "/dispute-games", label: "Dispute games", icon: ShieldCheck },
    { path: "/ops", label: "User operations", icon: Activity },
    { path: "/accounts", label: "Top accounts", icon: WalletCards },
    { path: "/contracts", label: "contracts", icon: FileCode2 },
    { path: "/name-services", label: "Name services", icon: Search },
  ] },
  { id: "tokens", label: "tokens", icon: Coins, links: [
    { path: "/tokens", label: "tokens", icon: Coins, views: ["tokens", "token", "nft"] },
    { path: "/token-transfers", label: "Token transfers", icon: ArrowDownUp },
    { path: "/pools", label: "DEX tracker", icon: Layers3, views: ["pools", "pool"] },
  ] },
  { id: "stats", label: "Charts & stats", icon: BarChart3, links: [
    { path: "/analytics", label: "Chain stats", icon: BarChart3, views: ["stats", "analytics"] },
    { path: "/gas-tracker", label: "Gas tracker", icon: Fuel },
    { path: "/network", label: "network", icon: Activity },
  ] },
];
const directLinks: Link[] = [
  { path: "/apps", label: "Dapps", icon: Globe },
  { path: "/developers", label: "API", icon: Code2 },
];

export function ThemeControl({ t }: { t: (key: string) => string }) {
  const [theme, setTheme] = useState(() => {
    try { const value=localStorage.getItem("ink-theme"); return value && ["system","light","dark"].includes(value) ? value : "system"; } catch { return "system"; }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0f0f0f" : "#fafafa");
    };
    apply(); media.addEventListener("change", apply);
    try { localStorage.setItem("ink-theme", theme); } catch { /* Optional persistence. */ }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(()=>{const sync=(event:Event)=>{const value=(event as CustomEvent).detail; if(["system","light","dark"].includes(value))setTheme(value);};window.addEventListener("ink-theme-change",sync);return()=>window.removeEventListener("ink-theme-change",sync);},[]);
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return <label className="theme-control"><Icon size={18} aria-hidden="true" /><span className="sr-only">{t("Appearance")}</span><select aria-label={t("Appearance")} value={theme} onChange={e => {
    // The visible control can receive input before its passive sync effect.
    // Apply its own selection immediately; the event also updates other menus.
    const value=e.target.value;setTheme(value);
    window.dispatchEvent(new CustomEvent("ink-theme-change",{detail:value}));
  }}><option value="system">{t("System theme")}</option><option value="light">{t("Light theme")}</option><option value="dark">{t("Dark theme")}</option></select></label>;
}

export function Navigation({ current, t, brand, search, preferences, market, status }: {
  current: string; t: (key: string) => string; brand: ReactNode; search: ReactNode; preferences: ReactNode; market: ReactNode; status: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false), [section, setSection] = useState<string | null>(null), [dropdown, setDropdown] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null), headerRef = useRef<HTMLElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const restoreDrawerFocus = useRef(true);
  const previousDrawerSection = useRef<string | null>(null);
  const [narrow,setNarrow]=useState(()=>matchMedia('(max-width:760px)').matches);
  const [mobileSearch,setMobileSearch]=useState(() => Boolean(readStartupSearch()?.expanded)),searchTrigger=useRef<HTMLButtonElement>(null);
  const searchOrigin=useRef<{x:number;y:number;focus:HTMLElement|null}|null>(null);
  const persistentSearch=current==='home'||current==='search';
  const focusSearch=()=>{
    if(headerRef.current?.inert)return;
    if(!headerRef.current?.querySelector<HTMLElement>('.header-search-field')?.getClientRects().length){
      searchOrigin.current={x:scrollX,y:scrollY,focus:document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:null};
    }
    // Reveal synchronously so a touch still opens the native software keyboard.
    flushSync(()=>setMobileSearch(true));
    headerRef.current?.querySelector<HTMLInputElement>('.global-search input')?.focus();
  };
  const closeSearch=()=>{
    const origin=searchOrigin.current;searchOrigin.current=null;
    flushSync(()=>setMobileSearch(false));
    const focus=origin?.focus?.isConnected&&!origin.focus.closest('[hidden],[inert]')?origin.focus:searchTrigger.current;
    focus?.focus({preventScroll:true});
    if(origin)scrollTo({left:origin.x,top:origin.y,behavior:'instant'});
  };
  useEffect(()=>{
    const media=matchMedia('(max-width:760px)');
    const resize=()=>{
      if(media.matches&&headerRef.current?.querySelector('.global-search')?.contains(document.activeElement))setMobileSearch(true);
      setNarrow(media.matches);
    };
    media.addEventListener('change',resize);
    window.addEventListener('focus-global-search',focusSearch);
    let url=location.href;
    const navigate=(event:PopStateEvent)=>{
      // Explicit in-app navigation also closes a search for the current URL.
      // Native restoration of the same document preserves its saved search UI.
      if(url!==location.href||!event.isTrusted){setMobileSearch(false);searchOrigin.current=null;}
      url=location.href;
    };
    window.addEventListener('popstate',navigate);
    return()=>{media.removeEventListener('change',resize);window.removeEventListener('focus-global-search',focusSearch);window.removeEventListener('popstate',navigate);};
  },[]);
  useEffect(()=>{
    if(!narrow||persistentSearch||!mobileSearch)return;
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&headerRef.current?.querySelector('.header-search-field')?.contains(document.activeElement)){
        event.preventDefault();closeSearch();
      }
    };
    document.addEventListener('keydown',escape);
    return()=>document.removeEventListener('keydown',escape);
  },[narrow,persistentSearch,mobileSearch]);
  const close = (restoreFocus = true) => {
    restoreDrawerFocus.current = restoreFocus;
    setDrawer(false); setSection(null); setDropdown(null);
  };
  const selected = (link: Link) => (link.views || [link.path.slice(1)]).includes(current);
  useEffect(() => { close(false); }, [current]);
  useEffect(() => {
    if (!dropdown) return;
    const trigger = headerRef.current?.querySelector<HTMLButtonElement>(`[data-group="${dropdown}"]`);
    const group = trigger?.closest(".nav-group");
    const dismissOutside = (event: FocusEvent | PointerEvent) => {
      if (!group?.contains(event.target as Node)) setDropdown(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && group?.contains(event.target as Node)) {
        setDropdown(null);
        trigger?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [dropdown]);
  useLayoutEffect(() => {
    if (!drawer) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const others = [document.querySelector("main"), document.querySelector("footer"), headerRef.current, document.querySelector(".utility-bar")].filter(Boolean) as HTMLElement[];
    const wasInert = others.map(el => el.inert); others.forEach(el => { el.inert = true; });
    drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key !== "Tab") return;
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button, a[href], select, input, [tabindex="0"]') || []).filter(el => el.getClientRects().length && !el.hasAttribute("disabled"));
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    const resize = () => { if (innerWidth >= 1180) close(false); };
    document.addEventListener("keydown", key); window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = oldOverflow;
      others.forEach((el,i) => { el.inert = wasInert[i]; });
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
      const focusTarget = restoreDrawerFocus.current ? triggerRef.current : document.getElementById('main-content');
      focusTarget?.focus({preventScroll:true});
    };
  }, [drawer]);
  useLayoutEffect(() => {
    // The category buttons remount on Back. Restore the one that opened the
    // section during this commit, before a subsequent Tab or Enter can race it.
    const origin = previousDrawerSection.current;
    previousDrawerSection.current = section;
    const selector = section ? ".drawer-back" : origin && `[data-drawer-category="${origin}"]`;
    if (selector) drawerRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
  }, [section]);
  const chooseSection = (id: string | null) => setSection(id);
  const group = groups.find(item => item.id === section);
  const renderLink = (link: Link, showIcon = true) => {
    const active = selected(link);
    const exactPath = location.pathname.replace(/\/$/, "") === basePath + link.path;
    const sectionStart = ["/blocks", "/ops"].includes(link.path);
    return (
      <ExplorerLink key={link.path} to={link.path} aria-current={active ? (exactPath ? "page" : "location") : undefined}
        className={[active && "active", sectionStart && "nav-section-start"].filter(Boolean).join(" ")}
        onNavigate={() => close(false)}>
        {showIcon && <link.icon size={21} aria-hidden="true" />}<span>{t(link.label)}</span>
      </ExplorerLink>
    );
  };
  return <>
    <div className="utility-bar" role="region" aria-label={t("network")}><div className="utility-market">{market}</div><div className="utility-settings">{status}{preferences}<ThemeControl t={t} /></div></div>
    <header className="app-header" ref={headerRef}>
      <button ref={triggerRef} className="drawer-trigger icon-button" aria-label={t("menu")} aria-expanded={drawer} aria-controls="mobile-navigation" onClick={() => { setDrawer(true); setDropdown(null); setMobileSearch(false); }}><Menu aria-hidden="true" /></button>
      {brand}
      <nav className="desktop-navigation" aria-label={t("primaryNavigation")}>
        {groups.map(item => <div className="nav-group" key={item.id}><button data-group={item.id} className={item.links.some(selected) ? "active" : ""} aria-expanded={dropdown === item.id} aria-controls={`nav-${item.id}`} onClick={() => setDropdown(dropdown === item.id ? null : item.id)}>{t(item.label)}<ChevronDown size={14} /></button>{dropdown === item.id && <div id={`nav-${item.id}`} className="nav-popover">{item.links.map(link => renderLink(link))}</div>}</div>)}
        {directLinks.map(link => renderLink(link, false))}
      </nav>
      {!persistentSearch&&<button ref={searchTrigger} className="mobile-search-trigger icon-button" type="button" aria-label={t(mobileSearch?'Close search':'search')} data-open-label={t('search')} data-close-label={t('Close search')} aria-expanded={mobileSearch} aria-controls="header-search" onClick={()=>mobileSearch?closeSearch():focusSearch()}><X className="search-close-icon" aria-hidden="true"/><Search className="search-open-icon" aria-hidden="true"/></button>}
      <div id="header-search" className="header-search-field" data-collapsible={!persistentSearch} data-open={mobileSearch}>{search}</div>
    </header>
    {drawer && <div className="drawer-layer"><div className="drawer-scrim" onClick={() => close()} /><div ref={drawerRef} id="mobile-navigation" className="mobile-drawer" role="dialog" aria-modal="true" aria-label={t("primaryNavigation")}>
      <div className="drawer-heading" onClick={event => {
        if (!(event.target instanceof Element) || !event.target.closest('.brand') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        close(false);
      }}>{brand}<button className="icon-button" aria-label={t("Close")} onClick={() => close()}><X /></button></div>
      <nav aria-label={t("primaryNavigation")}>
        {group ? <><button className="drawer-back" onClick={() => chooseSection(null)}><ChevronLeft size={22}/>{t(group.label)}</button><div className="drawer-links">{group.links.map(link => renderLink(link))}</div></> : <div className="drawer-links">{groups.map(item => <button key={item.id} data-drawer-category={item.id} className={`drawer-category${item.links.some(selected) ? " active" : ""}`} onClick={() => chooseSection(item.id)}><item.icon size={25}/><span>{t(item.label)}</span><ChevronRight size={18}/></button>)}{directLinks.map(link => renderLink(link))}</div>}
      </nav><div className="drawer-preferences">{preferences}<ThemeControl t={t}/></div>
    </div></div>}
  </>;
}
