export const QUEUECRAFT_VERSION = "0.1.0";

export type {
  CreateJobInput,
  Job,
  JobCommand,
  JobCreationContext,
  JobFailure,
  JobStatus,
} from "./domain/job.js";
export {
  createJob,
  InvalidJobTransitionError,
  JOB_STATUSES,
  transitionJob,
} from "./domain/job.js";
