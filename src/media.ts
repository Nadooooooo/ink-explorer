import { API } from "./network";
import retainedLogos from "./local-logos.json";

export function mediaUrl(value?: string) {
  if (!value || value.startsWith("data:image/")) return value || "";
  return `${API}/media?url=${encodeURIComponent(value)}`;
}

// Cards use a single small frame, including when the NFT artwork is an animation
// or video. Inline SVG remains immediate and needs no network round trip.
export function thumbnailUrl(value?: string) {
  if (!value || value.startsWith("data:image/")) return value || "";
  return `${API}/media?kind=thumbnail&url=${encodeURIComponent(value)}`;
}

export function logoUrl(value?: string) {
  if (!value || value.startsWith("data:image/")) return value || "";
  const local=(retainedLogos as Record<string,string>)[value];
  if(local)return local;
  return `${API}/media?kind=logo&url=${encodeURIComponent(value)}`;
}
