"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AddPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/open?action=add");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-slate-500 font-medium">
      Redirecting to Payments Hub...
    </div>
  );
}
