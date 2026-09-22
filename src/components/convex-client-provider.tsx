import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useMemo } from "react";

/**
 * Vite exposes only `VITE_*` variables to client and SSR bundles.
 * `npx convex dev` writes this key into `.env.local`.
 */
function readConvexUrl(): string | null {
  const value = import.meta.env.VITE_CONVEX_URL;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Constructing ConvexReactClient without an address throws during module
// init ("No address provided to ConvexReactClient") and TanStack Start turns
// that into an unhandled HTTP 500 before any route UI can render.
function createConvexClient(url: string | null): ConvexReactClient | null {
  if (!url) return null;
  try {
    return new ConvexReactClient(url);
  } catch (error) {
    console.info(
      error instanceof Error ? error.message : "Convex client failed to start",
    );
    return null;
  }
}

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const convexUrl = readConvexUrl();
  const convex = useMemo(() => createConvexClient(convexUrl), [convexUrl]);

  if (!convex) {
    return <MissingConvexUrlScreen />;
  }

  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}

function MissingConvexUrlScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Chýba VITE_CONVEX_URL — spusti convex dev
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Do <code className="font-mono">.env.local</code> nastav{" "}
        <code className="font-mono">VITE_CONVEX_URL</code> na adresu z príkazu{" "}
        <code className="font-mono">npx convex dev</code> a reštartuj{" "}
        <code className="font-mono">npm run dev</code>.
      </p>
    </div>
  );
}
