import { Flame, Heart, type LucideIcon, Shield, Skull, Snowflake, Sword, Zap } from "lucide-react";
import { SYMBOL_INFO, type SymbolId } from "../lib/game";

const ICONS: Record<SymbolId, LucideIcon> = {
    sword: Sword,
    fire: Flame,
    cold: Snowflake,
    lightning: Zap,
    life: Heart,
    block: Shield,
    chaos: Skull,
};

export function SymbolIcon({ symbol, size = 28 }: { symbol: SymbolId; size?: number }) {
    const Icon = ICONS[symbol];
    const info = SYMBOL_INFO[symbol];
    return (
        <span
            role="img"
            aria-label={info.label}
            title={info.label}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-black/40"
            style={{
                width: size,
                height: size,
                background: `radial-gradient(circle at 35% 30%, ${info.colour}, #111 120%)`,
            }}
        >
            <Icon size={Math.round(size * 0.58)} color="#fff" strokeWidth={2.4} />
        </span>
    );
}

/** A row of symbol icons, one per symbol (e.g. Sword Sword Fire), optionally followed by the monster's number. */
export function SymbolRow({
    symbols,
    number,
    size = 22,
}: {
    symbols: Partial<Record<SymbolId, number>>;
    number?: number;
    size?: number;
}) {
    const icons: SymbolId[] = [];
    for (const [s, n] of Object.entries(symbols) as Array<[SymbolId, number]>) {
        for (let i = 0; i < n; i++) icons.push(s);
    }
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            {icons.map((s, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: identical icons repeat
                <SymbolIcon key={`${s}-${i}`} symbol={s} size={size} />
            ))}
            {number ? (
                <span
                    className="inline-flex items-center justify-center rounded-full border border-edge bg-panel-2 font-bold"
                    style={{ width: size, height: size, fontSize: size * 0.55 }}
                >
                    {number}
                </span>
            ) : null}
            {icons.length === 0 && !number ? (
                <span className="text-xs text-muted">none</span>
            ) : null}
        </span>
    );
}
