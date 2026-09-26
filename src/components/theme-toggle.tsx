"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const THEME_EVENT = "aisa-theme";

/**
 * The theme lives in localStorage and on the document element, both of which
 * exist only in the browser. Treating localStorage as an external store lets
 * useSyncExternalStore render the server snapshot during SSR and hydration, then
 * swap to the real value, with no setState round trip.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
};

const readTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_EVENT) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
};

export function useTheme() {
  const theme = React.useSyncExternalStore<Theme>(subscribe, readTheme, () => "light");
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const setTheme = React.useCallback((next: Theme) => {
    localStorage.setItem(THEME_EVENT, next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle, mounted };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, mounted } = useTheme();

  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-secondary",
        className,
      )}
      aria-label={mounted && theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title="Toggle colour theme"
    >
      <span className={cn("text-sm", !mounted && "opacity-0")}>
        {mounted && theme === "dark" ? "\u2600" : "\u263D"}
      </span>
    </button>
  );
}
