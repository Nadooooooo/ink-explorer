import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateVerification,
  verificationPayload,
  createSourceVerification,
} from "../server/source-verification.mjs";
import {
  communityTagStore,
  validateTagRequest,
  createTagSubmission,
} from "../server/community-tags.mjs";

const address = `0x${"1".repeat(40)}`;
const verification = {
  address,
  consent: true,
  compiler_version: "v0.8.36+commit.8a079791",
  license_type: "mit",
  source: JSON.stringify({
    language: "Solidity",
    sources: {
      "Example.sol": { content: "pragma solidity ^0.8.0; contract Example {}" },
    },
    settings: { optimizer: { enabled: true, runs: 200 } },
  }),
};
const proposal = {
  address,
  consent: true,
  requester: "Example Owner",
  email: "owner@example.invalid",
  company: "Example",
  website: "https://example.invalid",
  label: "Example contract",
  type: "name",
  description: "Public fixture used only in an isolated temporary directory.",
};
const send = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};
const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
const close = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};

test("verification rejects malformed inputs, remote sources and publication without consent", () => {
  assert.deepEqual(validateVerification(verification), {
    ...verification,
    method: "standard-input",
  });
  for (const value of [
    { ...verification, consent: false },
    { ...verification, address: "0x123" },
    { ...verification, compiler_version: "latest" },
    { ...verification, source: "bad JSON" },
    {
      ...verification,
      source: JSON.stringify({
        language: "Solidity",
        sources: { "Remote.sol": { urls: ["http://localhost/private"] } },
      }),
    },
    { ...verification, constructor_args: "not hexadecimal" },
    { ...verification, license_type: "../secret" },
    { ...verification, source: "x".repeat(2 * 1024 * 1024 + 1) },
  ])
    assert.throws(() => validateVerification(value));
});

test("verification supports every enabled Solidity and Vyper input format without discarding compiler settings", () => {
  for (const method of [
    "standard-input",
    "vyper-standard-input",
    "multi-part",
    "vyper-multi-part",
    "flattened-code",
    "vyper-code",
    "sourcify",
  ]) {
    const value = validateVerification({
      ...verification,
      method,
      source: ["flattened-code", "vyper-code"].includes(method)
        ? "contract Example {}"
        : verification.source,
      libraries: { ExampleLibrary: address },
      is_optimization_enabled: true,
      optimization_runs: 777,
      evm_version: "cancun",
    });
    const payload = verificationPayload(value);
    if (method === "sourcify") assert.equal(payload.body, "{}");
    else if (["flattened-code", "vyper-code"].includes(method)) {
      const body = JSON.parse(payload.body);
      assert.equal(body.optimization_runs, 777);
      assert.equal(body.libraries.ExampleLibrary, address);
      assert.equal(body.source_code, "contract Example {}");
    } else if (method.includes("multi-part")) {
      assert.equal(payload.body.get("files[0]").name, "Example.sol");
      assert.equal(payload.body.get("optimization_runs"), "777");
    } else assert.equal(payload.body.get("files[0]").name, "input.json");
  }
  for (const changes of [
    { method: "arbitrary" },
    { method: "flattened-code", source: "" },
    { optimization_runs: -1 },
    { libraries: { Lib: "invalid" } },
    { evm_version: "../secret" },
  ])
    assert.throws(() => validateVerification({ ...verification, ...changes }));
});

test("verification preserves compiler input and reports actual asynchronous success and failure", async () => {
  let upstreamStatus = 200,
    received = "",
    sockets = [];
  const upstream = createServer(async (req, res) => {
    received = "";
    for await (const chunk of req) received += chunk;
    send(res, upstreamStatus, {
      message: upstreamStatus === 200 ? "queued" : "Compilation unavailable",
    });
  });
  const api = await listen(upstream);
  class Socket extends EventEmitter {
    readyState = 1;
    constructor() {
      super();
      sockets.push(this);
      queueMicrotask(() => this.emit("open"));
    }
    send(value) {
      const frame = JSON.parse(value);
      if (frame[3] === "phx_join") {
        this.topic = frame[2];
        this.emit(
          "message",
          Buffer.from(
            JSON.stringify([
              "1",
              "1",
              this.topic,
              "phx_reply",
              { status: "ok" },
            ]),
          ),
        );
      }
    }
    close() {
      this.readyState = 3;
      this.emit("close");
    }
    result(payload) {
      this.emit(
        "message",
        Buffer.from(
          JSON.stringify([
            "1",
            "2",
            this.topic,
            "verification_result",
            payload,
          ]),
        ),
      );
    }
  }
  const handler = createSourceVerification({
    api,
    socketOrigin: api,
    browserOrigin: "https://example.invalid",
    send,
    makeSocket: () => new Socket(),
  });
  const server = createServer((req, res) =>
      handler(req, res, new URL(req.url, api).pathname),
    ),
    base = await listen(server);
  const submit = (value) =>
    fetch(`${base}/api/verification/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  try {
    const response = await submit(verification);
    assert.equal(response.status, 202);
    const queued = await response.json();
    assert.equal(queued.status, "pending");
    assert.match(received, /name="files\[0\]"; filename="input.json"/);
    assert(received.includes(verification.source));
    assert.match(received, /compiler_version/);
    assert.match(received, /optimizer/);
    assert(!received.includes("consent"));
    sockets[0].result({ status: "unknown" });
    assert.equal(
      (
        await fetch(`${base}/api/verification/status/${queued.ticket}`).then(
          (r) => r.json(),
        )
      ).status,
      "pending",
      "Unknown events must not prove verification",
    );
    sockets[0].result({ status: "ok" });
    assert.equal(
      (
        await fetch(`${base}/api/verification/status/${queued.ticket}`).then(
          (r) => r.json(),
        )
      ).status,
      "verified",
    );
    const second = await submit(verification).then((r) => r.json());
    sockets[1].result({
      status: "error",
      errors: { source_code: ["Bytecode does not match"] },
    });
    const failed = await fetch(
      `${base}/api/verification/status/${second.ticket}`,
    ).then((r) => r.json());
    assert.equal(failed.status, "failed");
    assert.match(failed.message, /Bytecode does not match/);
    upstreamStatus = 503;
    assert.equal((await submit(verification)).status, 502);
    assert.equal((await fetch(`${base}/api/verification/submit`)).status, 405);
    assert.equal(
      (
        await fetch(`${base}/api/verification/submit`, {
          method: "POST",
          headers: {
            origin: "https://evil.invalid",
            "content-type": "application/json",
          },
          body: JSON.stringify(verification),
        })
      ).status,
      403,
    );
    assert.equal(
      (await submit({ ...verification, consent: false })).status,
      400,
    );
  } finally {
    sockets.forEach((socket) => socket.close());
    await close(server);
    await close(upstream);
  }
});

test("tag requests remain private and pending until reviewed; rejection and contact isolation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ink-tag-review-")),
    store = communityTagStore(directory);
  try {
    validateTagRequest(proposal);
    for (const value of [
      { ...proposal, consent: false },
      { ...proposal, type: "admin" },
      { ...proposal, label: "x".repeat(36) },
      { ...proposal, email: "invalid" },
      { ...proposal, website: "javascript:alert(1)" },
      { ...proposal, address: "../secret" },
    ])
      assert.throws(() => validateTagRequest(value));
    const queued = await store.submit(proposal);
    assert.equal(queued.status, "pending");
    assert(!JSON.stringify(queued).includes(proposal.email));
    const profile = {
      hash: address,
      is_verified: false,
      metadata: { tags: [{ name: "Existing", tagType: "generic" }] },
    };
    assert.deepEqual(await store.enrich(profile), profile);
    const file = path.join(directory, "requests", `${queued.id}.json`);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await store.moderate(queued.id, "approved");
    const enriched = await store.enrich(profile);
    assert.equal(enriched.name, proposal.label);
    assert.equal(enriched.is_verified, false);
    assert.equal(enriched.metadata.tags.length, 2);
    const publicData = await readFile(
      path.join(directory, "approved.json"),
      "utf8",
    );
    for (const privateValue of [proposal.email, proposal.requester])
      assert(!publicData.includes(privateValue));
    assert(!JSON.stringify(enriched).includes(proposal.email));
    await assert.rejects(
      () => store.moderate(queued.id, "approved"),
      /already reviewed/,
    );
    const rejected = await store.submit({ ...proposal, label: "Rejected" });
    await store.moderate(rejected.id, "rejected");
    assert(!JSON.stringify(await store.enrich(profile)).includes("Rejected"));
    await assert.rejects(
      () => store.moderate("../../secret", "approved"),
      /Invalid request ID/,
    );
    assert.equal(
      (await store.requests()).filter((request) => request.status === "pending")
        .length,
      0,
    );
    const more = await store.submit({
        ...proposal,
        label: "Second",
        extra_labels: [
          {
            address: `0x${"2".repeat(40)}`,
            label: "Other account",
            type: "generic",
          },
        ],
      }),
      another = await store.submit({ ...proposal, label: "Third" });
    await Promise.all([
      store.moderate(more.id, "approved"),
      store.moderate(another.id, "approved"),
    ]);
    const complete = await store.enrich(profile);
    assert.equal(
      complete.metadata.tags.length,
      4,
      "Concurrent approvals must retain both changes",
    );
    assert.equal(
      (await store.enrich({ hash: `0x${"2".repeat(40)}` })).metadata.tags[0]
        .name,
      "Other account",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("submission HTTP boundary rejects bad origins, unsupported methods and invalid payloads", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ink-tag-http-")),
    store = communityTagStore(directory);
  const handler = createTagSubmission({
    store,
    browserOrigin: "https://example.invalid",
    send,
  });
  const server = createServer(handler),
    base = await listen(server);
  try {
    const post = (value, origin) =>
      fetch(base, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify(value),
      });
    assert.equal((await fetch(base)).status, 405);
    assert.equal((await post(proposal, "https://evil.invalid")).status, 403);
    assert.equal((await post({ ...proposal, consent: false })).status, 400);
    const accepted = await post(proposal);
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).status, "pending");
    assert.equal((await store.requests()).length, 1);
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
