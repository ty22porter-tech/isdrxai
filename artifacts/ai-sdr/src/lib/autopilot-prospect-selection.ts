const keyForUser = (userId: string) => `autopilot:prospect-selection:${userId}`;

type SavedSelection = {
  prospectIds: number[];
  savedAt: number;
};

export function readAutopilotProspectSelection(userId: string): number[] {
  try {
    const raw = localStorage.getItem(keyForUser(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSelection;
    if (!Array.isArray(parsed.prospectIds)) return [];
    return [...new Set(parsed.prospectIds.filter((id) => Number.isInteger(id) && id > 0))];
  } catch {
    return [];
  }
}

export function addToAutopilotProspectSelection(userId: string, prospectIds: number[]) {
  const current = readAutopilotProspectSelection(userId);
  const next = [...new Set([...current, ...prospectIds.filter((id) => Number.isInteger(id) && id > 0)])];
  try {
    localStorage.setItem(keyForUser(userId), JSON.stringify({ prospectIds: next, savedAt: Date.now() }));
  } catch {
    // Prospect creation still succeeds if browser storage is unavailable.
  }
}

export function clearAutopilotProspectSelection(userId: string) {
  try {
    localStorage.removeItem(keyForUser(userId));
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}