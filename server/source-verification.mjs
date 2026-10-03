import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const addressPattern = /^0x[\da-f]{40}$/i;
export function validateVerification(value) {
  if (
    !value ||
    value.consent !== true ||
    !addressPattern.test(value.address || "")
  )
    throw new Error(
      "Confirm source publication and provide a valid contract address",
    );
  const method = value.method || "standard-input";
  if (
    ![
      "standard-input",
      "vyper-standard-input",
      "flattened-code",
      "vyper-code",
      "multi-part",
      "vyper-multi-part",
      "sourcify",
    ].includes(method)
  )
    throw new Error("Invalid verification method");
  if (method === "sourcify") return { ...value, method };
  if (
    typeof value.compiler_version !== "string" ||
    !/^v\d+\.\d+\.\d+[a-zA-Z0-9.+-]{0,100}$/.test(value.compiler_version)
  )
    throw new Error("Select a compiler version");
  if (
    typeof value.source !== "string" ||
    Buffer.byteLength(value.source) > 2 * 1024 * 1024
  )
    throw new Error("Standard input exceeds 2 MiB");
  let input;
  if (
    [
      "standard-input",
      "vyper-standard-input",
      "multi-part",
      "vyper-multi-part",
    ].includes(method)
  ) {
    try {
      input = JSON.parse(value.source);
    } catch {
      throw new Error("Invalid standard input JSON");
    }
    if (
      !["Solidity", "Vyper", "Yul"].includes(input?.language) ||
      !input.sources ||
      typeof input.sources !== "object" ||
      Array.isArray(input.sources) ||
      !Object.keys(input.sources).length
    )
      throw new Error(
        "Standard input must include a language and source files",
      );
    for (const [name, source] of Object.entries(input.sources)) {
      if (
        !name ||
        name.length > 250 ||
        !source ||
        typeof source.content !== "string" ||
        source.urls
      )
        throw new Error(
          "Include source contents instead of remote source URLs",
        );
    }
  } else if (!value.source.trim())
    throw new Error("Include contract source code");
  if (
    value.contract_name != null &&
    (typeof value.contract_name !== "string" ||
      value.contract_name.length > 250)
  )
    throw new Error("Invalid contract name");
  if (
    value.constructor_args != null &&
    (typeof value.constructor_args !== "string" ||
      !/^(?:0x)?[\da-f]*$/i.test(value.constructor_args) ||
      value.constructor_args.length > 20000)
  )
    throw new Error("Invalid constructor arguments");
  if (
    typeof value.license_type !== "string" ||
    !/^[a-z0-9_]{1,40}$/.test(value.license_type)
  )
    throw new Error("Select a license");
  if (
    value.optimization_runs != null &&
    (!Number.isSafeInteger(Number(value.optimization_runs)) ||
      Number(value.optimization_runs) < 0 ||
      Number(value.optimization_runs) > 1000000000)
  )
    throw new Error("Invalid optimization runs");
  if (
    value.evm_version != null &&
    !/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(value.evm_version)
  )
    throw new Error("Invalid EVM version");
  if (
    value.libraries != null &&
    (typeof value.libraries !== "object" ||
      Array.isArray(value.libraries) ||
      Object.entries(value.libraries).some(
        ([name, address]) =>
          !name || name.length > 250 || !addressPattern.test(address),
      ))
  )
    throw new Error("Invalid library addresses");
  return {
    ...value,
    method:
      method === "standard-input" && input?.language === "Vyper"
        ? "vyper-standard-input"
        : method,
  };
}

export function verificationPayload(value) {
  const common = {
    compiler_version: value.compiler_version,
    license_type: value.license_type,
    contract_name: value.contract_name || "",
    autodetect_constructor_args: value.autodetect_constructor_args !== false,
    constructor_args: value.constructor_args || "",
  };
  if (value.method === "sourcify")
    return { body: "{}", headers: { "content-type": "application/json" } };
  if (["flattened-code", "vyper-code"].includes(value.method))
    return {
      body: JSON.stringify({
        ...common,
        source_code: value.source,
        evm_version: value.evm_version || "default",
        is_optimization_enabled: value.is_optimization_enabled === true,
        optimization_runs: Number(value.optimization_runs ?? 200),
        is_yul_contract: value.is_yul_contract === true,
        libraries: value.libraries || {},
      }),
      headers: { "content-type": "application/json" },
    };
  const form = new FormData();
  for (const [key, data] of Object.entries(common)) form.set(key, String(data));
  if (["multi-part", "vyper-multi-part"].includes(value.method)) {
    form.set("evm_version", value.evm_version || "default");
    form.set(
      "is_optimization_enabled",
      String(value.is_optimization_enabled === true),
    );
    form.set("optimization_runs", String(value.optimization_runs ?? 200));
    form.set("libraries", JSON.stringify(value.libraries || {}));
    Object.entries(JSON.parse(value.source).sources).forEach(
      ([name, source], index) =>
        form.set(
          `files[${index}]`,
          new Blob([source.content], { type: "text/plain" }),
          name,
        ),
    );
  } else
    form.set(
      "files[0]",
      new Blob([value.source], { type: "application/json" }),
      "input.json",
    );
  return { body: form };
}

export function createSourceVerification({
  api,
  socketOrigin,
  browserOrigin,
  send,
  makeSocket = (url) => new WebSocket(url),
}) {
  const jobs = new Map(),
    limits = new Map();
  const clean = () => {
    const now = Date.now();
    for (const [id, job] of jobs)
      if (job.expires < now) {
        job.socket?.close();
        jobs.delete(id);
      }
    for (const [ip, rate] of limits) if (rate.until < now) limits.delete(ip);
  };
  const publicJob = (job) => ({
    ticket: job.ticket,
    address: job.address,
    status: job.status,
    message: job.message || "",
  });
  return async function handle(req, res, pathname) {
    clean();
    if (
      req.method === "GET" &&
      /^\/api\/verification\/status\/[\da-f-]{36}$/.test(pathname)
    ) {
      const job = jobs.get(pathname.split("/").at(-1));
      return send(
        res,
        job ? 200 : 404,
        job
          ? publicJob(job)
          : {
              error: "Verification session expired; check the contract source",
            },
      );
    }
    if (req.method !== "POST" || pathname !== "/api/verification/submit")
      return send(res, 405, { error: "Method not allowed" });
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
        error: "Cross-origin verification is not allowed",
      });
    const ip = req.socket.remoteAddress,
      rate = limits.get(ip) || { until: Date.now() + 60000, count: 0 };
    if (
      ++rate.count > 5 ||
      jobs.size >= 100 ||
      (limits.size >= 1000 && !limits.has(ip))
    )
      return send(res, 429, {
        error: "Too many verification requests; retry later",
      });
    limits.set(ip, rate);
    let job;
    try {
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
        if (size > 3 * 1024 * 1024)
          return send(res, 413, {
            error: "Verification request exceeds 3 MiB",
          });
        chunks.push(chunk);
      }
      const value = validateVerification(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      const ticket = randomUUID();
      job = {
        ticket,
        address: value.address.toLowerCase(),
        status: "pending",
        expires: Date.now() + 15 * 60000,
      };
      jobs.set(ticket, job);
      const wsUrl = new URL("/socket/websocket?vsn=2.0.0", socketOrigin);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      const socket = makeSocket(wsUrl.href),
        topic = `addresses:${job.address}`;
      job.socket = socket;
      let finishJoin;
      const joined = new Promise((resolve) => {
        finishJoin = resolve;
      });
      let heartbeat;
      const stop = () => {
        clearInterval(heartbeat);
        socket.close();
      };
      socket.on("open", () => {
        socket.send(JSON.stringify(["1", "1", topic, "phx_join", {}]));
        heartbeat = setInterval(() => {
          if (socket.readyState === 1)
            socket.send(
              JSON.stringify([
                null,
                String(Date.now()),
                "phoenix",
                "heartbeat",
                {},
              ]),
            );
        }, 25000);
        heartbeat.unref?.();
      });
      socket.on("message", (raw) => {
        try {
          const frame = JSON.parse(raw.toString());
          if (frame[3] === "phx_reply" && frame[2] === topic)
            finishJoin(frame[4]?.status === "ok");
          if (frame[3] === "verification_result" && frame[2] === topic) {
            const result = frame[4];
            if (!["error", "ok", "success"].includes(result?.status)) return;
            job.status = result.status === "error" ? "failed" : "verified";
            job.message =
              job.status === "failed"
                ? Object.values(result.errors || {})
                    .flat()
                    .join(" · ")
                    .slice(0, 2000)
                : "Contract source verified";
            stop();
          }
        } catch {
          /* ignore unrelated upstream frames */
        }
      });
      socket.on("error", () => {
        job.message =
          "Live verification status unavailable; check the contract source";
        finishJoin(false);
        stop();
      });
      socket.on("close", () => clearInterval(heartbeat));
      const joinTimeout = setTimeout(() => finishJoin(false), 3000);
      await joined;
      clearTimeout(joinTimeout);
      const response = await fetch(
        `${api}/smart-contracts/${job.address}/verification/via/${value.method}`,
        {
          method: "POST",
          ...verificationPayload(value),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) {
        const body = await response.text();
        job.status = "failed";
        job.message = `Verification service (${response.status}): ${body.slice(0, 1500)}`;
        stop();
        return send(res, response.status < 500 ? 400 : 502, {
          error: job.message,
        });
      }
      const stopTimer = setTimeout(() => {
        if (job.status === "pending")
          job.message =
            "Verification is still pending; check the contract source";
        stop();
      }, 120000);
      stopTimer.unref?.();
      return send(res, 202, publicJob(job));
    } catch (error) {
      if (job) {
        job.status = "failed";
        job.socket?.close();
      }
      return send(
        res,
        error instanceof SyntaxError
          ? 400
          : /input|source|compiler|contract|constructor|license|publication/i.test(
                error.message,
              )
            ? 400
            : 502,
        { error: error.message },
      );
    }
  };
}
