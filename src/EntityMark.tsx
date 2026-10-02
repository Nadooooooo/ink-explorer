import { memo, useEffect, useState } from "react";
import { blo } from "blo";
import { mediaUrl } from "./media";

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
}: {
  address?: string;
  src?: string;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!address && !src) return null;

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
        <img src={mediaUrl(src)} alt="" onError={() => setFailed(true)} />
      ) : walletAddress ? (
        <img src={identicon(walletAddress)} alt="" />
      ) : (
        initials
      )}
    </span>
  );
});
