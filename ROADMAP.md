# QueueCraft Roadmap

## Milestone 1: executable job contracts

- Establish strict TypeScript tooling and CI-ready commands.
- Define immutable job records, commands, and legal state transitions.
- Expose health, job submission, and job inspection endpoints.
- Keep tests deterministic through injected clocks and identifier factories.

## Milestone 2: durable persistence

- Add PostgreSQL migrations and a repository implementation.
- Enforce idempotency keys with database constraints.
- Add optimistic concurrency control for job transitions.
- Prove restart recovery with integration tests.

## Milestone 3: worker delivery

- Introduce queue and worker interfaces.
- Add Redis Streams or NATS JetStream delivery.
- Implement leases, heartbeats, acknowledgement, and redelivery.
- Recover abandoned jobs without executing completed work twice.

## Milestone 4: resilience controls

- Add retry policies, backoff, jitter, and dead-letter handling.
- Add timeouts, cancellation, and graceful worker shutdown.
- Add per-queue concurrency and rate limits.
- Exercise broker and database failures in automated tests.

## Milestone 5: operations and dashboard

- Add OpenTelemetry traces, metrics, and structured logs.
- Build a live TypeScript dashboard for jobs, queues, and workers.
- Add Docker Compose and production deployment guidance.
- Publish load-test results and a repeatable failure demonstration.
