// Bridge between our consent middleware and Better Auth's consentReferenceId callback.
// Both run within the same HTTP request — the Map just passes data between them.

interface PendingProject {
  projectId: string;
  accountSlug: string;
  projectSlug: string;
}

const store = new Map<string, PendingProject>();

export function setPendingProject(sessionId: string, project: PendingProject) {
  store.set(sessionId, project);
}

export function getPendingProject(sessionId: string): PendingProject | null {
  const entry = store.get(sessionId);
  if (!entry) return null;
  store.delete(sessionId);
  return entry;
}
