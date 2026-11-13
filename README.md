# QueueCraft

QueueCraft is a production-minded distributed job orchestration platform. It
accepts background jobs through an HTTP API, coordinates workers through
durable leases, and makes retries, cancellation, scheduling, and failures
observable instead of hiding them inside application code.

The project is intentionally built in vertical slices. Every stage adds a
working capability, tests its failure modes, and records the operational
tradeoffs behind the design.

## Planned capabilities

- Typed job submission and lifecycle APIs.
- PostgreSQL-backed job state and idempotency keys.
- Redis or NATS-based worker delivery.
- Leases, heartbeats, timeouts, and abandoned-job recovery.
- Configurable retries, exponential backoff, and dead-letter queues.
- Scheduled and recurring jobs.
- Worker concurrency and per-queue rate limits.
- OpenTelemetry traces, structured logs, and Prometheus metrics.
- A TypeScript dashboard for live job and worker inspection.
- Docker Compose, load tests, and failure-injection scenarios.

## Initial architecture

```text
Client -> HTTP API -> Job service -> Job repository
                         |
                         +-> Queue -> Worker pool
                                      |
                                      +-> lease / heartbeat / result
```

The first milestone uses an in-memory repository so the job contract and state
machine can be proven before PostgreSQL and a message broker are introduced.
Storage and delivery live behind interfaces so later infrastructure changes do
not rewrite domain behavior.

## Development direction

QueueCraft targets current Node.js releases and strict TypeScript. The API and
worker processes will be independently deployable, but share the same domain
package and test suite.

See [ROADMAP.md](ROADMAP.md) for the staged build plan and
[docs/architecture.md](docs/architecture.md) for the design constraints.

## Local development

```bash
npm install
npm run check
npm run typecheck
npm test
npm run build
```

Node.js 24 or newer is required. Runtime secrets and local environment files
are intentionally excluded from version control.

Start the initial in-memory API with:

```bash
npm run dev
```

Then submit and inspect a job:

```bash
curl -X POST http://127.0.0.1:3000/v1/jobs \
  -H "content-type: application/json" \
  -d '{"queue":"emails","type":"welcome-email","payload":{"recipient":"user@example.com"}}'

curl http://127.0.0.1:3000/v1/jobs/<job-id>
```

## License

QueueCraft is available under the [MIT License](LICENSE).
