import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { blo } from "blo";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector(".tx-row .flow-party .entity-mark img");
  const list = await page.$eval(".tx-row", (row) =>
    [...row.querySelectorAll(".flow-party")].map((party) => ({
      image: party.querySelector(".entity-mark img")?.getAttribute("src"),
      width: party.querySelector(".entity-mark img")?.naturalWidth,
    })),
  );
  assert.ok(list.length >= 2, "transaction row should show sender and recipient");
  for (const party of list) {
    assert.match(party.image || "", /^data:image\/svg\+xml;base64,/, "wallet should have a pixel identicon");
    assert.equal(party.width, 24, "identicon should render at the requested size");
  }

  const overview = await fetch(`${base}/api/overview`).then((response) => response.json());
  const tx = overview.transactions[0];
  await page.goto(`${base}/tx/${tx.hash}`, { waitUntil: "networkidle0" });
  const detail = await page.$$eval(".definition.wide .flow-party", (parties) =>
    parties.slice(0, 2).map((party) => ({
      image: party.querySelector(".entity-mark img")?.getAttribute("src"),
    })),
  );
  assert.equal(detail[0]?.image, blo(tx.from.hash.toLowerCase(), 24));
  if (tx.to?.hash) assert.equal(detail[1]?.image, blo(tx.to.hash.toLowerCase(), 24));
  console.log("Wallet identicons render and remain stable across transaction views.");
} finally {
  await browser.close();
}
