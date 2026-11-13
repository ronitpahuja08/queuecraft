import { randomUUID } from "node:crypto";

import { JobService } from "./application/job-service.js";
import { createHttpServer } from "./http/server.js";
import { InMemoryJobRepository } from "./infrastructure/in-memory-job-repository.js";

const port = parsePort(process.env["PORT"]);
const service = new JobService(
  new InMemoryJobRepository(),
  { now: () => new Date().toISOString() },
  { next: () => randomUUID() },
);
const server = createHttpServer(service);

server.listen(port, "127.0.0.1", () => {
  console.log(`QueueCraft API listening on http://127.0.0.1:${port}`);
});

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3_000 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("PORT must be an integer between 1 and 65535");
  }
  return port;
}
