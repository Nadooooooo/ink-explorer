import { ExplorerLink } from "./ExplorerLink";
import { externalDestination } from "./network";
import { Page, State, Field, useData, integer, type ExplorerPageProps } from "./ExplorerPageShell";
import { InkEcosystem } from "./InkEcosystem";
import { isEcosystemAppId } from "./ink-ecosystem-route";

type LegacyApp = {
  id: string;
  title: string;
  description?: string;
  categories?: string[];
  author?: string;
  rating?: number;
  ratingsTotalCount?: number;
  url?: string;
};

export default function Apps(props: ExplorerPageProps) {
  if (!props.id || isEcosystemAppId(props.id)) return <InkEcosystem {...props} />;
  return <LegacyAppDetail {...props} />;
}

// Keep existing Blockscout marketplace links working alongside the Ink directory.
function LegacyAppDetail(props: ExplorerPageProps) {
  const state = useData(props, "/dapps");
  const items: LegacyApp[] = Array.isArray(state.data) ? state.data : [];
  const item = items.find(item => item.id === props.id);
  const url = externalDestination(item?.url);
  return (
    <Page title="Dapps" props={props}>
      <State {...state} t={props.t}>
        <ExplorerLink className="text-link ecosystem-back" to="/apps">{props.t("All applications")}</ExplorerLink>
        {item ? (
          <article className="explorer-app">
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <p>{item.categories?.join(" · ")}</p>
            <dl>
              <Field label={props.t("Author")}>{item.author || "—"}</Field>
              <Field label={props.t("Rating")}>
                {item.rating == null ? "—" : `${item.rating}/5 (${integer(item.ratingsTotalCount)})`}
              </Field>
            </dl>
            {url && <a href={url} target="_blank" rel="noreferrer">{props.t("Open app")} ↗</a>}
          </article>
        ) : <div className="empty">{props.t("noRecords")}</div>}
      </State>
    </Page>
  );
}
