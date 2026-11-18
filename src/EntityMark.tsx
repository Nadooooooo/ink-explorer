import { memo, useState } from "react";
import { blo } from "blo";
import { logoUrl } from "./media";
import { BadgeCheck, FileCode2, Layers3 } from "lucide-react";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const identicons = new Map<string, string>();
function identicon(address: `0x${string}`) {
  const cached = identicons.get(address);
  if (cached) return cached;
  const image = blo(address, 24);
  identicons.set(address, image);
  if (identicons.size > 512) identicons.delete(identicons.keys().next().value!);
  return image;
}

export const EntityMark = memo(function EntityMark({
  address,
  src,
  label,
  entity,
}: {
  address?: string;
  src?: string;
  label?: string;
  entity?: { is_contract?: boolean; is_verified?: boolean; proxy_type?: string | null; implementations?: unknown[]; [key: string]: unknown } | null;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const failed = failedSource === src;
  if (!address && !src) return null;

  if (entity?.is_contract === true && !src) {
    const proxy = Boolean(entity.proxy_type || entity.implementations?.length);
    const verified = entity.is_verified === true;
    const Icon = proxy ? Layers3 : FileCode2;
    return <span className={`entity-mark contract-mark ${proxy ? "proxy" : "contract"}${verified ? " verified" : ""}`} data-contract-kind={`${verified ? "verified-" : ""}${proxy ? "proxy" : "contract"}`} aria-hidden="true"><Icon size={23} strokeWidth={1.8} />{verified && <BadgeCheck className="verification-mark" size={12} />}</span>;
  }

  const walletAddress = address && ADDRESS.test(address)
    ? address.toLowerCase() as `0x${string}`
    : null;
  const seed = Number.parseInt(
    (address || label || "ink").replace(/^0x/, "").slice(0, 6),
    16,
  );
  const hue = Number.isFinite(seed) ? seed % 360 : 265;
  const initials = (label || address?.slice(2, 4) || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="entity-mark"
      style={!walletAddress && (!src || failed) ? {
        background: `linear-gradient(145deg,hsl(${hue} 78% 62%),hsl(${(hue + 48) % 360} 72% 40%))`,
      } : undefined}
      aria-hidden="true"
    >
      {src && !failed ? (
        <img src={logoUrl(src)} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(src)} />
      ) : walletAddress ? (
        <img src={identicon(walletAddress)} alt="" />
      ) : (
        initials
      )}
    </span>
  );
});
