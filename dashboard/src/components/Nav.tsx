import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn";

interface NavRoute {
  to: string;
  label: string;
  end?: boolean;
}

const routes: NavRoute[] = [
  { to: "/", label: "Explorer", end: true },
  { to: "/compare", label: "Compare" },
  { to: "/pivot", label: "Pivot" },
  { to: "/simulator", label: "Simulator" },
  { to: "/timeline", label: "Timeline" },
];

export function Nav(): JSX.Element {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all",
        scrolled && "border-b border-ink-300/30 bg-ink-0/80 backdrop-blur",
      )}
    >
      <div className="container-x flex items-center justify-between py-4">
        <NavLink to="/" end className="flex items-center gap-2.5 font-mono text-sm tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-accent-500 animate-pulse" />
          <span className="text-ink-900">token-price-index</span>
          <span className="text-ink-500">/</span>
          <span className="text-ink-600">pricing</span>
        </NavLink>
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
          {routes.map((route) => (
            <NavLink
              key={route.to}
              to={route.to}
              end={route.end}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-xs transition",
                  isActive
                    ? "bg-ink-200/40 text-ink-900"
                    : "text-ink-600 hover:bg-ink-200/40 hover:text-ink-900",
                )
              }
            >
              {route.label}
            </NavLink>
          ))}
        </nav>
        <a
          href="https://github.com/sjramblings/token-price-index"
          target="_blank"
          rel="noreferrer"
          className="pill transition hover:text-ink-900"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.4c-2.22.48-2.7-1.06-2.7-1.06-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82A7.6 7.6 0 0 1 8 4.5c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          <span>Source</span>
        </a>
      </div>
    </header>
  );
}
