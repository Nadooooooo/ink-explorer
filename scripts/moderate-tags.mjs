import path from "node:path";
import { fileURLToPath } from "node:url";
import { communityTagStore } from "../server/community-tags.mjs";

// Server operators review proposals on the host. Contact details are never
// returned by the public explorer API; no message is sent on the user's behalf.
const [chain, action, id] = process.argv.slice(2);
if (
  !["57073", "763373"].includes(chain) ||
  !["list", "approve", "reject"].includes(action)
) {
  console.error(
    "Usage: node scripts/moderate-tags.mjs <57073|763373> <list|approve|reject> [request-id]",
  );
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = communityTagStore(
  path.join(root, "data", "community-tags", chain),
);
if (action === "list")
  console.log(JSON.stringify(await store.requests(), null, 2));
else
  console.log(
    JSON.stringify(
      await store.moderate(id, action === "approve" ? "approved" : "rejected"),
      null,
      2,
    ),
  );
