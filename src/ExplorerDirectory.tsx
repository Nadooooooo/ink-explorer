import { ExplorerLink } from "./ExplorerLink";

export const explorerDestinations = [
  ["/tokens", "tokens"],
  ["/contracts", "contracts"],
  ["/network", "network"],
  ["/approvals", "approvalsTitle"],
  ["/accounts", "Top accounts"],
  ["/internal-txs", "Internal transactions"],
  ["/token-transfers", "Token transfers"],
  ["/deposits", "L1 → L2 deposits"],
  ["/withdrawals", "L2 → L1 withdrawals"],
  ["/batches", "Transaction batches"],
  ["/dispute-games", "Dispute games"],
  ["/ops", "User operations"],
  ["/name-services", "Name services"],
  ["/gas-tracker", "Gas tracker"],
  ["/apps", "Dapps"],
  ["/analytics", "All statistics"],
  ["/contract-verification", "Verify contract"],
  ["/public-tags/submit", "Submit public tag"],
] as const;

export function ExplorerDirectory({
  t,
}: { t: (key: string) => string }) {
  return (
    <nav className="explorer-directory" aria-label={t("Explorer tools")}>
      {explorerDestinations.map(([path, label]) => (
        <ExplorerLink key={path} to={path}>
          {t(label)}
        </ExplorerLink>
      ))}
    </nav>
  );
}
