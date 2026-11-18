// Only fixed directory/tool routes are captured. Chain records never enter a build.
export const initialPageRoutes = [
  '/blocks', '/txs', '/tokens', '/pools', '/contracts', '/analytics',
  '/advanced', '/developers', '/network', '/accounts', '/internal-txs',
  '/token-transfers', '/deposits', '/withdrawals', '/batches', '/dispute-games',
  '/ops', '/name-services', '/gas-tracker', '/apps', '/contract-verification',
  '/public-tags/submit', '/approvals', '/stats',
];
export const initialPageKey = route => route.slice(1).replaceAll('/', '-');
export function initialPageSnapshot(url, network, language) {
  if (!initialPageRoutes.includes(url.pathname)) return null;
  return {
    path: `/snapshots/pages/${initialPageKey(url.pathname)}-${network}-${language}.json`,
    // Do not briefly present the default controls for a filtered URL.
    neutral: [...url.searchParams.keys()].some(key => key !== 'lang'),
  };
}

export function pageSnapshotContent(snapshot, route, network, language, neutral) {
  if (snapshot?.route !== route || snapshot.network !== network || snapshot.language !== language
    || typeof snapshot.html !== 'string' || typeof snapshot.neutralHtml !== 'string'
    || !Array.isArray(snapshot.styles)) return;
  return { initialContent: neutral ? snapshot.neutralHtml : snapshot.html, initialStyles: snapshot.styles };
}
