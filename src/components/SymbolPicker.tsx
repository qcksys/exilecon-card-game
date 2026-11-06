import { Minus } from "lucide-react";
import { SYMBOL_INFO, SYMBOLS, type SymbolCounts, type SymbolId } from "../lib/game";
import { SymbolIcon } from "./SymbolIcon";

/** Tap a symbol to add one, tap "−" to remove one. Built for thumbs. */
export function SymbolPicker({
    value,
    onChange,
    highlight = false,
}: {
    value: SymbolCounts;
    onChange: (next: SymbolCounts) => void;
    highlight?: boolean;
}) {
    const set = (s: SymbolId, n: number) => {
        const next: SymbolCounts = { ...value };
        if (n <= 0) delete next[s];
        else next[s] = n;
        onChange(next);
    };
    return (
        <div
            className={`grid grid-cols-4 gap-2 rounded-xl p-1 sm:grid-cols-7 ${highlight ? "ring-2 ring-amber-400/70" : ""}`}
        >
            {SYMBOLS.map((s) => {
                const n = value[s] ?? 0;
                return (
                    <div key={s} className="flex flex-col items-center gap-1">
                        <button
                            type="button"
                            onClick={() => set(s, n + 1)}
                            className={`relative flex h-14 w-full items-center justify-center rounded-xl border transition-colors ${
                                n > 0 ? "border-gold bg-panel-2" : "border-edge bg-panel"
                            }`}
                            aria-label={`Add ${SYMBOL_INFO[s].label}`}
                        >
                            <SymbolIcon symbol={s} size={32} />
                            {n > 0 ? (
                                <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-gold px-1 text-sm font-bold text-ink">
                                    {n}
                                </span>
                            ) : null}
                        </button>
                        <button
                            type="button"
                            onClick={() => set(s, n - 1)}
                            disabled={n === 0}
                            className="flex h-7 w-full items-center justify-center rounded-lg border border-edge text-muted disabled:opacity-25"
                            aria-label={`Remove ${SYMBOL_INFO[s].label}`}
                        >
                            <Minus size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export function NumberStepper({
    value,
    onChange,
    label,
}: {
    value: number;
    onChange: (n: number) => void;
    label: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{label}</span>
            <button
                type="button"
                className="h-10 w-10 rounded-lg border border-edge bg-panel text-lg"
                onClick={() => onChange(Math.max(0, value - 1))}
                aria-label={`Decrease ${label}`}
            >
                −
            </button>
            <span className="w-8 text-center text-xl font-bold">{value}</span>
            <button
                type="button"
                className="h-10 w-10 rounded-lg border border-edge bg-panel text-lg"
                onClick={() => onChange(value + 1)}
                aria-label={`Increase ${label}`}
            >
                +
            </button>
        </div>
    );
}
