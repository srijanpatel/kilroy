import { getProjectBySlugs } from "../projects/registry";
import { getProjectByAuthUserId } from "../members/registry";

interface ResolvedProject {
  projectId: string;
  memberAccountId: string;
  accountSlug: string;
  projectSlug: string;
}

export async function resolveProject(
  authUserId: string,
  project: string,
): Promise<ResolvedProject> {
  const parts = project.split("/");
  if (parts.length !== 2) {
    throw new Error("project must be in account/slug format");
  }
  const [accountSlug, projectSlug] = parts;

  const projectRecord = await getProjectBySlugs(accountSlug, projectSlug);
  if (!projectRecord) {
    throw new Error(`Project not found: ${project}`);
  }

  const membership = await getProjectByAuthUserId(authUserId, projectRecord.id);
  if (!membership) {
    throw new Error(`Not a member of project: ${project}`);
  }

  return {
    projectId: projectRecord.id,
    memberAccountId: membership.memberAccountId,
    accountSlug,
    projectSlug,
  };
}
