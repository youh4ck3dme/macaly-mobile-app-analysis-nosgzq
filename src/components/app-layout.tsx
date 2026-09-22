import { SignOutButton } from "./sign-out-button";
import { BottomNav } from "./bottom-nav";
import { SwipeNavigationProvider } from "./swipe-navigation-provider";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SwipeNavigationProvider>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">
                ForenzDetectiv
              </span>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Správa vyšetrovacích prípadov
              </span>
            </div>
            <SignOutButton />
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-6 pb-28">
          {children}
        </main>

        <BottomNav />
      </div>
    </SwipeNavigationProvider>
  );
}
