import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, Moon, Monitor, Sun, Settings as SettingsIcon, User, Bell, Shield, MailCheck, Lock, CheckCircle2, AlertCircle } from "lucide-react";

import { api } from "../../convex/_generated/api";
import siteMetadata from "../metadata.json";
import { AppLayout } from "../components/app-layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const SITE_ORIGIN = "https://nosgzqflza19pn0bs55f4iba.macaly.app";

export const Route = createFileRoute("/settings")({
  head: () => {
    const page = siteMetadata["/settings"];
    return {
      meta: [
        { title: page.title },
        { name: "description", content: page.description },
        { property: "og:title", content: page.title },
        { property: "og:description", content: page.description },
        { property: "og:image", content: siteMetadata.default?.openGraph?.images },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `${SITE_ORIGIN}/settings` }],
    };
  },
  component: SettingsPage,
});

type Theme = "system" | "light" | "dark";
type FeedbackState = "idle" | "saving" | "saved" | "error";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Monitor; hint: string }[] = [
  { value: "system", label: "Systém", icon: Monitor, hint: "Nasleduje nastavenie zariadenia" },
  { value: "light", label: "Svetlý", icon: Sun, hint: "Vždy svetlý vzhľad" },
  { value: "dark", label: "Tmavý", icon: Moon, hint: "Vždy tmavý vzhľad" },
];

function Feedback({ state, savedText, errorText }: { state: FeedbackState; savedText: string; errorText: string | null }) {
  if (state === "saving") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Ukladám…
      </p>
    );
  }
  if (state === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-primary" role="status">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {savedText}
      </p>
    );
  }
  if (state === "error") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertCircle className="size-3.5" aria-hidden />
        {errorText ?? "Uloženie sa nepodarilo. Skúste to znova."}
      </p>
    );
  }
  return null;
}

function SettingsPage() {
  const result = useQuery(api.settings.getMySettings, {});
  const updateProfile = useMutation(api.settings.updateProfile);
  const savePreferences = useMutation(api.settings.savePreferences);
  const { signOut } = useAuthActions();

  // Local form state, synced from the server once data arrives.
  const [name, setName] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<FeedbackState>("idle");
  const [profileError, setProfileError] = useState<string | null>(null);

  const [notificationEmail, setNotificationEmail] = useState<boolean | null>(null);
  const [notifFeedback, setNotifFeedback] = useState<FeedbackState>("idle");
  const [notifError, setNotifError] = useState<string | null>(null);

  const [theme, setTheme] = useState<Theme | null>(null);
  const [themeFeedback, setThemeFeedback] = useState<FeedbackState>("idle");
  const [themeError, setThemeError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const initializedRef = useRef(false);

  // Sync server data into local state exactly once per load.
  if (result?.ok && !initializedRef.current) {
    initializedRef.current = true;
    setName(result.profile.displayName);
    setNotificationEmail(result.settings.notificationEmail);
    setTheme(result.settings.theme);
  }
  // Reset so a fresh auth session re-initializes local state.
  useEffect(() => {
    if (result && !result.ok) {
      initializedRef.current = false;
    }
  }, [result]);

  // Apply the theme in effects only, so SSR output matches the first client render.
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const effective = theme === "system" ? (mql.matches ? "dark" : "light") : theme;
      root.classList.toggle("dark", effective === "dark");
    };

    apply();
    if (theme === "system") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
  }, [theme]);

  if (result === undefined) {
    return (
      <AppLayout>
        <div
          data-testid="settings-page"
          data-state="loading"
          className="flex min-h-[50vh] items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Načítavam nastavenia…</span>
        </div>
      </AppLayout>
    );
  }

  if (!result.ok) {
    return (
      <AppLayout>
        <div
          data-testid="settings-page"
          data-state="error"
          className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center"
          role="alert"
        >
          <Shield className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{result.message}</p>
          <p className="text-sm text-muted-foreground">
            Nastavenia sú dostupné len po prihlásení.
          </p>
        </div>
      </AppLayout>
    );
  }

  const email = result.profile.email;
  const serverName = result.profile.displayName;

  const handleSaveProfile = async () => {
    const trimmed = (name ?? "").trim();
    if (!trimmed) {
      setProfileFeedback("error");
      setProfileError("Zobrazované meno nemôže byť prázdne.");
      return;
    }
    setProfileFeedback("saving");
    setProfileError(null);
    try {
      const res = await updateProfile({ displayName: trimmed });
      if (res.ok) {
        setName(res.profile.displayName);
        setProfileFeedback("saved");
      } else {
        setProfileError(res.message);
        setProfileFeedback("error");
      }
    } catch (err) {
      console.error("updateProfile failed", err);
      setProfileError("Uloženie sa nepodarilo. Skúste to znova.");
      setProfileFeedback("error");
    }
  };

  const handleSavePreferences = async (next: {
    notificationEmail?: boolean;
    theme?: Theme;
  }) => {
    const nextEmail = next.notificationEmail ?? notificationEmail ?? false;
    const nextTheme = next.theme ?? theme ?? "system";
    const isTheme = next.theme !== undefined;

    if (isTheme) {
      setThemeFeedback("saving");
      setThemeError(null);
    } else {
      setNotifFeedback("saving");
      setNotifError(null);
    }

    try {
      const res = await savePreferences({
        notificationEmail: nextEmail,
        theme: nextTheme,
      });
      if (res.ok) {
        setNotificationEmail(res.settings.notificationEmail);
        setTheme(res.settings.theme);
        if (isTheme) setThemeFeedback("saved");
        else setNotifFeedback("saved");
      } else {
        if (isTheme) {
          setThemeError(res.message);
          setThemeFeedback("error");
        } else {
          setNotifError(res.message);
          setNotifFeedback("error");
        }
      }
    } catch (err) {
      console.error("savePreferences failed", err);
      const message = "Uloženie sa nepodarilo. Skúste to znova.";
      if (isTheme) {
        setThemeError(message);
        setThemeFeedback("error");
      } else {
        setNotifError(message);
        setNotifFeedback("error");
      }
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      console.error("signOut failed", err);
      setSigningOut(false);
    }
  };

  const nameChanged = (name ?? "") !== serverName;

  return (
    <AppLayout>
      <div data-testid="settings-page" data-state="ready" className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-6 text-primary" aria-hidden />
            <h1 className="text-2xl font-bold tracking-tight">Nastavenia</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Správa profilu, upozornení a zobrazenia aplikácie.
          </p>
        </div>

        {/* Profil */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-4 text-primary" aria-hidden />
              Profil
            </CardTitle>
            <CardDescription>Vaše meno sa zobrazuje v aplikácii.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-display-name">Zobrazované meno</Label>
              <Input
                id="settings-display-name"
                data-testid="settings-display-name"
                value={name ?? ""}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vaše meno"
                autoComplete="name"
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">E-mail</Label>
              <div
                data-testid="settings-email-readonly"
                id="settings-email"
                className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-muted/50 px-3 text-sm text-muted-foreground"
                aria-readonly="true"
              >
                <Lock className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{email || "Nie je dostupný"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                E-mail je súčasť vášho prihlásenia a z bezpečnostných dôvodov ho nie je možné tu upraviť.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                data-testid="settings-save-profile"
                onClick={() => void handleSaveProfile()}
                disabled={profileFeedback === "saving" || !nameChanged || !(name ?? "").trim()}
              >
                {profileFeedback === "saving" && (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                )}
                Uložiť meno
              </Button>
              <Feedback
                state={profileFeedback}
                savedText="Meno bolo uložené."
                errorText={profileError}
              />
            </div>
          </CardContent>
        </Card>

        {/* Upozornenia */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4 text-primary" aria-hidden />
              Upozornenia
            </CardTitle>
            <CardDescription>
              Nastavte, či chcete dostávať e-mailové upozornenia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <Label
                  htmlFor="settings-notification-email"
                  className="text-sm font-medium"
                >
                  E-mailové upozornenia
                </Label>
                <p className="text-xs text-muted-foreground">
                  Vaša voľba sa uloží do profilu a určuje, či majú byť upozornenia na e-mail
                  doručované. Žiadna skúšobná správa sa pri zmene neposiela.
                </p>
              </div>
              <Switch
                id="settings-notification-email"
                data-testid="settings-notification-switch"
                checked={notificationEmail ?? false}
                disabled={notifFeedback === "saving"}
                onCheckedChange={(checked) => void handleSavePreferences({ notificationEmail: checked })}
                aria-label="E-mailové upozornenia"
              />
            </div>
            <Feedback
              state={notifFeedback}
              savedText="Preferencie boli uložené."
              errorText={notifError}
            />
          </CardContent>
        </Card>

        {/* Zobrazenie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="size-4 text-primary" aria-hidden />
              Zobrazenie
            </CardTitle>
            <CardDescription>
              Vyberte si svetlý, tmavý alebo automatický vzhľad podľa systému.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              data-testid="settings-theme-group"
              value={theme ?? "system"}
              onValueChange={(value) => void handleSavePreferences({ theme: value as Theme })}
              className="grid gap-3 sm:grid-cols-3"
              aria-label="Vzhľad aplikácie"
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <Label
                    key={option.value}
                    htmlFor={`settings-theme-${option.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`settings-theme-${option.value}`}
                      data-testid={`settings-theme-${option.value}`}
                      className="mt-0.5"
                    />
                    <span className="space-y-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Icon className="size-3.5" aria-hidden />
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
            <Feedback
              state={themeFeedback}
              savedText="Vzhľad bol uložený."
              errorText={themeError}
            />
          </CardContent>
        </Card>

        {/* Bezpečnosť */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4 text-primary" aria-hidden />
              Bezpečnosť
            </CardTitle>
            <CardDescription>
              Prihlásenie a správa prístupu k účtu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <MailCheck className="size-5 shrink-0 text-primary" aria-hidden />
              <div className="space-y-1">
                <p className="text-sm font-medium">Prihlásenie jednorazovým kódom</p>
                <p className="text-xs text-muted-foreground">
                  Na prihlásenie sa používa jednorazový kód poslaný na váš e-mail
                  {" "}
                  <span className="font-medium text-foreground">{email || "—"}</span>.
                  Heslo sa nepoužíva a e-mail prihlasovacej identity tu nemožno zmeniť.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              data-testid="settings-sign-out"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
            >
              {signingOut && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {signingOut ? "Odhlasujem…" : "Odhlásiť sa"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
