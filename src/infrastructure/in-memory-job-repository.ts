import type { JobListFilter, JobRepository } from "../application/job-service.js";
import type { Job } from "../domain/job.js";

export class InMemoryJobRepository implements JobRepository {
  readonly #jobs = new Map<string, Job>();

  public async save(job: Job): Promise<void> {
    this.#jobs.set(job.id, job);
  }

  public async findById(id: string): Promise<Job | undefined> {
    return this.#jobs.get(id);
  }

  public async list(filter: JobListFilter = {}): Promise<readonly Job[]> {
    return [...this.#jobs.values()]
      .filter((job) => !filter.queue || job.queue === filter.queue)
      .filter((job) => !filter.status || job.status === filter.status)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
  }
}
