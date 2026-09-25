import { useEffect, useState } from "react";
import { blo } from "blo";
import { mediaUrl } from "./media";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function EntityMark({
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
        <img src={blo(walletAddress, 24)} alt="" />
      ) : (
        initials
      )}
    </span>
  );
}
