import { makeConnectHandler } from "@/lib/oauth-connect";
import { TEAMS_SCOPES } from "@/lib/msgraph";

export const GET = makeConnectHandler({
  provider: "teams",
  scopes: TEAMS_SCOPES,
  callbackPath: "/api/integrations/teams/callback",
});
