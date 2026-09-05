import { makeCallbackHandler } from "@/lib/oauth-connect";
import { TEAMS_SCOPES } from "@/lib/msgraph";

export const GET = makeCallbackHandler({
  provider: "teams",
  scopes: TEAMS_SCOPES,
  callbackPath: "/api/integrations/teams/callback",
});
