import { Check, X } from "lucide-react";
import { SLOT_LABEL, SYMBOL_INFO, SYMBOLS } from "../lib/game";
import type { Loadout, SideCheck } from "../lib/solver";
import { SymbolRow } from "./SymbolIcon";

function SideSummary({
    title,
    versus,
    check,
}: {
    title: string;
    versus: string;
    check: SideCheck;
}) {
    const missing = SYMBOLS.filter((s) => (check.missing[s] ?? 0) > 0);
    return (
        <div className={`rounded-lg border p-2 ${check.pass ? "border-good/40" : "border-bad/50"}`}>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
                {check.pass ? (
                    <Check size={16} className="text-good" />
                ) : (
                    <X size={16} className="text-bad" />
                )}
                {title} <span className="font-normal text-muted">vs their {versus}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>You:</span>
                <SymbolRow symbols={check.have} size={18} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>Need:</span>
                <SymbolRow symbols={check.stat.symbols} number={check.stat.number} size={18} />
            </div>
            {!check.pass ? (
                <p className="mt-1.5 text-xs text-bad">
                    {missing.length > 0
                        ? `Missing ${missing.map((s) => `${check.missing[s]} ${SYMBOL_INFO[s].label}`).join(", ")}`
                        : null}
                    {missing.length > 0 && check.extrasShort > 0 ? "; " : null}
                    {check.extrasShort > 0
                        ? `${check.extrasShort} more symbol${check.extrasShort > 1 ? "s" : ""} of any kind`
                        : null}
                </p>
            ) : check.surplus > 0 ? (
                <p className="mt-1.5 text-xs text-muted">{check.surplus} spare</p>
            ) : null}
        </div>
    );
}

export function LoadoutView({ loadout, index }: { loadout: Loadout; index?: number }) {
    return (
        <div className="rounded-xl border border-edge bg-panel p-3">
            {index !== undefined ? (
                <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                    Option {index + 1}
                </div>
            ) : null}
            <ul className="mb-3 space-y-1.5">
                {loadout.items.length === 0 ? (
                    <li className="text-sm text-muted">No items needed</li>
                ) : null}
                {loadout.items.map((a, i) => (
                    <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: the same ring can appear twice
                        key={`${a.card.id}-${i}`}
                        className="flex items-center gap-2 text-sm"
                    >
                        <span
                            className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold uppercase ${
                                a.side === "attack"
                                    ? "bg-bad/20 text-bad"
                                    : "bg-magic/20 text-magic"
                            }`}
                        >
                            {a.side === "attack" ? "Attack" : "Defence"}
                        </span>
                        <span className="font-medium">{a.card.name}</span>
                        <span className="text-xs text-muted">{SLOT_LABEL[a.card.slot]}</span>
                        <span className="ml-auto">
                            <SymbolRow symbols={a.card.symbols} size={18} />
                        </span>
                    </li>
                ))}
            </ul>
            <div className="grid gap-2 sm:grid-cols-2">
                <SideSummary title="Your Attack" versus="Defence" check={loadout.attack} />
                <SideSummary title="Your Defence" versus="Attack" check={loadout.defence} />
            </div>
        </div>
    );
}
