import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  ACCOUNT_DELETION_EXPECTED_USER_HEADER,
  deleteValidatedAccount,
  parseBearerToken,
  resolveAccountDeletionConfig,
} from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVER_AUTH_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
} as const;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function unauthorizedResponse(): NextResponse {
  return jsonResponse(
    { ok: false, error: "Unauthorized." },
    401,
  );
}

function unavailableResponse(): NextResponse {
  return jsonResponse(
    {
      ok: false,
      error: "Account deletion is currently unavailable.",
    },
    503,
  );
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const config = resolveAccountDeletionConfig({
    enabled: process.env.TIMLEY_ACCOUNT_DELETION_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (config.kind !== "configured") {
    return unavailableResponse();
  }

  const token = parseBearerToken(
    request.headers.get("authorization"),
  );
  if (!token) {
    return unauthorizedResponse();
  }
  const expectedUserId = request.headers.get(
    ACCOUNT_DELETION_EXPECTED_USER_HEADER,
  );
  if (!expectedUserId) {
    return unauthorizedResponse();
  }

  try {
    const publicClient = createClient(
      config.url,
      config.publicKey,
      SERVER_AUTH_OPTIONS,
    );
    let adminClient: SupabaseClient | null = null;
    const getAdminClient = (): SupabaseClient => {
      adminClient ??= createClient(
        config.url,
        config.serviceRoleKey,
        SERVER_AUTH_OPTIONS,
      );
      return adminClient;
    };

    const result = await deleteValidatedAccount(
      token,
      expectedUserId,
      {
      getUser: (accessToken) =>
        publicClient.auth.getUser(accessToken),
      signOut: async (accessToken, scope) => {
        const { error } =
          await getAdminClient().auth.admin.signOut(
            accessToken,
            scope,
          );
        return { error };
      },
      deleteUser: async (userId) => {
        const { error } =
          await getAdminClient().auth.admin.deleteUser(userId);
        return { error };
      },
      },
    );

    if (!result.ok) {
      return result.code === "unauthorized"
        ? unauthorizedResponse()
        : unavailableResponse();
    }
    return jsonResponse({ ok: true }, 200);
  } catch {
    return unavailableResponse();
  }
}
