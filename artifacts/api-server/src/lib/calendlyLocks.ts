import { createAdvisoryLockPool } from "@workspace/db";

// Long-running provider requests must not hold every connection in the normal
// query pool while waiting for a second connection to perform database work.
// Separate bounded pools also prevent sync locks from starving invitee locks.
export const calendlySyncLocks = createAdvisoryLockPool();
export const calendlyInviteeLocks = createAdvisoryLockPool();