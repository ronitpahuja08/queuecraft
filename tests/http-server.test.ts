import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JobService } from "../src/application/job-service.js";
import { createHttpServer } from "../src/http/server.js";
import { InMemoryJobRepository } from "../src/infrastructure/in-memory-job-repository.js";

describe("QueueCraft HTTP API", () => {
  let nextId = 0;
  const service = new JobService(
    new InMemoryJobRepository(),
    { now: () => "2026-11-13T14:00:00Z" },
    { next: () => `job-http-${++nextId}` },
  );
  const server = createHttpServer(service);
  let baseUrl = "";

  beforeEach(async () => {
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    }
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("reports service health and version", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", version: "0.1.0" });
  });

  it("creates and retrieves a queued job", async () => {
    const createdResponse = await fetch(`${baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queue: "emails",
        type: "welcome-email",
        payload: { recipient: "user@example.com" },
      }),
    });
    const created = (await createdResponse.json()) as { job: { id: string; status: string } };

    expect(createdResponse.status).toBe(201);
    expect(created.job.status).toBe("queued");

    const retrievedResponse = await fetch(`${baseUrl}/v1/jobs/${created.job.id}`);
    const retrieved = (await retrievedResponse.json()) as { job: { id: string } };

    expect(retrievedResponse.status).toBe(200);
    expect(retrieved.job.id).toBe(created.job.id);
  });

  it("returns actionable errors for malformed requests", async () => {
    const response = await fetch(`${baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "request body must contain valid JSON",
    });
  });

  it("returns 404 for unknown jobs and routes", async () => {
    const missingJob = await fetch(`${baseUrl}/v1/jobs/missing`);
    const missingRoute = await fetch(`${baseUrl}/unknown`);

    expect(missingJob.status).toBe(404);
    expect(missingRoute.status).toBe(404);
  });
});
