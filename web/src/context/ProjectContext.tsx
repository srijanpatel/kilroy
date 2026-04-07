import { createContext, useContext } from 'react';

interface ProjectContextValue {
  accountSlug: string;
  projectSlug: string;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ accountSlug, projectSlug, children }: {
  accountSlug: string;
  projectSlug: string;
  children: React.ReactNode;
}) {
  return <ProjectContext.Provider value={{ accountSlug, projectSlug }}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject() must be used within a ProjectProvider');
  return ctx;
}

export function useProjectPath(): (path: string) => string {
  const { accountSlug, projectSlug } = useProject();
  return (path: string) =>
    `/${accountSlug}/${projectSlug}${path.startsWith('/') ? path : '/' + path}`;
}
