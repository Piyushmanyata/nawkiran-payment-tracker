import {
  createStaffUser,
  isCreatableRole,
  listStaffProfiles,
  setStaffActive,
} from "@/lib/admin-users";
import type { Company } from "@/types/database";

export const runtime = "nodejs";

function statusFor(message: string): number {
  if (message === "UNAUTHORIZED") return 401;
  if (message === "FORBIDDEN") return 403;
  if (message === "NOT_FOUND") return 404;
  if (
    message === "INVALID_ROLE" ||
    message === "INVALID_INPUT" ||
    message === "COMPANY_REQUIRED"
  ) {
    return 400;
  }
  if (message === "SERVICE_ROLE_NOT_CONFIGURED") return 503;
  return 500;
}

export async function GET() {
  try {
    const profiles = await listStaffProfiles();
    return Response.json({ profiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERROR";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}

export async function POST(request: Request) {
  let body: {
    email?: string;
    fullName?: string;
    role?: string;
    company?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = String(body.role ?? "");
  if (!isCreatableRole(role)) {
    return Response.json(
      { error: "Role must be employee or supervisor" },
      { status: 400 }
    );
  }

  try {
    const result = await createStaffUser({
      email: String(body.email ?? ""),
      fullName: String(body.fullName ?? ""),
      role,
      company: (body.company as Company | null | undefined) ?? null,
    });
    // temporaryPassword returned once — never logged.
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERROR";
    // Never include the temporary password in error responses.
    return Response.json(
      { error: message === "AUTH_CREATE_FAILED" ? "Could not create user" : message },
      { status: statusFor(message) }
    );
  }
}

export async function PATCH(request: Request) {
  let body: { userId?: string; active?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userId || typeof body.active !== "boolean") {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    await setStaffActive(String(body.userId), body.active);
    return new Response(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERROR";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}
