/** Metadata is untrusted; skip malformed fields instead of hiding valid artwork. */
export function nftArtwork(item: any): string | undefined {
  return [item?.image_url, item?.metadata?.image_url, item?.metadata?.image,
    item?.media_url, item?.animation_url]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function matchesNftIdentity(item: any, address: string, id: string): boolean {
  if (!item || typeof item !== "object") return false;
  if (item.id != null && String(item.id) !== id) return false;
  const collection = item.token?.address_hash;
  return collection == null || typeof collection === "string" && collection.toLowerCase() === address.toLowerCase();
}
