"use client";

import { AttendanceSummary } from "@/components/AttendanceSummary";
import { SupervisorAttendance } from "@/components/SupervisorAttendance";
import { useAuth } from "@/components/AuthProvider";
import { PageLoading } from "@/components/PageLoading";

export default function AttendancePage() {
  const { profile, loading } = useAuth();

  // Warm profile cache can show supervisor UI immediately without an extra spinner.
  if (!profile && loading) return <PageLoading />;
  if (!profile) return <PageLoading />;

  if (profile.role === "supervisor") {
    return <SupervisorAttendance profile={profile} />;
  }

  return <AttendanceSummary profile={profile} />;
}
