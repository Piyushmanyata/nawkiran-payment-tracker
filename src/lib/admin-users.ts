/**
 * Admin user provisioning — ONLY place SUPABASE_SERVICE_ROLE_KEY may appear.
 * ADR-0007 three fences: one module, DB-verified admin, creatable roles capped.
 */
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/utils/supabase/server";
import type { Company, UserRole } from "@/types/database";

const CREATABLE_ROLES = ["employee", "supervisor"] as const;
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export function isCreatableRole(role: string): role is CreatableRole {
  return (CREATABLE_ROLES as readonly string[]).includes(role);
}

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SERVICE_ROLE_NOT_CONFIGURED");
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Load caller's profile from DB via their session — never trust client role. */
export async function requireAdminProfile() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    throw err;
  }

  const { data: profile, error } = await userClient
    .from("profiles")
    .select("id, full_name, role, company, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.active || profile.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

function randomTempPassword(): string {
  // Unambiguous alphabet; long enough for temporary hand-off.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const limit = 256 - (256 % chars.length);
  let out = "";
  while (out.length < 16) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit) out += chars[b % chars.length];
      if (out.length === 16) break;
    }
  }
  return out;
}

export type CreateStaffInput = {
  email: string;
  fullName: string;
  role: CreatableRole;
  company?: Company | null;
};

export type CreateStaffResult = {
  id: string;
  email: string;
  fullName: string;
  role: CreatableRole;
  company: Company | null;
  temporaryPassword: string;
};

export async function createStaffUser(
  input: CreateStaffInput
): Promise<CreateStaffResult> {
  await requireAdminProfile();

  if (!isCreatableRole(input.role)) {
    throw new Error("INVALID_ROLE");
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !fullName) throw new Error("INVALID_INPUT");

  let company: Company | null = null;
  if (input.role === "supervisor") {
    const c = String(input.company ?? "").toUpperCase();
    if (c !== "NKPL" && c !== "APTUS") throw new Error("COMPANY_REQUIRED");
    company = c;
  }

  const temporaryPassword = randomTempPassword();
  const admin = serviceRoleClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, must_change_password: true },
    app_metadata: { must_change_password: true },
  });

  if (createErr || !created.user) {
    throw new Error(createErr?.message || "AUTH_CREATE_FAILED");
  }

  const userId = created.user.id;

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    role: input.role as UserRole,
    company,
    active: true,
  });

  if (profileErr) {
    // Atomic in effect: never leave an auth user without a profile.
    await admin.auth.admin.deleteUser(userId);
    throw new Error(profileErr.message || "PROFILE_CREATE_FAILED");
  }

  return {
    id: userId,
    email,
    fullName,
    role: input.role,
    company,
    temporaryPassword,
  };
}

export async function setStaffActive(
  userId: string,
  active: boolean
): Promise<void> {
  await requireAdminProfile();
  if (!userId) throw new Error("INVALID_INPUT");

  const admin = serviceRoleClient();

  const { data: target, error: loadErr } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (loadErr || !target) throw new Error("NOT_FOUND");
  // Never deactivate another admin/director via this route.
  if (target.role === "admin" || target.role === "director") {
    throw new Error("FORBIDDEN");
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", userId);
  if (updErr) throw new Error(updErr.message || "UPDATE_FAILED");

  if (active) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  } else {
    // Revoke sessions + ban login (ADR-0008).
    await admin.auth.admin.signOut(userId, "global");
    await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
  }
}

export async function listStaffProfiles() {
  await requireAdminProfile();
  const userClient = await createUserClient();
  const { data, error } = await userClient
    .from("profiles")
    .select("id, full_name, role, company, active, created_at")
    .order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
