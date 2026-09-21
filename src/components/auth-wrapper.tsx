import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInForm } from "./sign-in-form";

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-muted-foreground">Načítavam…</p>
        </div>
      </AuthLoading>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  );
}
