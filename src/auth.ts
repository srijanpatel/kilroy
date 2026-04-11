import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";
import { getProjectByAuthUserId } from "./members/registry";
import { getPendingProject } from "./pending-projects";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  tablePrefix: "ba_",
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/consent",
      scopes: ["kilroy:access"],
      clientRegistrationDefaultScopes: ["kilroy:access"],
      validAudiences: [
        process.env.BETTER_AUTH_URL!,
        `${process.env.BETTER_AUTH_URL!}/mcp`,
      ],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      silenceWarnings: { oauthAuthServerConfig: true },
      postLogin: {
        page: "/consent",
        shouldRedirect: () => false,
        consentReferenceId: ({ session }) => {
          const project = getPendingProject(session.id);
          if (!project) return undefined;
          return JSON.stringify(project);
        },
      },
      customAccessTokenClaims: async ({ user, referenceId }) => {
        if (!referenceId || !user?.id) return {};

        let project;
        try {
          project = JSON.parse(referenceId);
        } catch {
          return {};
        }

        const { projectId, accountSlug, projectSlug } = project;
        if (!projectId || !accountSlug || !projectSlug) return {};

        const membership = await getProjectByAuthUserId(user.id, projectId);
        if (!membership) return {};

        return { projectId, accountSlug, projectSlug };
      },
    }),
  ],
});
