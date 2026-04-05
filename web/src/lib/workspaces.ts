const STORAGE_KEY = 'kilroy_workspaces';

export function getKnownWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const workspaces = JSON.parse(raw);
    return Array.isArray(workspaces) ? workspaces : [];
  } catch {
    return [];
  }
}

export function trackWorkspace(slug: string) {
  if (slug === '_') return;
  const workspaces = getKnownWorkspaces();
  if (workspaces.includes(slug)) return;
  workspaces.unshift(slug);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}
