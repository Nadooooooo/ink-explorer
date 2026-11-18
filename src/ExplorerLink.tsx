import { createContext, useContext, useMemo, type AnchorHTMLAttributes } from "react";

type ExplorerNavigation = {
  href: (path: string) => string;
  navigate: (path: string) => void;
};

const NavigationContext = createContext<ExplorerNavigation | null>(null);
export const ExplorerNavigationProvider = NavigationContext.Provider;

type ExplorerLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to?: string;
  disabled?: boolean;
  onNavigate?: () => void;
};

/** A real destination for native browser actions, with SPA navigation on plain clicks. */
export function ExplorerLink({ to, disabled, onNavigate, onClick, className, children, ...props }: ExplorerLinkProps) {
  const navigation = useContext(NavigationContext);
  const unavailable = disabled || !to;
  const href = useMemo(
    () => unavailable ? undefined : navigation?.href(to) ?? to,
    [navigation, to, unavailable],
  );
  return (
    <a
      {...props}
      className={["explorer-link", className].filter(Boolean).join(" ")}
      href={href}
      aria-disabled={unavailable || undefined}
      role={unavailable ? "link" : undefined}
      tabIndex={unavailable ? -1 : props.tabIndex}
      onClick={event => {
        onClick?.(event);
        if (unavailable) {
          event.preventDefault();
          return;
        }
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.download != null || (props.target && props.target !== "_self") || !navigation) return;
        event.preventDefault();
        navigation.navigate(to!);
        onNavigate?.();
      }}
    >
      {children}
    </a>
  );
}
