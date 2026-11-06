import { Save, Swords, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
    type Card,
    isBroken,
    type Monster,
    type MonsterStat,
    newId,
    SLOT_LABEL,
} from "../lib/game";
import { solve } from "../lib/solver";
import { loadCards, loadMonsters, saveMonsters } from "../lib/store";
import { LoadoutView } from "./LoadoutView";
import { SymbolRow } from "./SymbolIcon";
import { NumberStepper, SymbolPicker } from "./SymbolPicker";

const EMPTY: Monster = {
    name: "",
    attack: { symbols: {}, number: 0 },
    defence: { symbols: {}, number: 0 },
};

function StatEditor({
    title,
    hint,
    value,
    onChange,
}: {
    title: string;
    hint: string;
    value: MonsterStat;
    onChange: (v: MonsterStat) => void;
}) {
    return (
        <div className="rounded-xl border border-edge bg-panel p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-gold">{title}</h3>
                <span className="text-xs text-muted">{hint}</span>
            </div>
            <SymbolPicker
                value={value.symbols}
                onChange={(symbols) => onChange({ ...value, symbols })}
            />
            <div className="mt-3">
                <NumberStepper
                    label="Number (any symbols)"
                    value={value.number}
                    onChange={(number) => onChange({ ...value, number })}
                />
            </div>
        </div>
    );
}

export default function FightCalculator() {
    const [cards, setCards] = useState<Card[] | null>(null);
    const [monsters, setMonsters] = useState<Monster[]>([]);
    const [monster, setMonster] = useState<Monster>(EMPTY);
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [showLock, setShowLock] = useState(false);

    useEffect(() => {
        loadCards().then(setCards);
        loadMonsters().then(setMonsters);
    }, []);

    const hasRequirement =
        Object.keys(monster.attack.symbols).length > 0 ||
        monster.attack.number > 0 ||
        Object.keys(monster.defence.symbols).length > 0 ||
        monster.defence.number > 0;

    const result = useMemo(
        () =>
            cards && hasRequirement ? solve(cards, monster, { exclude: excluded, limit: 5 }) : null,
        [cards, monster, excluded, hasRequirement],
    );

    const saveMonster = async () => {
        const entry: Monster = {
            ...monster,
            id: monster.id ?? newId(),
            name: monster.name.trim() || "Unnamed monster",
        };
        const next = [entry, ...monsters.filter((m) => m.id !== entry.id)];
        setMonsters(next);
        setMonster(entry);
        await saveMonsters(next);
    };

    const deleteMonster = async (id: string | undefined) => {
        const next = monsters.filter((m) => m.id !== id);
        setMonsters(next);
        await saveMonsters(next);
    };

    const usable = cards?.filter((c) => !isBroken(c)) ?? [];

    return (
        <div className="space-y-4">
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <input
                        className="h-11 min-w-0 flex-1 rounded-lg border border-edge bg-panel px-3"
                        placeholder="Monster name (optional)"
                        value={monster.name}
                        onChange={(e) => setMonster({ ...monster, name: e.target.value })}
                    />
                    <button
                        type="button"
                        onClick={saveMonster}
                        disabled={!hasRequirement}
                        className="flex h-11 items-center gap-1.5 rounded-lg border border-edge bg-panel px-3 text-sm disabled:opacity-40"
                    >
                        <Save size={16} /> Save
                    </button>
                    <button
                        type="button"
                        onClick={() => setMonster(EMPTY)}
                        className="flex h-11 items-center rounded-lg border border-edge bg-panel px-3 text-sm"
                        aria-label="Clear monster"
                    >
                        <X size={16} />
                    </button>
                </div>

                {monsters.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {monsters.map((m) => (
                            <span
                                key={m.id}
                                className={`flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-sm ${
                                    m.id === monster.id
                                        ? "border-gold bg-panel-2"
                                        : "border-edge bg-panel"
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setMonster(m)}
                                    className="flex items-center gap-2"
                                >
                                    {m.name}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteMonster(m.id)}
                                    className="rounded-full p-1 text-muted hover:text-bad"
                                    aria-label={`Delete ${m.name}`}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : null}

                <StatEditor
                    title="Monster Attack"
                    hint="your Defence must withstand it"
                    value={monster.attack}
                    onChange={(attack) => setMonster({ ...monster, attack })}
                />
                <StatEditor
                    title="Monster Defence"
                    hint="your Attack must beat it"
                    value={monster.defence}
                    onChange={(defence) => setMonster({ ...monster, defence })}
                />
            </section>

            {cards && cards.length > 0 && hasRequirement && result ? (
                <button
                    type="button"
                    onClick={() =>
                        document
                            .getElementById("fight-result")
                            ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className={`fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-3xl items-center justify-between rounded-xl border px-4 py-3 text-left font-semibold shadow-2xl backdrop-blur ${
                        result.totalWins > 0
                            ? "border-good/60 bg-[#14261a]/95 text-good"
                            : "border-bad/60 bg-[#2a1513]/95 text-bad"
                    }`}
                >
                    <span>
                        {result.totalWins > 0
                            ? `You can win · ${result.totalWins} loadout${result.totalWins > 1 ? "s" : ""}`
                            : "Can't win with your cards yet"}
                    </span>
                    <span className="text-sm font-normal text-text">See how ↓</span>
                </button>
            ) : null}

            <section id="fight-result" className="scroll-mt-16 space-y-3" aria-live="polite">
                {cards === null ? (
                    <p className="text-muted">Loading your cards…</p>
                ) : cards.length === 0 ? (
                    <div className="rounded-xl border border-edge bg-panel p-4 text-sm">
                        You have no cards yet.{" "}
                        <a className="text-gold underline" href="/cards/">
                            Add your cards
                        </a>{" "}
                        and come back.
                    </div>
                ) : !hasRequirement || !result ? (
                    <p className="text-sm text-muted">
                        Tap the monster's symbols above to see if you can beat it.
                    </p>
                ) : result.totalWins > 0 ? (
                    <>
                        <div className="flex items-center gap-2 rounded-xl border border-good/50 bg-good/10 p-3">
                            <Swords className="text-good" />
                            <div>
                                <div className="font-bold text-good">You can win</div>
                                <div className="text-sm text-muted">
                                    {result.totalWins} loadout{result.totalWins > 1 ? "s" : ""}{" "}
                                    work. Best first: fewest cards at risk, plainest gear.
                                </div>
                            </div>
                        </div>
                        {result.wins.map((l, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: ranked list
                            <LoadoutView key={i} loadout={l} index={i} />
                        ))}
                    </>
                ) : (
                    <>
                        <div className="rounded-xl border border-bad/50 bg-bad/10 p-3">
                            <div className="font-bold text-bad">
                                No combination of your cards wins
                            </div>
                            <div className="text-sm text-muted">The closest you can get:</div>
                        </div>
                        {result.closest ? <LoadoutView loadout={result.closest} /> : null}
                    </>
                )}

                {cards && cards.length > 0 ? (
                    <div className="rounded-xl border border-edge bg-panel">
                        <button
                            type="button"
                            onClick={() => setShowLock(!showLock)}
                            className="flex w-full items-center justify-between p-3 text-left text-sm"
                        >
                            <span>
                                Using{" "}
                                {usable.length -
                                    [...excluded].filter((id) => usable.some((c) => c.id === id))
                                        .length}{" "}
                                of {cards.length} cards
                                {cards.length - usable.length > 0
                                    ? ` (${cards.length - usable.length} broken)`
                                    : ""}
                            </span>
                            <span className="text-gold">
                                {showLock ? "Done" : "Keep cards out"}
                            </span>
                        </button>
                        {showLock ? (
                            <ul className="divide-y divide-edge border-t border-edge">
                                {usable.map((c) => (
                                    <li key={c.id}>
                                        <label className="flex items-center gap-3 p-3 text-sm">
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 accent-[var(--color-gold)]"
                                                checked={!excluded.has(c.id)}
                                                onChange={(e) => {
                                                    const next = new Set(excluded);
                                                    if (e.target.checked) next.delete(c.id);
                                                    else next.add(c.id);
                                                    setExcluded(next);
                                                }}
                                            />
                                            <span className="font-medium">{c.name}</span>
                                            <span className="text-xs text-muted">
                                                {SLOT_LABEL[c.slot]}
                                            </span>
                                            <span className="ml-auto">
                                                <SymbolRow symbols={c.symbols} size={18} />
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </section>
        </div>
    );
}
