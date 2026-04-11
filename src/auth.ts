import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";
import { getProjectByAuthUserId } from "./members/registry";

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
      allowDynamicClientRegistration: true,
      customAccessTokenClaims: async ({ user, scopes }) => {
        const projectScope = (scopes || []).find((s: string) => s.startsWith("project:"));
        if (!projectScope) return {};

        const [, projectId, accountSlug, projectSlug] = projectScope.split(":");

        // Validate that the authenticated user is actually a member of this project.
        // The scope is client-controlled — without this check, a crafted scope could
        // produce a JWT with claims for a project the user doesn't belong to.
        if (!user?.id) return {};
        const membership = await getProjectByAuthUserId(user.id, projectId);
        if (!membership) return {};

        return { projectId, accountSlug, projectSlug };
      },
    }),
  ],
});
