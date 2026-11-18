export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch { /* Older browsers and restricted origins need the selection path. */ }

  const focused = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;pointer-events:none";
  document.body.append(input);
  try {
    input.select();
    input.setSelectionRange(0, value.length);
    return document.execCommand("copy") === true;
  } catch { return false; }
  finally {
    input.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
