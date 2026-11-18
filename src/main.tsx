import React from "react";
import ReactDOM from "react-dom/client";
import {flushSync} from "react-dom";
import App from "./App";
import {afterStartupComposition,captureStartupSearch} from "./startup-search";
import {loadLocale,isLocale} from "./i18n-browser";
import {savedLanguage} from "./browser-preferences";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./fonts.css";
import "./styles.css";
import "./contracts.css";
import "./mobile.css";
import "./details.css";
import "./platform.css";
import "./redesign.css";
import "./polish.css";
import "./ledger.css";
import "./chart-lifecycle.css";
import "./placement.css";
import "./ledger-placement.css";
import "./text-layout.css";
import "./pool-freshness.css";
import "./nft-detail.css";
import "./footer.css";
import "./select-controls.css";
import "./mobile-ledger-cards.css";
import "./transfer-loading.css";
import "./ledger-skeleton.css";
import "./touch-tablet-type.css";
import "./gauge-clarity.css";
import "./api-code-mobile.css";
import "./home-guide.css";
import "./rolling-count.css";
import "./initial-page.css";

const requested=[new URLSearchParams(location.search).get("lang"),savedLanguage(),navigator.language?.split("-")[0]].find(isLocale) || "en";
const render=()=>{
  // The saved/browser language can differ from the server document language.
  // Set its direction before the first React paint, not after layout effects.
  document.documentElement.lang=requested;
  document.documentElement.dir=requested==='ar'?'rtl':'ltr';
  const root = document.getElementById("root")!;
  afterStartupComposition(root, () => {
    captureStartupSearch(root);
    // Commit in the same task as the composition check, so a new composition
    // cannot begin between the snapshot and the replacement of the input.
    flushSync(() => ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>));
    delete root.dataset.startupReady;
  });
};
loadLocale(requested).then(render).catch(()=>{document.documentElement.dataset.localeFallback="true";render();});
