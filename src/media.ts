import { API } from "./network";

export function mediaUrl(value?: string) {
  if (!value || value.startsWith("data:image/")) return value || "";
  return `${API}/media?url=${encodeURIComponent(value)}`;
}
