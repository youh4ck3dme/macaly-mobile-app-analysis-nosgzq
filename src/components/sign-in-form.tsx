import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const submitted = formData.get("email") as string;
      setEmail(submitted);
      await signIn("resend-otp", formData);
      setStep("code");
    } catch {
      setError("Odoslanie overovacieho kódu zlyhalo. Skúste to znova.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      await signIn("resend-otp", formData);
      // Úspech: AuthWrapper automaticky zobrazí prihlásený obsah
    } catch {
      setError("Neplatný kód. Skúste to znova.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none disabled:opacity-50";

  const buttonClass =
    "w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors";

  if (step === "code") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={handleCodeSubmit}
          className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground">
              Skontrolujte e-mail
            </h2>
            <p className="text-sm text-muted-foreground">
              Overovací kód sme poslali na {email}
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <input name="email" value={email} type="hidden" />
          <input
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            placeholder="Zadajte 6-miestny kód"
            required
            disabled={isLoading}
            className={inputClass}
          />
          <button type="submit" disabled={isLoading} className={buttonClass}>
            {isLoading ? "Overujem…" : "Overiť kód"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            disabled={isLoading}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Použiť iný e-mail
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleEmailSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">Prihlásenie</h2>
          <p className="text-sm text-muted-foreground">
            Zadajte e-mail a pošleme vám overovací kód.
          </p>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <input
          name="email"
          type="email"
          placeholder="vy@example.com"
          required
          disabled={isLoading}
          className={cn(inputClass)}
        />
        <button type="submit" disabled={isLoading} className={buttonClass}>
          {isLoading ? "Odosielam…" : "Poslať kód"}
        </button>
      </form>
    </div>
  );
}
