/** Carry a native search interaction across the first React commit only. */
export type StartupSearch = {
  value: string;
  expanded: boolean;
  focus: 'input' | 'submit' | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
};
let pending: StartupSearch | null = null;

/** A native IME owns its input until it commits, cancels, or loses focus. */
export function afterStartupComposition(root: HTMLElement, render: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (root.querySelector('[data-startup-composing="true"]')) return;
    clearTimeout(timer);
    document.removeEventListener('compositionend', settled, true);
    document.removeEventListener('focusout', settled, true);
    window.dispatchEvent(new Event('ink-startup-complete'));
    render();
  };
  // Browsers can dispatch the final input event after compositionend. Let the
  // entire native event sequence finish before capturing the committed value.
  const settled = () => { clearTimeout(timer); timer = setTimeout(check, 0); };
  document.addEventListener('compositionend', settled, true);
  document.addEventListener('focusout', settled, true);
  // Code is ready: waiting for someone's keyboard is not a loading failure.
  root.dataset.startupReady = 'true';
  check();
}

export function captureStartupSearch(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('.global-search input:not([type="hidden"])');
  if (!input) return;
  const submit = input.closest('form')?.querySelector('button[type="submit"]');
  pending = {
    value: input.value,
    expanded: input.closest('.header-search-field')?.getAttribute('data-open') === 'true',
    focus: document.activeElement === input ? 'input' : document.activeElement === submit ? 'submit' : null,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection,
  };
}

// Reading is non-destructive because StrictMode can call state initializers twice.
export const readStartupSearch = () => pending;
export function finishStartupSearch(snapshot: StartupSearch | null) {
  if (pending === snapshot) pending = null;
}
