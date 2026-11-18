import { useEffect, useRef } from 'react';

/* Pagination buttons become disabled while a page loads, and bottom controls
   can disappear entirely. Focus the persistent navigation above the results
   before changing pages so focus never falls back to <body>. */
export function focusPrimaryPagination(button: HTMLElement): void {
  const shell = button.closest('.table-shell, .data-ledger, .directory-page');
  const navigation = shell?.querySelector<HTMLElement>('nav.ledger-top-pagination, nav.cursor-pagination');
  if (!navigation) return;
  navigation.dataset.paginationFocusPending = 'true';
  navigation.tabIndex = -1;
  navigation.focus();
}

/* Loading rows can trigger browser scroll anchoring after focus has moved.
   Return the navigation to view when the new page is actually rendered. */
export function usePaginationFocus(bottom: boolean, pending: boolean, revision: string) {
  const navigationRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const navigation = navigationRef.current;
    if (bottom || pending || navigation?.dataset.paginationFocusPending !== 'true') return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!navigation.isConnected) return;
        delete navigation.dataset.paginationFocusPending;
        // Do not take focus back if the user has already moved to another control.
        if (document.activeElement !== navigation && document.activeElement !== document.body) return;
        navigation.focus({ preventScroll: true });
        navigation.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [bottom, pending, revision]);
  return navigationRef;
}
