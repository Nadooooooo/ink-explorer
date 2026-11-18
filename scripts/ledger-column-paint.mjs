// Read the full viewport capture, before locator screenshots can trigger a
// different WebKit paint. DOM visibility alone missed the Arabic word loss.
export async function ledgerColumnPaint(page, screenshot) {
  return page.evaluate(async base64 => {
    const labels = [...document.querySelectorAll('.address-transactions .ledger-columns > span')].map(node => {
      const r = node.getBoundingClientRect();
      return {text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height};
    });
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const {data} = ctx.getImageData(0, 0, image.width, image.height), scale = image.width / innerWidth;
    return labels.map(label => {
      let darkPixels = 0;
      for (let y = Math.ceil((label.y + 2) * scale); y < Math.floor((label.y + label.height - 2) * scale); y++) {
        for (let x = Math.ceil((label.x + 2) * scale); x < Math.floor((label.x + label.width - 2) * scale); x++) {
          if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
          const offset = (y * image.width + x) * 4;
          if (data[offset] < 160 && data[offset + 1] < 160 && data[offset + 2] < 160) darkPixels++;
        }
      }
      return {...label, darkPixels};
    });
  }, screenshot.toString('base64'));
}
