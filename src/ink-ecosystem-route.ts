import index from "./ink-ecosystem-index.json" with { type: "json" };

const ecosystemPrefix = "ecosystem-";
const identities = new Map(index.map(app => [ecosystemAppId(app.id), app]));

export function isEcosystemAppId(id?: string) {
  return id?.startsWith(ecosystemPrefix) ?? false;
}

export function ecosystemAppId(id: string) {
  return ecosystemPrefix + id.replaceAll(":", "");
}

export function ecosystemAppIdentity(id: string, sepolia = false) {
  const app = identities.get(id);
  return app && (!sepolia || app.network === "Both") ? app : undefined;
}
