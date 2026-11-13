import type { CreateJobInput, Job } from "../domain/job.js";
import { createJob } from "../domain/job.js";

export interface JobRepository {
  save(job: Job): Promise<void>;
  findById(id: string): Promise<Job | undefined>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(): string;
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
}
