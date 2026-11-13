export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface Job {
  readonly id: string;
  readonly queue: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failure?: JobFailure;
}

export interface CreateJobInput {
  readonly queue: string;
  readonly type: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly maxAttempts?: number;
}

export type JobCommand =
  | { readonly kind: "start" }
  | { readonly kind: "succeed" }
  | { readonly kind: "cancel" }
  | { readonly kind: "fail"; readonly failure: JobFailure };

export interface JobCreationContext {
  readonly id: string;
  readonly now: string;
}

export class InvalidJobTransitionError extends Error {
  public constructor(status: JobStatus, command: JobCommand["kind"]) {
    super(`cannot ${command} a job in ${status} state`);
    this.name = "InvalidJobTransitionError";
  }
}

export function createJob(input: CreateJobInput, context: JobCreationContext): Job {
  const queue = requireName(input.queue, "queue");
  const type = requireName(input.type, "type");
  const id = requireName(context.id, "id");
  const now = requireTimestamp(context.now, "now");
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new RangeError("maxAttempts must be an integer between 1 and 100");
  }

  return freezeJob({
    id,
    queue,
    type,
    payload: Object.freeze({ ...(input.payload ?? {}) }),
    status: "queued",
    attempts: 0,
    maxAttempts,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

export function transitionJob(job: Job, command: JobCommand, now: string): Job {
  const timestamp = requireTimestamp(now, "now");
  switch (command.kind) {
    case "start":
      requireStatus(job, command.kind, "queued");
      return freezeJob({
        ...job,
        status: "running",
        attempts: job.attempts + 1,
        version: job.version + 1,
        startedAt: timestamp,
        updatedAt: timestamp,
      });
    case "succeed":
      requireStatus(job, command.kind, "running");
      return freezeJob({
        ...job,
        status: "succeeded",
        version: job.version + 1,
        completedAt: timestamp,
        updatedAt: timestamp,
      });
    case "fail": {
      requireStatus(job, command.kind, "running");
      const failure = validateFailure(command.failure);
      return freezeJob({
        ...job,
        status: "failed",
        version: job.version + 1,
        completedAt: timestamp,
        failure,
        updatedAt: timestamp,
      });
    }
    case "cancel":
      if (job.status !== "queued" && job.status !== "running") {
        throw new InvalidJobTransitionError(job.status, command.kind);
      }
      return freezeJob({
        ...job,
        status: "cancelled",
        version: job.version + 1,
        completedAt: timestamp,
        updatedAt: timestamp,
      });
  }
}

function requireStatus(job: Job, command: JobCommand["kind"], expected: JobStatus): void {
  if (job.status !== expected) {
    throw new InvalidJobTransitionError(job.status, command);
  }
}

function requireName(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new TypeError(`${field} must contain between 1 and 128 characters`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized)) {
    throw new TypeError(`${field} contains unsupported characters`);
  }
  return normalized;
}

function requireTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`${field} must be an ISO-8601 timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

function validateFailure(failure: JobFailure): JobFailure {
  const code = requireName(failure.code, "failure code");
  const message = failure.message.trim();
  if (!message || message.length > 2_000) {
    throw new TypeError("failure message must contain between 1 and 2000 characters");
  }
  return Object.freeze({ code, message, retryable: failure.retryable });
}

function freezeJob(job: Job): Job {
  return Object.freeze(job);
}
