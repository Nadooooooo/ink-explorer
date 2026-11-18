type Props = { kind: "blocks" | "transactions" | "records"; label: string };

// The placeholders preserve the shape and height of ledger rows while their
// source is pending. They never stand in for real counts or values.
export default function LedgerSkeleton({ kind, label }: Props) {
  return <div className={`ledger-skeleton ledger-skeleton-${kind}`} role="status" aria-label={label}>
    {Array.from({ length: 10 }, (_, index) => <div className="ledger-skeleton-row" aria-hidden="true" key={index}>
      <div className="ledger-skeleton-top"><span className="ledger-skeleton-mark"/><span className="ledger-skeleton-line hash"/><span className="ledger-skeleton-line count"/></div>
      <span className="ledger-skeleton-line age"/>
      <div className="ledger-skeleton-middle"><span className="ledger-skeleton-line identity"/><span className="ledger-skeleton-line method"/></div>
      <div className="ledger-skeleton-bottom"><span className="ledger-skeleton-line address"/><span className="ledger-skeleton-line address"/></div>
      <div className="ledger-skeleton-totals"><span className="ledger-skeleton-line value"/><span className="ledger-skeleton-line fee"/></div>
    </div>)}
  </div>;
}
