import { describe, expect, it } from "vitest";

import { JobService } from "../src/application/job-service.js";
import { InMemoryJobRepository } from "../src/infrastructure/in-memory-job-repository.js";

describe("JobService", () => {
  it("creates and persists a job through injected boundaries", async () => {
    const repository = new InMemoryJobRepository();
    const service = new JobService(
      repository,
      { now: () => "2026-11-13T13:00:00Z" },
      { next: () => "job-service-001" },
    );

    const created = await service.submit({ queue: "default", type: "demo" });

    expect(created.id).toBe("job-service-001");
    await expect(service.findById(created.id)).resolves.toBe(created);
  });

  it("returns undefined for an unknown job", async () => {
    const service = new JobService(
      new InMemoryJobRepository(),
      { now: () => "2026-11-13T13:00:00Z" },
      { next: () => "job-service-001" },
    );

    await expect(service.findById("missing")).resolves.toBeUndefined();
  });
});
