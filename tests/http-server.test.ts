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

  it("lists submitted jobs through the collection endpoint", async () => {
    await fetch(`${baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queue: "reports", type: "daily-report" }),
    });

    const response = await fetch(`${baseUrl}/v1/jobs?queue=reports&status=queued`);
    const body = (await response.json()) as { jobs: Array<{ queue: string; status: string }> };

    expect(response.status).toBe(200);
    expect(body.jobs).toEqual(
      expect.arrayContaining([expect.objectContaining({ queue: "reports", status: "queued" })]),
    );
  });

  it("rejects unsupported list filters before querying jobs", async () => {
    const response = await fetch(`${baseUrl}/v1/jobs?status=waiting`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "status must be one of: queued, running, succeeded, failed, cancelled",
    });
  });

  it("limits collection results with a bounded integer query parameter", async () => {
    await Promise.all(
      ["first", "second", "third"].map((type) =>
        fetch(`${baseUrl}/v1/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queue: "limited", type }),
        }),
      ),
    );

    const response = await fetch(`${baseUrl}/v1/jobs?queue=limited&limit=2`);
    const body = (await response.json()) as { jobs: unknown[] };
    const invalidLimit = await fetch(`${baseUrl}/v1/jobs?limit=0`);

    expect(response.status).toBe(200);
    expect(body.jobs).toHaveLength(2);
    expect(invalidLimit.status).toBe(400);
    await expect(invalidLimit.json()).resolves.toEqual({
      error: "limit must be an integer between 1 and 100",
    });
  });

  it("controls a job lifecycle through named action routes", async () => {
    const createdResponse = await fetch(`${baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queue: "emails", type: "welcome-email" }),
    });
    const created = (await createdResponse.json()) as { job: { id: string } };

    const started = await fetch(`${baseUrl}/v1/jobs/${created.job.id}/start`, { method: "POST" });
    const completed = await fetch(`${baseUrl}/v1/jobs/${created.job.id}/succeed`, {
      method: "POST",
    });

    expect(started.status).toBe(200);
    expect(((await started.json()) as { job: { status: string } }).job.status).toBe("running");
    expect(completed.status).toBe(200);
    expect(((await completed.json()) as { job: { status: string } }).job.status).toBe("succeeded");
  });

  it("returns lifecycle errors with useful HTTP statuses", async () => {
    const missing = await fetch(`${baseUrl}/v1/jobs/missing/start`, { method: "POST" });
    expect(missing.status).toBe(404);

    const createdResponse = await fetch(`${baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queue: "emails", type: "welcome-email" }),
    });
    const created = (await createdResponse.json()) as { job: { id: string } };
    const invalid = await fetch(`${baseUrl}/v1/jobs/${created.job.id}/succeed`, { method: "POST" });

    expect(invalid.status).toBe(409);
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
