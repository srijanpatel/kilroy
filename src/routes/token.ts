import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { validateMemberKey } from "../members/registry";
import { auth } from "../auth";
import { db } from "../db";
import { accounts } from "../db/schema";
import { signJWT } from "better-auth/plugins";

export const tokenHandler = new Hono();

/**
 * Exchange a member key for a JWT access token.
 *
 * POST /:account/:project/api/token
 * Body: { "key": "klry_proj_..." }
 *
 * Returns: { "access_token": "<jwt>", "token_type": "Bearer" }
 */
tokenHandler.post("/", async (c) => {
  const accountSlug = c.req.param("account")!;
  const projectSlug = c.req.param("project")!;

  let body: { key?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body" }, 400);
  }

  const key = body.key;
  if (!key) {
    return c.json({ error: "missing_key" }, 400);
  }

  const result = await validateMemberKey(accountSlug, projectSlug, key);
  if (!result.valid) {
    return c.json({ error: "invalid_key" }, 401);
  }

  const jwt = await mintProjectJwt(
    result.projectId,
    result.memberAccountId,
    accountSlug,
    projectSlug,
  );

  return c.json({
    access_token: jwt,
    token_type: "Bearer",
  });
});

/**
 * Mint a JWT with project claims, signed with the Better Auth JWKS key.
 *
 * This reuses the same signing infrastructure as the OAuth provider's
 * access tokens, so the root /mcp endpoint's verifyAccessToken will
 * accept these tokens.
 */
export async function mintProjectJwt(
  projectId: string,
  memberAccountId: string,
  accountSlug: string,
  projectSlug: string,
): Promise<string> {
  // Look up the auth user ID from the app account
  const [account] = await db
    .select({ authUserId: accounts.authUserId })
    .from(accounts)
    .where(eq(accounts.id, memberAccountId));

  if (!account) {
    throw new Error(`Account ${memberAccountId} not found`);
  }

  const authContext = await auth.$context;

  // Get JWT plugin options (same way the oauth-provider does)
  const jwtPlugin = authContext.getPlugin("jwt");
  const jwtPluginOptions = jwtPlugin?.options;

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 365 * 24 * 3600; // 1 year — long-lived for install tokens

  const baseUrl = authContext.baseURL;

  const token = await signJWT(
    { context: authContext } as any,
    {
      options: jwtPluginOptions,
      payload: {
        sub: account.authUserId,
        iss: jwtPluginOptions?.jwt?.issuer ?? baseUrl,
        aud: baseUrl,
        iat,
        exp,
        projectId,
        accountSlug,
        projectSlug,
      },
    },
  );

  return token;
}
