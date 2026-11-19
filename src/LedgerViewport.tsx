import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { focusPrimaryPagination, usePaginationFocus } from "./pagination-focus";

export function LedgerPager({ newest, previous, older, onNewest, onPrevious, onOlder, t, bottom = false, pending = false }: { newest: boolean; previous: boolean; older: boolean; onNewest: () => void; onPrevious: () => void; onOlder: () => void; t: (key: string) => string; bottom?: boolean; pending?: boolean }) {
  const Root = bottom ? "div" : "nav";
  const navigationRef = usePaginationFocus(bottom, pending, `${newest}:${previous}:${older}`);
  return <Root ref={node => { navigationRef.current = node; }} className="ledger-top-pagination" role={bottom ? "group" : undefined} aria-label={t("Pagination")}>
    <button type="button" disabled={!newest} onClick={event => { focusPrimaryPagination(event.currentTarget); onNewest(); }} aria-label={t("newest")} title={t("newest")}><ChevronsLeft size={18} aria-hidden="true"/></button>
    <button type="button" disabled={!previous} onClick={event => { focusPrimaryPagination(event.currentTarget); onPrevious(); }} aria-label={t("Previous page")} title={t("Previous page")}><ChevronLeft size={18} aria-hidden="true"/></button>
    <button type="button" disabled={!older} onClick={event => { focusPrimaryPagination(event.currentTarget); onOlder(); }} aria-label={t("Next page")} title={t("Next page")}><ChevronRight size={18} aria-hidden="true"/></button>
  </Root>;
}

// Share keyboard scrolling and overflow detection with native ledger tables.
export function LedgerScroll({ children, label, className }: { children: ReactNode; label: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    // observe() delivers an initial size after layout, including for a new child.
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [children]);
  return <div ref={ref} className={className} role="region" aria-label={label} tabIndex={overflow ? 0 : undefined}
    onFocusCapture={event => {
      // Native focus can leave a partly visible link clipped by a scroll frame.
      // Only keyboard focus should move the table, never a pointer activation.
      if (event.target !== event.currentTarget && event.target.matches(":focus-visible")) {
        event.target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }
    }}>
    {children}
  </div>;
}

export function LedgerViewport({ children, label, kind }: { children: ReactNode; label: string; kind: "transactions" | "blocks" }) {
  return <LedgerScroll className={`ledger-viewport ledger-viewport-${kind}`} label={label}>
    <div className={kind === "blocks" ? "block-list" : "tx-list"}>{children}</div>
  </LedgerScroll>;
}
