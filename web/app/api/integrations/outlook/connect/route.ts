import { makeConnectHandler } from "@/lib/oauth-connect";
import { OUTLOOK_SCOPES } from "@/lib/msgraph";

export const GET = makeConnectHandler({
  provider: "outlook",
  scopes: OUTLOOK_SCOPES,
  callbackPath: "/api/integrations/outlook/callback",
});
