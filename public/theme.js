// Resolve the saved preference before styles paint. The build pins these bytes in CSP.
(() => {
  let preference = "system";
  try { preference = localStorage.getItem("ink-theme") || preference; } catch {}
  const dark = preference === "dark" || (preference !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f0f0f" : "#fafafa");
})();

// Track composition before the application downloads: replacing a native input
// mid-composition discards the browser's replacement range and duplicates text.
(() => {
  const start = event => {
    if (event.target instanceof HTMLInputElement && event.target.matches('#root .global-search input')) {
      event.target.dataset.startupComposing = 'true';
    }
  };
  const end = event => {
    if (event.target instanceof HTMLInputElement) delete event.target.dataset.startupComposing;
  };
  const toggleSearch = event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.mobile-search-trigger');
    const field = document.querySelector('#header-search');
    if (!button || !field || event.defaultPrevented || event.button !== 0) return;
    const open = field.dataset.open !== 'true';
    field.dataset.open = String(open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? button.dataset.closeLabel : button.dataset.openLabel);
    if (open) field.querySelector('input')?.focus(); else button.focus();
  };
  document.addEventListener('compositionstart', start, true);
  document.addEventListener('compositionend', end, true);
  document.addEventListener('focusout', end, true);
  document.addEventListener('click', toggleSearch);
  window.addEventListener('ink-startup-complete', () => {
    document.removeEventListener('compositionstart', start, true);
    document.removeEventListener('compositionend', end, true);
    document.removeEventListener('focusout', end, true);
    document.removeEventListener('click', toggleSearch);
  }, { once: true });
})();

// The document stays usable if an entry module or one of its imports fails.
// No automatic reloads: preserve the current route, filters and fragment.
(() => {
  // A deadline remains independent of the entry module and locale downloads.
  // Explicit display avoids WebKit exposing descendants of a hidden animation.
  const deadline = setTimeout(() => { document.documentElement.dataset.startupDelayed = 'true'; }, 8000);
  window.addEventListener('ink-startup-complete', () => {
    clearTimeout(deadline);
    delete document.documentElement.dataset.startupDelayed;
  }, { once: true });
  const failed = event => {
    if (event.target instanceof HTMLScriptElement && event.target.type === "module") {
      document.documentElement.dataset.startupFailed = "true";
    }
  };
  window.addEventListener("error", failed, true);
  window.addEventListener("load", () => window.removeEventListener("error", failed, true), { once: true });
  // A stalled module can delay DOMContentLoaded indefinitely. Delegation keeps
  // the recovery link operational as soon as its HTML has been parsed.
  document.addEventListener("click", event => {
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.target instanceof Element && event.target.closest("#ink-startup-reload")) {
      event.preventDefault();
      location.reload();
    }
  });
})();
