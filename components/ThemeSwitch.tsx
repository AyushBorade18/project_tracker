import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useApp } from "../lib/store";
import { cx } from "./ui";

const OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "Auto", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
] as const;

/** Light is the default. "Auto" follows the phone or laptop setting. */
export function ThemeSwitch({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { themePref, setThemePref } = useApp();
  return (
    <div role="radiogroup" aria-label="Theme" className={cx("grid grid-cols-3 gap-1 rounded-md p-1", tone === "dark" ? "bg-white/10" : "bg-surface2")}>
      {OPTIONS.map((o) => {
        const Ico = o.icon;
        const on = themePref === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setThemePref(o.id)}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition",
              on ? (tone === "dark" ? "bg-white text-rail" : "bg-surface text-ink shadow-sm") : tone === "dark" ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"
            )}
          >
            <Ico className="h-3.5 w-3.5" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}
