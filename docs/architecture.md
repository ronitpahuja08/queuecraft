# Architecture Decisions

## Domain logic stays infrastructure-independent

Job state transitions are pure domain operations. They do not read the system
clock, generate identifiers, write to a database, or publish messages directly.
Those values and effects enter through explicit application interfaces. This
keeps correctness tests fast and lets persistence and queue technologies evolve
without duplicating lifecycle rules.

## Delivery is at least once

The platform will assume a worker may receive a job more than once. Exactly-once
delivery is not promised. Instead, QueueCraft will expose idempotency keys,
durable state transitions, and acknowledgement rules that make repeated
delivery safe and observable.

## Job ownership uses leases

Workers will claim jobs for a bounded interval and renew that lease with a
heartbeat. A crashed worker eventually loses ownership, allowing another worker
to recover the job. Updates will verify the lease owner and record version to
prevent a stale worker from overwriting a newer result.

## Failure is persisted as data

Attempts, errors, retry timing, cancellation, and dead-letter decisions will be
stored as structured state. Operators should be able to explain why a job is in
its current state without reconstructing the answer from application logs.
