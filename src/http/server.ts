import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { JobNotFoundError, type JobService } from "../application/job-service.js";
import {
  type CreateJobInput,
  InvalidJobTransitionError,
  JOB_STATUSES,
  type JobCommand,
  type JobStatus,
} from "../domain/job.js";
import { QUEUECRAFT_VERSION } from "../version.js";

const MAX_REQUEST_BYTES = 1_048_576;

export function createHttpServer(service: JobService): Server {
  return createServer(async (request, response) => {
    try {
      await route(request, response, service);
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        writeJson(response, 404, { error: "job not found" });
        return;
      }
      if (error instanceof InvalidJobTransitionError) {
        writeJson(response, 409, { error: error.message });
        return;
      }
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

  if (request.method === "GET" && url.pathname === "/v1/jobs") {
    const jobs = await service.list(readJobListFilter(url));
    writeJson(response, 200, { jobs });
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

  const actionMatch = /^\/v1\/jobs\/(?<id>[^/]+)\/(?<action>start|succeed|cancel)$/.exec(
    url.pathname,
  );
  const action = actionMatch?.groups?.["action"];
  const actionJobId = actionMatch?.groups?.["id"];
  if (request.method === "POST" && action && actionJobId) {
    const job = await service.transition(decodeURIComponent(actionJobId), commandForAction(action));
    writeJson(response, 200, { job });
    return;
  }

  const failMatch = /^\/v1\/jobs\/(?<id>[^/]+)\/fail$/.exec(url.pathname);
  const failureJobId = failMatch?.groups?.["id"];
  if (request.method === "POST" && failureJobId) {
    const command = await readFailureCommand(request);
    const job = await service.transition(decodeURIComponent(failureJobId), command);
    writeJson(response, 200, { job });
    return;
  }

  writeJson(response, 404, { error: "route not found" });
}

function readJobListFilter(url: URL): {
  readonly queue?: string;
  readonly status?: JobStatus;
  readonly limit?: number;
} {
  const queue = url.searchParams.get("queue");
  const status = url.searchParams.get("status");
  const limitValue = url.searchParams.get("limit");
  if (status !== null && !JOB_STATUSES.includes(status as JobStatus)) {
    throw new TypeError(`status must be one of: ${JOB_STATUSES.join(", ")}`);
  }
  const limit = limitValue === null ? undefined : Number(limitValue);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw new RangeError("limit must be an integer between 1 and 100");
  }
  return {
    ...(queue === null ? {} : { queue }),
    ...(status === null ? {} : { status: status as JobStatus }),
    ...(limit === undefined ? {} : { limit }),
  };
}

function commandForAction(
  action: string,
): Extract<JobCommand, { readonly kind: "start" | "succeed" | "cancel" }> {
  if (action === "start" || action === "succeed" || action === "cancel") {
    return { kind: action };
  }
  throw new TypeError("unsupported job action");
}

async function readFailureCommand(request: IncomingMessage): Promise<JobCommand> {
  const value = await readJsonBody(request);
  const failure = value["failure"];
  if (!isRecord(failure)) {
    throw new TypeError("failure must be a JSON object");
  }
  if (
    typeof failure["code"] !== "string" ||
    typeof failure["message"] !== "string" ||
    typeof failure["retryable"] !== "boolean"
  ) {
    throw new TypeError("failure code, message, and retryable fields are required");
  }
  return {
    kind: "fail",
    failure: {
      code: failure["code"],
      message: failure["message"],
      retryable: failure["retryable"],
    },
  };
}

async function readJobInput(request: IncomingMessage): Promise<CreateJobInput> {
  const value = await readJsonBody(request);
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

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
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
  return value;
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
