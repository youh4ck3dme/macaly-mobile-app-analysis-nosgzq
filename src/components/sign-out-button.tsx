import { useAuthActions } from "@convex-dev/auth/react";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const { signOut } = useAuthActions();
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className={cn(
        "rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
        className,
      )}
    >
      Odhlásiť sa
    </button>
  );
}
