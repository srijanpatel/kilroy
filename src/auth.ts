import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";

const baseURL =
  process.env.KILROY_URL ??
  `http://localhost:${process.env.KILROY_PORT ?? "7432"}`;

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

const emailPasswordEnabled = process.env.KILROY_EMAIL_PASSWORD !== "false";

export const authConfig = {
  emailPassword: emailPasswordEnabled,
  providers: Object.keys(socialProviders) as Array<"github" | "google">,
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  tablePrefix: "ba_",
  emailAndPassword: {
    enabled: emailPasswordEnabled,
  },
  socialProviders,
  baseURL,
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/consent",
      scopes: ["kilroy:access", "offline_access"],
      clientRegistrationDefaultScopes: ["kilroy:access", "offline_access"],
      validAudiences: [baseURL, `${baseURL}/mcp`],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
  ],
});
