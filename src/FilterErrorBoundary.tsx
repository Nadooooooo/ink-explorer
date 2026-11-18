import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

/** A missing optional filter module must leave the ledger and navigation usable. */
export class FilterErrorBoundary extends Component<{ children: ReactNode; t: (key: string) => string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Transaction filters unavailable", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t } = this.props;
    return <div className="transaction-filter-bar" role="alert">
      <div className="transaction-filter-actions">
        <span>{t("advancedFilters")}: {t("unavailable")}</span>
        <button type="button" onClick={() => location.reload()}><RefreshCw size={18} aria-hidden="true"/>{t("retry")}</button>
      </div>
    </div>;
  }
}
