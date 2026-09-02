"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { useAuth } from "@/store/auth";

export function AppLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthed = useAuth((s) => s.isAuthed);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthed) router.replace("/login");
  }, [isAuthed, router]);

  if (!isAuthed) return null;

  return <AppShell>{children}</AppShell>;
}
