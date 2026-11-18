import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { API, network } from "./network";
import {seoDescriptions} from "./seo-descriptions";
import { readApps, APPS_LIST_ENDPOINT } from "./apps-resource";
import type { Locale } from "./i18n";

type Row = Record<string, any>;
export type ExplorerPageProps = {
  live?: { connected: boolean; polling?: boolean; network?: Row; blocks?: Row[]; utilization?: Row; block?: Row; transactions?: Row[]; sequence: number };
  page: string;
  locale: Locale;
  id?: string;
  t: (key: string) => string;
  go: (path: string) => void;
  get: (path: string, signal?: AbortSignal) => Promise<any>;
  identity: (value: string, link?: string, label?: string) => ReactNode;
  transaction: (item: Row) => ReactNode;
  block: (item: Row) => ReactNode;
  chart: (metric: string, title: string, unit?: string, resolutions?: string[]) => ReactNode;
  historyChart?: (items: Row[]) => ReactNode;
  activity: (item: Row, type: string) => ReactNode;
};


export const integer = (value: any) => {
  try {
    return value == null
      ? "—"
      : BigInt(value).toLocaleString(document.documentElement.lang);
  } catch {
    return "—";
  }
};
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="explorer-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function useData(props: ExplorerPageProps, endpoint: string, refresh = 0) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    (endpoint === "/dapps" || endpoint === APPS_LIST_ENDPOINT
      ? readApps(API, props.get, controller.signal, endpoint)
      : props.get(endpoint, controller.signal))
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [endpoint, refresh, retry]);
  return { data, error, retry: () => setRetry((v) => v + 1) };
}

export function State({
  data,
  error,
  retry,
  t,
  children,
}: {
  data: any;
  error: string;
  retry: () => void;
  t: ExplorerPageProps["t"];
  children: ReactNode;
}) {
  if (error)
    return (
      <div className="error-state" role="alert">
        <div>
          <strong>{t("unavailable")}</strong>
          <p>{error}</p>
          <button onClick={retry}>
            <RefreshCw size={16} /> {t("retry")}
          </button>
        </div>
      </div>
    );
  if (data === undefined)
    return (
      <div className="loading" role="status">
        <i />
        <span>{t("readingChain")}</span>
      </div>
    );
  return <>{children}</>;
}

export function Page({
  title,
  props,
  children,
}: {
  title: string;
  props: ExplorerPageProps;
  children: ReactNode;
}) {
  return (
    <div className="explorer-page">
      <section className="page-intro">
        <div>
          <span>{network.name}</span>
          <h1>{props.t(title)}</h1>
          {!props.id&&seoDescriptions['/'+props.page]&&<p className="page-summary">{props.t(seoDescriptions['/'+props.page]).replaceAll('Ink Mainnet', network.name)}</p>}
        </div>
      </section>
      {children}
    </div>
  );
}
