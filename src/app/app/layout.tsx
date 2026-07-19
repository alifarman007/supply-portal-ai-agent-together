import { cookies } from "next/headers";
import { AppLayoutClient } from "./layout-client";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get("sfms-sidebar")?.value === "1";

  return (
    <AppLayoutClient sidebarCollapsed={sidebarCollapsed}>
      {children}
    </AppLayoutClient>
  );
}
