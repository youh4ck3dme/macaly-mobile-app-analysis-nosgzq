import { Link, useLocation } from "@tanstack/react-router";
import {
  FolderKanban,
  Network,
  Archive,
  Bot,
  Settings,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { id: "cases", to: "/", label: "Prípady", icon: FolderKanban },
  { id: "graph", to: "/graph", label: "Graf", icon: Network },
  { id: "archive", to: "/archive", label: "Archív", icon: Archive },
  { id: "sherlock", to: "/sherlock", label: "Sherlock", icon: Bot },
  { id: "settings", to: "/settings", label: "Nastavenia", icon: Settings },
  { id: "sandbox", to: "/sandbox", label: "Sandbox", icon: FlaskConical },
];

export function BottomNav() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-between px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.to;
          return (
            <Link
              key={item.id}
              to={item.to}
              data-testid={`nav-${item.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors duration-200",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="pointer-events-none absolute -top-px h-0.5 w-8 rounded-full bg-primary opacity-0 transition-opacity duration-200 group-hover:opacity-40 data-[active=true]:opacity-100" data-active={isActive} />
              <span
                data-active={isActive}
                className={cn(
                  "relative flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5",
                  isActive && "scale-110",
                )}
              >
                <span
                  data-active={isActive}
                  className="absolute inline-flex h-6 w-6 rounded-full bg-primary/15 opacity-0 blur-sm transition-opacity duration-300 data-[active=true]:opacity-100"
                />
                <Icon
                  strokeWidth={isActive ? 2.4 : 1.8}
                  className={cn(
                    "relative size-6 transition-all duration-200 group-hover:scale-110",
                    isActive && "animate-pulse-soft",
                  )}
                />
              </span>
              <span
                className={cn(
                  "truncate text-[11px] leading-none transition-colors duration-200",
                  isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
