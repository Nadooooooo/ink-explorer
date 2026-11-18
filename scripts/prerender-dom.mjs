// Playwright installs this function only in the browser used to build snapshots.
export function installSnapshotCapture() {
  const referenceAttributes = new Set([
    'id', 'for', 'form', 'headers', 'itemref', 'list', 'popovertarget', 'commandfor',
    'aria-activedescendant', 'aria-controls', 'aria-describedby', 'aria-details',
    'aria-errormessage', 'aria-flowto', 'aria-labelledby', 'aria-owns',
  ]);
  const paintAttributes = new Set(['style', 'fill', 'stroke', 'clip-path', 'filter', 'mask', 'marker-start', 'marker-mid', 'marker-end']);
  const selector = [...referenceAttributes, ...paintAttributes, '*|href']
    .map(name => `[${name}*="_r_"]`).join(',');

  globalThis.cloneForInkSnapshot = root => {
    const copy = root.cloneNode(true);
    // A delayed live announcement belongs to an interactive document. The
    // browser clock must not decide which initial text a build publishes.
    for (const count of copy.querySelectorAll('[data-result-count]')) count.replaceChildren();

    // React allocates useId values across renders. Renumber those tokens in
    // document order, retaining each IDREF relationship, suffix and fragment.
    const ids = new Map();
    function canonicalId(token) {
      if (!ids.has(token)) ids.set(token, `_r_${ids.size.toString(32)}_`);
      return ids.get(token);
    }
    for (const element of [copy, ...copy.querySelectorAll(selector)]) {
      for (const attribute of element.attributes) {
        const {name, value} = attribute;
        const localFragment = (name === 'href' || name === 'xlink:href') && value.startsWith('#');
        let normalized = value;
        if (referenceAttributes.has(name) || localFragment) {
          normalized = value.replace(/(^|[\s#])(_r_[0-9a-v]+_)(?=$|[-\s])/g,
            (_, separator, id) => separator + canonicalId(id));
        } else if (paintAttributes.has(name)) {
          normalized = value.replace(/url\(\s*(['"]?)#(_r_[0-9a-v]+_)([-\w:.]*)\1\s*\)/g,
            (match, quote, id) => match.replace(id, canonicalId(id)));
        }
        if (normalized !== value) attribute.value = normalized;
      }
    }
    return copy;
  };
}
