import { describe, expect, it } from "vitest";

import { createJob, InvalidJobTransitionError, transitionJob } from "../src/domain/job.js";

const CREATED_AT = "2026-11-13T12:00:00.000Z";

function queuedJob() {
  return createJob(
    {
      queue: "emails",
      type: "welcome-email",
      payload: { recipient: "user@example.com" },
    },
    { id: "job-001", now: CREATED_AT },
  );
}

describe("job lifecycle", () => {
  it("creates an immutable queued job with deterministic values", () => {
    const job = queuedJob();

    expect(job).toEqual({
      id: "job-001",
      queue: "emails",
      type: "welcome-email",
      payload: { recipient: "user@example.com" },
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job.payload)).toBe(true);
  });

  it("moves a queued job through running to succeeded", () => {
    const running = transitionJob(queuedJob(), { kind: "start" }, "2026-11-13T12:01:00Z");
    const succeeded = transitionJob(running, { kind: "succeed" }, "2026-11-13T12:02:00Z");

    expect(running).toMatchObject({
      status: "running",
      attempts: 1,
      version: 2,
      startedAt: "2026-11-13T12:01:00.000Z",
    });
    expect(succeeded).toMatchObject({
      status: "succeeded",
      attempts: 1,
      version: 3,
      completedAt: "2026-11-13T12:02:00.000Z",
    });
  });

  it("records a structured terminal failure", () => {
    const running = transitionJob(queuedJob(), { kind: "start" }, CREATED_AT);
    const failed = transitionJob(
      running,
      {
        kind: "fail",
        failure: {
          code: "provider-timeout",
          message: "Provider did not respond",
          retryable: true,
        },
      },
      "2026-11-13T12:03:00Z",
    );

    expect(failed.status).toBe("failed");
    expect(failed.failure).toEqual({
      code: "provider-timeout",
      message: "Provider did not respond",
      retryable: true,
    });
    expect(Object.isFrozen(failed.failure)).toBe(true);
  });

  it.each(["queued", "running"] as const)("can cancel a %s job", (initialStatus) => {
    const initial =
      initialStatus === "running"
        ? transitionJob(queuedJob(), { kind: "start" }, CREATED_AT)
        : queuedJob();

    const cancelled = transitionJob(initial, { kind: "cancel" }, "2026-11-13T12:04:00Z");

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completedAt).toBe("2026-11-13T12:04:00.000Z");
  });

  it("rejects illegal transitions without mutating the job", () => {
    const queued = queuedJob();

    expect(() => transitionJob(queued, { kind: "succeed" }, CREATED_AT)).toThrow(
      InvalidJobTransitionError,
    );
    expect(queued.status).toBe("queued");
    expect(queued.version).toBe(1);
  });

  it("rejects transitions from terminal states", () => {
    const running = transitionJob(queuedJob(), { kind: "start" }, CREATED_AT);
    const succeeded = transitionJob(running, { kind: "succeed" }, CREATED_AT);

    expect(() => transitionJob(succeeded, { kind: "cancel" }, CREATED_AT)).toThrow(
      "cannot cancel a job in succeeded state",
    );
  });

  it.each([0, -1, 101, 1.5])("rejects invalid maxAttempts value %s", (maxAttempts) => {
    expect(() =>
      createJob(
        { queue: "default", type: "demo", maxAttempts },
        { id: "job-001", now: CREATED_AT },
      ),
    ).toThrow("maxAttempts must be an integer between 1 and 100");
  });

  it.each([
    ["queue", ""],
    ["queue", "spaces are invalid"],
    ["type", "bad/type"],
    ["id", "#invalid"],
  ] as const)("rejects invalid %s identifiers", (field, value) => {
    const input = {
      queue: field === "queue" ? value : "default",
      type: field === "type" ? value : "demo",
    };
    const context = {
      id: field === "id" ? value : "job-001",
      now: CREATED_AT,
    };

    expect(() => createJob(input, context)).toThrow();
  });
});
