import type { CreateJobInput, Job, JobCommand, JobStatus } from "../domain/job.js";
import { createJob, transitionJob } from "../domain/job.js";

export interface JobRepository {
  save(job: Job): Promise<void>;
  findById(id: string): Promise<Job | undefined>;
  list(filter?: JobListFilter): Promise<readonly Job[]>;
}

export interface JobListFilter {
  readonly queue?: string;
  readonly status?: JobStatus;
  readonly limit?: number;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(): string;
}

export class JobNotFoundError extends Error {
  public constructor(id: string) {
    super(`job ${id} was not found`);
    this.name = "JobNotFoundError";
  }
}

export class JobService {
  public constructor(
    private readonly repository: JobRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async submit(input: CreateJobInput): Promise<Job> {
    const job = createJob(input, {
      id: this.ids.next(),
      now: this.clock.now(),
    });
    await this.repository.save(job);
    return job;
  }

  public findById(id: string): Promise<Job | undefined> {
    return this.repository.findById(id);
  }

  public list(filter?: JobListFilter): Promise<readonly Job[]> {
    return this.repository.list(filter);
  }

  public async transition(id: string, command: JobCommand): Promise<Job> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new JobNotFoundError(id);
    }

    const updated = transitionJob(current, command, this.clock.now());
    await this.repository.save(updated);
    return updated;
  }
}
