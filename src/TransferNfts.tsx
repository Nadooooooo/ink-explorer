import { useState } from "react";
import { ExplorerLink } from "./ExplorerLink";
import { NftThumbnail } from "./NftThumbnail";
import { formatChainAmount } from "./explorer-data";
import { transferNfts } from "./transfer-data";

export function TransferNfts({ item, get, locale, t }: { item: Record<string, any>; get: (path: string) => Promise<any>; locale: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false), entries = transferNfts(item), address = item.token?.address_hash;
  const validAddress = /^0x[\da-f]{40}$/i.test(address || "");
  const render = (entry: typeof entries[number], index: number) => <div className="transfer-nft" key={`${entry.id}:${index}`}>
    {validAddress && <NftThumbnail address={address} id={entry.id} record={entry.record} get={get}/>}
    {validAddress ? <ExplorerLink className="text-link nft-transfer-id" to={`/token/${address}/instance/${entry.id}`} title={`#${entry.id}`}><bdi>#{entry.id.length > 16 ? `${entry.id.slice(0,8)}…${entry.id.slice(-6)}` : entry.id}</bdi></ExplorerLink> : <bdi>#{entry.id}</bdi>}
    <span className="transfer-nft-quantity" aria-label={`${t("Amount")}: ${entry.quantity ?? "N/A"}`} title={entry.quantity}>{entry.quantity == null ? "N/A" : `${formatChainAmount(entry.quantity, 0, locale)} ×`}</span>
  </div>;
  return <div className="transfer-nfts">{entries.slice(0,3).map(render)}{entries.length > 3 && <details onToggle={event => setExpanded(event.currentTarget.open)}><summary>{t("Show {count} more NFTs").replace("{count}", new Intl.NumberFormat(locale).format(entries.length - 3))}</summary>{expanded && entries.slice(3).map(render)}</details>}</div>;
}
