import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  open,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const tagTypes = [
  "name",
  "generic",
  "classifier",
  "information",
  "note",
  "protocol",
  "internal",
  "factory",
  "token_reputation",
];
export function validateTagRequest(value) {
  const text = (key, min, max) => {
    const v = value?.[key];
    if (
      typeof v !== "string" ||
      v.trim().length < min ||
      v.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
    )
      throw new Error(`Invalid ${key}`);
    return v.trim();
  };
  if (value?.consent !== true)
    throw new Error(
      "Confirm publication and review of the submitted information",
    );
  const address = text("address", 42, 42);
  if (!/^0x[\da-f]{40}$/i.test(address)) throw new Error("Invalid address");
  const email = text("email", 3, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Invalid email");
  const type = text("type", 1, 40);
  if (!tagTypes.includes(type)) throw new Error("Invalid tag type");
  const website = text("website", 0, 500);
  if (website) {
    const u = new URL(website);
    if (u.protocol !== "https:")
      throw new Error("Use an HTTPS company website");
  }
  const optional = (key, max) => (value[key] == null ? "" : text(key, 0, max));
  const labelUrl = optional("labelUrl", 500),
    iconUrl = optional("iconUrl", 500),
    background = optional("background", 7),
    color = optional("color", 7),
    labelDescription = optional("labelDescription", 80);
  for (const url of [labelUrl, iconUrl])
    if (url && new URL(url).protocol !== "https:")
      throw new Error("Use an HTTPS label URL");
  for (const hex of [background, color])
    if (hex && !/^#[\da-f]{6}$/i.test(hex))
      throw new Error("Invalid label color");
  const result = {
    address: address.toLowerCase(),
    type,
    label: text("label", 1, 35),
    description: text("description", 1, 500),
    requester: text("requester", 1, 100),
    email,
    company: text("company", 0, 150),
    website,
    labelUrl,
    iconUrl,
    background,
    color,
    labelDescription,
  };
  if (value.extra_labels != null) {
    if (!Array.isArray(value.extra_labels) || value.extra_labels.length > 19)
      throw new Error("Maximum 20 labels per request");
    result.extra_labels = value.extra_labels.map((label) => {
      const item = validateTagRequest({
        ...result,
        ...label,
        consent: true,
        extra_labels: undefined,
      });
      return Object.fromEntries(
        [
          "address",
          "type",
          "label",
          "labelUrl",
          "iconUrl",
          "background",
          "color",
          "labelDescription",
        ].map((key) => [key, item[key]]),
      );
    });
  }
  return result;
}

export function communityTagStore(directory) {
  const approvedPath = path.join(directory, "approved.json");
  const readApproved = async () => {
    try {
      return JSON.parse(await readFile(approvedPath, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  };
  const writeAtomic = async (file, data) => {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, file);
  };
  const requestPath = (id) => {
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error("Invalid request ID");
    return path.join(directory, "requests", `${id}.json`);
  };
  const moderateLock = async (action) => {
    const lockPath = path.join(directory, ".moderation.lock");
    let lock;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        lock = await open(lockPath, "wx", 0o600);
        break;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    if (!lock) throw new Error("Another review is running; retry later");
    try {
      return await action();
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  };
  return {
    async submit(value) {
      const submission = validateTagRequest(value);
      await mkdir(path.join(directory, "requests"), {
        recursive: true,
        mode: 0o700,
      });
      const id = randomUUID();
      await writeAtomic(requestPath(id), {
        id,
        status: "pending",
        createdAt: new Date().toISOString(),
        ...submission,
      });
      return { id, status: "pending" };
    },
    async requests() {
      await mkdir(path.join(directory, "requests"), {
        recursive: true,
        mode: 0o700,
      });
      const files = await readdir(path.join(directory, "requests"));
      return Promise.all(
        files
          .filter((name) => /^[\da-f-]{36}\.json$/.test(name))
          .map((name) =>
            readFile(path.join(directory, "requests", name), "utf8").then(
              JSON.parse,
            ),
          ),
      );
    },
    async moderate(id, status) {
      if (!["approved", "rejected"].includes(status))
        throw new Error("Choose approved or rejected");
      const file = requestPath(id);
      return moderateLock(async () => {
        const request = JSON.parse(await readFile(file, "utf8"));
        if (request.status !== "pending")
          throw new Error("Request already reviewed");
        if (status === "approved") {
          const approved = await readApproved();
          for (const [labelIndex, label] of [
            request,
            ...(request.extra_labels || []),
          ].entries()) {
            const tags = approved[label.address] || [];
            approved[label.address] = [
              ...tags.filter(
                (tag) =>
                  !(tag.name === label.label && tag.tagType === label.type),
              ),
              {
                name: label.label,
                tagType: label.type,
                ordinal: tags.length,
                slug: `community-${id}-${labelIndex}`,
                meta: {
                  tooltipDescription:
                    label.labelDescription || request.description.slice(0, 500),
                  tooltipUrl: label.labelUrl || undefined,
                  iconUrl: label.iconUrl || undefined,
                  bgColor: label.background || undefined,
                  textColor: label.color || undefined,
                },
              },
            ];
          }
          await writeAtomic(approvedPath, approved);
        }
        await writeAtomic(file, {
          ...request,
          status,
          reviewedAt: new Date().toISOString(),
        });
        return { id, status, address: request.address };
      });
    },
    async enrich(profile) {
      const approved = await readApproved(),
        tags = approved[profile.hash?.toLowerCase()];
      if (!Array.isArray(tags) || !tags.length) return profile;
      return {
        ...profile,
        name: tags.find((tag) => tag.tagType === "name")?.name || profile.name,
        metadata: {
          ...profile.metadata,
          tags: [...(profile.metadata?.tags || []), ...tags],
        },
      };
    },
  };
}

export function createTagSubmission({ store, browserOrigin, send }) {
  const limits = new Map();
  return async (req, res) => {
    if (req.method !== "POST")
      return send(res, 405, { error: "Method not allowed" });
    try {
      let originAllowed = true;
      try {
        if (
          req.headers.origin &&
          req.headers.origin !== browserOrigin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          originAllowed = false;
      } catch {
        originAllowed = false;
      }
      if (!originAllowed)
        return send(res, 403, {
          error: "Cross-origin submissions are not allowed",
        });
      const now = Date.now();
      for (const [ip, value] of limits)
        if (value.until < now) limits.delete(ip);
      const ip = req.socket.remoteAddress,
        rate = limits.get(ip) || { until: now + 3600000, count: 0 };
      if (++rate.count > 10 || (limits.size >= 1000 && !limits.has(ip)))
        return send(res, 429, { error: "Too many tag requests; retry later" });
      limits.set(ip, rate);
      if (
        !String(req.headers["content-type"] || "").startsWith(
          "application/json",
        )
      )
        return send(res, 415, { error: "JSON input required" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 10000)
          return send(res, 413, { error: "Tag request too large" });
        chunks.push(chunk);
      }
      const result = await store.submit(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      return send(res, 202, result);
    } catch (e) {
      return send(res, e.code ? 500 : 400, {
        error: e.code ? "Unable to store the request" : e.message,
      });
    }
  };
}
