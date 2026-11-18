import { memo, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ExplorerLink } from "./ExplorerLink";
import { Field, Page, type ExplorerPageProps } from "./ExplorerPageShell";
import { ResultCountStatus } from "./ResultCountStatus";
import { isTestnet } from "./network";
import { ecosystemAppId } from "./ink-ecosystem-route";
import catalogue from "./ink-ecosystem.json";
import summariesFr from "./ink-ecosystem-fr.json";

type InkApp = typeof catalogue[number];
type Translate = ExplorerPageProps["t"];
const frenchSummaries: Readonly<Record<string, string>> = summariesFr;
const officialCatalogue = "https://inkonchain.com/apps";
const apps = catalogue
  .filter(app => !isTestnet || app.network === "Both")
  .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
const categories = [...new Set(apps.flatMap(app => app.category))].sort();
const maxSearchLength = 256;
const reloadDraftKey = "ink-explorer-catalogue-reload";
const catalogueEntryKey = "inkExplorerCatalogueEntry";
const draftLifetime = 5 * 60_000;

function readCatalogueFilters() {
  const params = new URLSearchParams(location.search);
  const category = params.get("category") || "";
  return {
    q: (params.get("q") || "").slice(0, maxSearchLength),
    category: categories.includes(category) ? category : "",
  };
}

const listPath = /^(?:\/testnet)?\/apps\/?$/;

function currentEntryId(): string | undefined {
  const id = history.state?.[catalogueEntryKey];
  return typeof id === "string" && id ? id : undefined;
}

function markCatalogueEntry() {
  const state = history.state;
  if (currentEntryId() || (state != null && Object.getPrototypeOf(state) !== Object.prototype)) return;
  try {
    const id = crypto.getRandomValues(new Uint32Array(4)).join("-");
    history.replaceState({...state, [catalogueEntryKey]: id}, "");
  } catch {
    // A restricted browser can still filter without an entry-specific reload draft.
  }
}

function takeReloadedQuery() {
  try {
    const saved = sessionStorage.getItem(reloadDraftKey);
    if (saved === null) return;
    sessionStorage.removeItem(reloadDraftKey);
    const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    // A later SPA visit can share a document originally loaded with Reload.
    // The resource URL excludes fragments in some browsers.
    if (navigation?.type !== "reload" || navigation.name.split("#")[0] !== location.href.split("#")[0]) return;
    const draft = JSON.parse(saved);
    const entry = currentEntryId();
    if (!entry || draft?.entry !== entry || draft.href !== location.href
      || typeof draft.q !== "string" || typeof draft.savedAt !== "number") return;
    const age = Date.now() - draft.savedAt;
    if (age >= 0 && age <= draftLifetime) return draft.q.slice(0, maxSearchLength);
  } catch {
    // With storage disabled or a damaged draft, the URL supplies the filters.
  }
}

function useCatalogueFilters(id?: string) {
  const [filters, setFilters] = useState(readCatalogueFilters);
  const pending = useRef<typeof filters | null>(null);
  const timer = useRef<number>(undefined);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next || !listPath.test(location.pathname)) return;
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, []);

  useLayoutEffect(() => {
    if (id) return;
    const query = takeReloadedQuery();
    if (query !== undefined) {
      const restored = {...readCatalogueFilters(), q: query};
      pending.current = restored;
      flush();
      setFilters(restored);
    }
    const restore = () => {
      window.clearTimeout(timer.current);
      pending.current = null;
      if (listPath.test(location.pathname)) setFilters(readCatalogueFilters());
    };
    let departingForAnotherDocument = false;
    const trackNavigation = (event: NavigateEvent) => {
      if (event.navigationType === "reload" || !event.destination.sameDocument) {
        departingForAnotherDocument = event.navigationType !== "reload";
      }
    };
    const beforeHide = (event: PageTransitionEvent) => {
      if (!pending.current || !listPath.test(location.pathname)) return;
      // Reload can already have captured the URL before replaceState runs.
      // A cached document keeps its own state when Back restores it.
      const entry = currentEntryId();
      if (!event.persisted && !departingForAnotherDocument && entry) {
        try {
          sessionStorage.setItem(reloadDraftKey, JSON.stringify({
            entry, href: location.href, q: pending.current.q, savedAt: Date.now(),
          }));
          // WebKit can discard the entry state if its URL changes during reload.
          // The matching document will commit the query after reading the draft.
          window.clearTimeout(timer.current);
          return;
        } catch { /* Keep the normal URL update if the tab cannot store a draft. */ }
      }
      flush();
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("pagehide", beforeHide);
    window.navigation?.addEventListener("navigate", trackNavigation);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pagehide", beforeHide);
      window.navigation?.removeEventListener("navigate", trackNavigation);
    };
  }, [id, flush]);

  function changeFilter(key: keyof typeof filters, value: string) {
    // Mark the entry before a reload can capture it, once for the whole editing session.
    markCatalogueEntry();
    const next = {...(pending.current ?? filters), [key]: value};
    pending.current = next;
    setFilters(next);
    window.clearTimeout(timer.current);
    // WebKit shares a rate limit between replaceState and navigation pushes.
    if (key === "q") timer.current = window.setTimeout(flush, 250);
    else flush();
  }
  return {filters, changeFilter, flush};
}

const appLinks = [
  ["x", "X"], ["discord", "Discord"], ["telegram", "Telegram"],
  ["github", "GitHub"], ["farcaster", "Farcaster"], ["smartContractUrl", "Smart contract"],
] as const;

function searchText(value: string) {
  // Fold Latin accents for search. Other scripts use combining marks to distinguish letters.
  return value.normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLowerCase();
}

function safeLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    // A malformed catalogue link remains unavailable.
  }
}

function AppLink({ url, children, label }: { url?: string; children: string; label?: string }) {
  const href = safeLink(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {children} <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  );
}

function AppLogo({ app }: { app: InkApp }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="ecosystem-logo" aria-hidden="true">
      {failed ? (
        app.name.slice(0, 1).toUpperCase()
      ) : (
        <img
          src={app.imageUrl}
          alt=""
          width="48"
          height="48"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

const EcosystemCard = memo(function EcosystemCard({ app, t, locale }: { app: InkApp; t: Translate; locale: ExplorerPageProps["locale"] }) {
  const summary = locale === "fr" ? frenchSummaries[app.id] : undefined;
  const destination = isTestnet ? app.links.testnetWebsite : app.links.mainnetWebsite;
  return (
    <article className="explorer-app ecosystem-card">
      <div className="ecosystem-card-heading">
        <AppLogo app={app} />
        <div>
          <h2>
            <ExplorerLink className="text-link" to={`/apps/${ecosystemAppId(app.id)}`}>
              {app.name}
            </ExplorerLink>
          </h2>
          <p className="ecosystem-categories">{app.category.map(t).join(" · ")}</p>
        </div>
      </div>
      <p lang={summary ? "fr" : "en"} dir="auto">{summary ?? app.description}</p>
      <div className="ecosystem-card-actions">
        <AppLink url={destination} label={`${t("Open app")} · ${app.name}`}>{t("Open app")}</AppLink>
        {app.pills?.includes("POINTS") && <span className="ecosystem-points">{t("Points")}</span>}
      </div>
    </article>
  );
});

export function InkEcosystem(props: ExplorerPageProps) {
  const { id, t } = props;
  const french = props.locale === "fr";
  const {filters: {q: search, category}, changeFilter, flush} = useCatalogueFilters(id);
  const sourceHeading = useId();
  if (id) {
    const app = apps.find(app => ecosystemAppId(app.id) === id);
    const summary = app && french ? frenchSummaries[app.id] : undefined;
    return (
      <Page title={app?.name ?? "Ink ecosystem"} props={props}>
        <ExplorerLink className="text-link ecosystem-back" to="/apps">{t("All applications")}</ExplorerLink>
        {app ? (
          <div className="explorer-app ecosystem-detail">
            <div className="ecosystem-card-heading">
              <AppLogo app={app} />
              <p lang={summary ? "fr" : "en"} dir="auto">{summary ?? app.description}</p>
            </div>
            <dl>
              <Field label={t("Category")}>{app.category.map(t).join(" · ")}</Field>
              {app.tags.length > 0 && <Field label={t("Tags")}><bdi lang="en">{app.tags.join(" · ")}</bdi></Field>}
              <Field label={t("network")}>{app.network === "Both" ? "Ink Mainnet · Ink Sepolia" : "Ink Mainnet"}</Field>
              {app.pills?.includes("POINTS") && <Field label={t("Rewards")}>{t("Points")}</Field>}
            </dl>
            <div className="ecosystem-links" aria-labelledby={sourceHeading}>
              <h2 id={sourceHeading}>{t("Application links")}</h2>
              <div className="ecosystem-link-list">
                <AppLink url={isTestnet ? app.links.testnetWebsite : app.links.mainnetWebsite}>{t("Open app")}</AppLink>
                {appLinks.map(([key, label]) => <AppLink key={key} url={app.links[key]}>{t(label)}</AppLink>)}
              </div>
            </div>
          </div>
        ) : <div className="empty">{t("noRecords")}</div>}
        <div className="ecosystem-source"><AppLink url={officialCatalogue}>{t("Official Ink directory")}</AppLink></div>
      </Page>
    );
  }
  const term = searchText(search.trim());
  const items = apps.filter(app =>
    (!category || app.category.includes(category)) &&
    [app.name, app.description, french ? frenchSummaries[app.id] ?? "" : "", ...app.category, ...app.category.map(t), ...app.tags].some(value => searchText(value).includes(term)),
  );
  return (
    <Page title="Ink ecosystem" props={props}>
      <div className="ecosystem-controls">
        <div className="explorer-search">
          <label>
            {t("Find an application")}
            <input type="search" maxLength={maxSearchLength} value={search} onBlur={flush} onChange={event => changeFilter("q", event.target.value)} />
          </label>
          <label>
            {t("Category")}
            <select value={category} onChange={event => changeFilter("category", event.target.value)}>
              <option value="">{t("All categories")}</option>
              {categories.map(value => <option key={value} value={value}>{t(value)}</option>)}
            </select>
          </label>
        </div>
        <div className="ecosystem-source"><AppLink url={officialCatalogue}>{t("Official Ink directory")}</AppLink></div>
      </div>
      <ResultCountStatus count={items.length} t={t} />
      {items.length ? (
        <div className="explorer-app-grid ecosystem-grid" onClickCapture={flush}>
          {items.map(app => <EcosystemCard key={app.id} app={app} t={t} locale={props.locale} />)}
        </div>
      ) : <div className="empty">{t("noRecords")}</div>}
    </Page>
  );
}
