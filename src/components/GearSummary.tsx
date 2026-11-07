import { useMemo } from "react";
import { type Card, isBroken } from "../lib/game";
import { gearTotals } from "../lib/solver";
import { SymbolRow } from "./SymbolIcon";

/**
 * The highest Attack and Defence totals the usable gear can field. A monster stat's total is its
 * symbols plus its number; anything up to these totals can be beaten if its specific symbols are covered.
 */
export function GearSummary({ cards, exclude }: { cards: Card[]; exclude?: ReadonlySet<string> }) {
    const totals = useMemo(() => gearTotals(cards, { exclude }), [cards, exclude]);
    const usable = cards.filter((c) => !isBroken(c) && !exclude?.has(c.id)).length;
    if (usable === 0) return null;
    const { attack, defence, combos } = totals;
    const bothAtOnce = combos.length === 1;

    return (
        <section className="rounded-xl border border-edge bg-panel p-3" aria-label="Gear strength">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Gear strength
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                    <div className="text-xs text-muted">Highest Attack</div>
                    <div className="text-2xl font-bold text-bad">{attack.total}</div>
                    <SymbolRow symbols={attack.symbols} size={16} />
                </div>
                <div>
                    <div className="text-xs text-muted">Highest Defence</div>
                    <div className="text-2xl font-bold text-magic">{defence.total}</div>
                    <SymbolRow symbols={defence.symbols} size={16} />
                </div>
            </div>
            <p className="mt-2 text-xs text-muted">
                {bothAtOnce ? (
                    "You can field both at once."
                ) : (
                    <>
                        Not both at once. Attack / Defence you can field together:{" "}
                        <span className="font-semibold text-text">
                            {combos.map((c) => `${c.attack} / ${c.defence}`).join(" · ")}
                        </span>
                    </>
                )}{" "}
                Count a monster's symbols plus its number: you can beat totals up to these if its
                specific symbols are covered.
            </p>
        </section>
    );
}
