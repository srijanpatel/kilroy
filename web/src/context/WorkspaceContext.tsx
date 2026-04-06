import { createContext, useContext } from 'react';

const WorkspaceContext = createContext<string | null>(null);

export function WorkspaceProvider({ workspace, children }: { workspace: string; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): string {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace() must be used within a WorkspaceProvider');
  return workspace;
}

/**
 * Returns a function that prefixes paths with the workspace slug.
 * Usage: const wp = useWorkspacePath(); navigate(wp('/_/post/123'));
 */
export function useWorkspacePath(): (path: string) => string {
  const workspace = useWorkspace();
  return (path: string) => `/${workspace}${path.startsWith('/') ? path : '/' + path}`;
}
