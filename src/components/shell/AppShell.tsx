import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div id="app-root" className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-3 pt-5 pb-10 sm:px-5 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
