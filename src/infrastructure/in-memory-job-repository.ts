import type { JobRepository } from "../application/job-service.js";
import type { Job } from "../domain/job.js";

export class InMemoryJobRepository implements JobRepository {
  readonly #jobs = new Map<string, Job>();

  public async save(job: Job): Promise<void> {
    this.#jobs.set(job.id, job);
  }

  public async findById(id: string): Promise<Job | undefined> {
    return this.#jobs.get(id);
  }
}
