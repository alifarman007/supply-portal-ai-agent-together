"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePermission } from "@/lib/rbac";

/** Route-level guard: redirects away if the acting role lacks `permission`. */
export function RequirePermission({
  permission,
  redirectTo,
  children,
}: {
  permission: string;
  redirectTo: string;
  children: React.ReactNode;
}) {
  const allowed = usePermission(permission);
  const router = useRouter();

  useEffect(() => {
    if (!allowed) {
      toast.error("You don't have permission to access this page.");
      router.replace(redirectTo);
    }
  }, [allowed, redirectTo, router]);

  if (!allowed) return null;
  return <>{children}</>;
}
