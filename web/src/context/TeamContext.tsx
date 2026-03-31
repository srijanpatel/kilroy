import { createContext, useContext } from 'react';

const TeamContext = createContext<string | null>(null);

export function TeamProvider({ team, children }: { team: string; children: React.ReactNode }) {
  return <TeamContext.Provider value={team}>{children}</TeamContext.Provider>;
}

export function useTeam(): string {
  const team = useContext(TeamContext);
  if (!team) throw new Error('useTeam() must be used within a TeamProvider');
  return team;
}

/**
 * Returns a function that prefixes paths with the team slug.
 * Usage: const tp = useTeamPath(); navigate(tp('/post/123'));
 */
export function useTeamPath(): (path: string) => string {
  const team = useTeam();
  return (path: string) => `/${team}${path.startsWith('/') ? path : '/' + path}`;
}
