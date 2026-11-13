import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { JobService } from "../application/job-service.js";
import type { CreateJobInput } from "../domain/job.js";
import { QUEUECRAFT_VERSION } from "../version.js";

const MAX_REQUEST_BYTES = 1_048_576;

export function createHttpServer(service: JobService): Server {
  return createServer(async (request, response) => {
    try {
      await route(request, response, service);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected error";
      writeJson(response, 400, { error: message });
    }
  });
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  service: JobService,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://queuecraft.local");

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { status: "ok", version: QUEUECRAFT_VERSION });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/jobs") {
    const input = await readJobInput(request);
    const job = await service.submit(input);
    writeJson(response, 201, { job });
    return;
  }

  const jobMatch = /^\/v1\/jobs\/(?<id>[^/]+)$/.exec(url.pathname);
  const jobId = jobMatch?.groups?.["id"];
  if (request.method === "GET" && jobId) {
    const job = await service.findById(decodeURIComponent(jobId));
    if (!job) {
      writeJson(response, 404, { error: "job not found" });
      return;
    }
    writeJson(response, 200, { job });
    return;
  }

  writeJson(response, 404, { error: "route not found" });
}

async function readJobInput(request: IncomingMessage): Promise<CreateJobInput> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new TypeError("content-type must be application/json");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new RangeError(`request body exceeds ${MAX_REQUEST_BYTES} bytes`);
    }
    chunks.push(buffer);
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SyntaxError("request body must contain valid JSON");
  }
  if (!isRecord(value)) {
    throw new TypeError("request body must be a JSON object");
  }
  if (typeof value["queue"] !== "string" || typeof value["type"] !== "string") {
    throw new TypeError("queue and type must be strings");
  }
  if (value["payload"] !== undefined && !isRecord(value["payload"])) {
    throw new TypeError("payload must be a JSON object");
  }
  if (value["maxAttempts"] !== undefined && typeof value["maxAttempts"] !== "number") {
    throw new TypeError("maxAttempts must be a number");
  }

  return {
    queue: value["queue"],
    type: value["type"],
    ...(value["payload"] === undefined ? {} : { payload: value["payload"] }),
    ...(value["maxAttempts"] === undefined ? {} : { maxAttempts: value["maxAttempts"] }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}
