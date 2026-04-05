const STORAGE_KEY = 'kilroy_teams';

export function getKnownTeams(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const teams = JSON.parse(raw);
    return Array.isArray(teams) ? teams : [];
  } catch {
    return [];
  }
}

export function trackTeam(slug: string) {
  const teams = getKnownTeams();
  if (teams.includes(slug)) return;
  teams.unshift(slug);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}
