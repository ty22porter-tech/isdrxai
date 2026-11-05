import type { HiringEmployer } from "./recruitingJobDiscovery";

export class SearchPaused extends Error {
  constructor(public readonly retryAfterMs: number) { super("Research is waiting for the provider retry window."); }
}

export interface ProspectSearchExecution {
  discovery?: HiringEmployer[];
  checkpoints: Record<string, any>;
  attempts: Record<string, number>;
  saveDiscovery: (employers: HiringEmployer[]) => Promise<void>;
  saveLead: (index: number, lead: any) => Promise<void>;
}
