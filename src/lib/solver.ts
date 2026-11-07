import {
    type Card,
    countSymbols,
    isBroken,
    type Monster,
    type MonsterStat,
    RARITY_WEIGHT,
    SYMBOLS,
    type SymbolCounts,
} from "./game";

export type Side = "attack" | "defence";

export interface Assignment {
    card: Card;
    side: Side;
}

export interface SideCheck {
    /** The monster's requirement for this side. */
    stat: MonsterStat;
    /** Every symbol the chosen items put on this side. */
    have: SymbolCounts;
    /** Specific symbols the monster shows that you are short of. */
    missing: SymbolCounts;
    /** Symbols left over after matching the specific ones; these cover the monster's number. */
    extras: number;
    /** How many more "any" symbols you'd need to cover the number. */
    extrasShort: number;
    pass: boolean;
    /** Total symbols you are short by (specific + number). 0 when the side passes. */
    shortfall: number;
    /** Spare "any" symbols beyond the number (0 when failing). */
    surplus: number;
}

export interface Loadout {
    items: Assignment[];
    attack: SideCheck;
    defence: SideCheck;
    win: boolean;
}

export interface SolveResult {
    /** Up to `limit` winning loadouts, best first. */
    wins: Loadout[];
    /** How many distinct winning loadouts exist (identical cards counted once). */
    totalWins: number;
    /** When nothing wins: the loadout that gets closest. */
    closest?: Loadout;
}

export interface SolveOptions {
    /** Card ids to leave out of every loadout. */
    exclude?: ReadonlySet<string>;
    /** How many winning loadouts to return. */
    limit?: number;
}

/** Check one side of a fight: specific symbols must match one-for-one, then the number needs that many more of anything. */
export function checkSide(have: SymbolCounts, stat: MonsterStat): SideCheck {
    const missing: SymbolCounts = {};
    let matched = 0;
    let missingTotal = 0;
    for (const s of SYMBOLS) {
        const need = stat.symbols[s] ?? 0;
        if (need === 0) continue;
        const got = have[s] ?? 0;
        const m = Math.min(need, got);
        matched += m;
        if (need > m) {
            missing[s] = need - m;
            missingTotal += need - m;
        }
    }
    const extras = countSymbols(have) - matched;
    const extrasShort = Math.max(0, stat.number - extras);
    const pass = missingTotal === 0 && extrasShort === 0;
    return {
        stat,
        have,
        missing,
        extras,
        extrasShort,
        pass,
        shortfall: missingTotal + extrasShort,
        surplus: pass ? extras - stat.number : 0,
    };
}

function addSymbols(target: SymbolCounts, add: SymbolCounts): SymbolCounts {
    const out: SymbolCounts = { ...target };
    for (const s of SYMBOLS) {
        const n = add[s] ?? 0;
        if (n) out[s] = (out[s] ?? 0) + n;
    }
    return out;
}

function pool(cards: Array<Card | null | undefined>): SymbolCounts {
    let acc: SymbolCounts = {};
    for (const c of cards) if (c) acc = addSymbols(acc, c.symbols);
    return acc;
}

function cardKey(c: Card): string {
    const sym = SYMBOLS.map((s) => c.symbols[s] ?? 0).join(",");
    return `${c.slot}|${c.slot === "weapon" && c.twoHanded ? 2 : 1}|${c.rarity}|${sym}`;
}

/** Collapse cards that are interchangeable in a fight; keep the least-damaged copy and how many there are. */
function dedupe(cards: Card[]): Array<{ card: Card; copies: number }> {
    const groups = new Map<string, { card: Card; copies: number }>();
    for (const c of cards) {
        const k = cardKey(c);
        const g = groups.get(k);
        if (!g) groups.set(k, { card: c, copies: 1 });
        else {
            g.copies += 1;
            if (c.damage < g.card.damage) g.card = c;
        }
    }
    return [...groups.values()];
}

/** Sort key: fewest items, then lowest total rarity, then least surplus. */
type Rank = [items: number, rarity: number, surplus: number];

function rankOf(cards: Array<Card | null | undefined>, surplus: number): Rank {
    let items = 0;
    let rarity = 0;
    for (const c of cards) {
        if (!c) continue;
        items += 1;
        rarity += RARITY_WEIGHT[c.rarity];
    }
    return [items, rarity, surplus];
}

function cmpRank(a: Rank, b: Rank): number {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function addRank(a: Rank, b: Rank): Rank {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

interface Jewellery {
    attack: Card[];
    defence: Card[];
}

/** Every legal way to use the amulet and rings: each piece is unused, on Attack, or on Defence. */
function jewelleryOptions(
    amulets: Array<{ card: Card; copies: number }>,
    rings: Array<{ card: Card; copies: number }>,
): Jewellery[] {
    const amuletOpts: Array<Assignment | null> = [null];
    for (const a of amulets) {
        amuletOpts.push({ card: a.card, side: "attack" }, { card: a.card, side: "defence" });
    }
    const ringOpts: Assignment[][] = [[]];
    const sides: Side[] = ["attack", "defence"];
    for (let i = 0; i < rings.length; i++) {
        const ri = rings[i];
        if (!ri) continue;
        for (const s of sides) ringOpts.push([{ card: ri.card, side: s }]);
        // Two copies of the same ring.
        if (ri.copies >= 2) {
            ringOpts.push(
                [
                    { card: ri.card, side: "attack" },
                    { card: ri.card, side: "attack" },
                ],
                [
                    { card: ri.card, side: "attack" },
                    { card: ri.card, side: "defence" },
                ],
                [
                    { card: ri.card, side: "defence" },
                    { card: ri.card, side: "defence" },
                ],
            );
        }
        for (let j = i + 1; j < rings.length; j++) {
            const rj = rings[j];
            if (!rj) continue;
            for (const si of sides) {
                for (const sj of sides) {
                    ringOpts.push([
                        { card: ri.card, side: si },
                        { card: rj.card, side: sj },
                    ]);
                }
            }
        }
    }
    const out: Jewellery[] = [];
    for (const a of amuletOpts) {
        for (const r of ringOpts) {
            const all = a ? [a, ...r] : r;
            out.push({
                attack: all.filter((x) => x.side === "attack").map((x) => x.card),
                defence: all.filter((x) => x.side === "defence").map((x) => x.card),
            });
        }
    }
    return out;
}

interface Part<T> {
    pick: T;
    check: SideCheck;
    rank: Rank;
}

/**
 * Find every legal loadout that beats the monster, best first.
 *
 * A loadout is at most: 1 weapon, 1 shield (not with a two-handed weapon), 1 armour, 1 amulet and
 * 2 rings, each piece of jewellery wholly on Attack or Defence. Broken and excluded cards are skipped.
 */
export function solve(
    cards: Card[],
    monster: Pick<Monster, "attack" | "defence">,
    options: SolveOptions = {},
): SolveResult {
    const limit = options.limit ?? 5;
    const usable = cards.filter((c) => !isBroken(c) && !options.exclude?.has(c.id));
    const groups = dedupe(usable);
    const bySlot = (slot: Card["slot"]) => groups.filter((g) => g.card.slot === slot);

    const weapons = bySlot("weapon").map((g) => g.card);
    const shields: Array<Card | null> = [null, ...bySlot("shield").map((g) => g.card)];
    const armours: Array<Card | null> = [null, ...bySlot("armour").map((g) => g.card)];
    const oneHanders: Array<Card | null> = [null, ...weapons.filter((w) => !w.twoHanded)];
    const twoHanders = weapons.filter((w) => w.twoHanded);

    const jewellery = jewelleryOptions(bySlot("amulet"), bySlot("ring"));

    const candidates: Array<{ rank: Rank; loadout: Loadout }> = [];
    let totalWins = 0;
    let closest: { shortfall: number; rank: Rank; loadout: Loadout } | undefined;

    const keepTop = <T>(parts: Part<T>[], k: number) =>
        parts.sort((a, b) => cmpRank(a.rank, b.rank)).slice(0, k);

    for (const j of jewellery) {
        const jAttack = pool(j.attack);
        const jDefence = pool(j.defence);
        const jRank = rankOf([...j.attack, ...j.defence], 0);

        const atk = (w: Card | null): Part<Card | null> => {
            // Your Attack has to beat the monster's Defence.
            const check = checkSide(addSymbols(jAttack, w?.symbols ?? {}), monster.defence);
            return { pick: w, check, rank: rankOf([w], check.surplus) };
        };
        const def = (s: Card | null, a: Card | null): Part<[Card | null, Card | null]> => {
            // Your Defence has to withstand the monster's Attack.
            const check = checkSide(
                addSymbols(addSymbols(jDefence, s?.symbols ?? {}), a?.symbols ?? {}),
                monster.attack,
            );
            return { pick: [s, a], check, rank: rankOf([s, a], check.surplus) };
        };

        const atk1 = oneHanders.map(atk);
        const atk2 = twoHanders.map(atk);
        const defAll: Part<[Card | null, Card | null]>[] = [];
        for (const s of shields) for (const a of armours) defAll.push(def(s, a));
        const defNoShield = defAll.filter((d) => d.pick[0] === null);

        // Count every winning combination for this jewellery choice.
        const win1 = atk1.filter((p) => p.check.pass);
        const win2 = atk2.filter((p) => p.check.pass);
        const winDefAll = defAll.filter((p) => p.check.pass);
        const winDefNoShield = defNoShield.filter((p) => p.check.pass);
        totalWins += win1.length * winDefAll.length + win2.length * winDefNoShield.length;

        // The best overall loadouts are always built from the best few of each side.
        const k = limit;
        const pairs: Array<[Part<Card | null>, Part<[Card | null, Card | null]>]> = [];
        for (const a of keepTop(win1, k)) for (const d of keepTop(winDefAll, k)) pairs.push([a, d]);
        for (const a of keepTop(win2, k))
            for (const d of keepTop(winDefNoShield, k)) pairs.push([a, d]);
        for (const [a, d] of pairs) {
            candidates.push({
                rank: addRank(addRank(a.rank, d.rank), jRank),
                loadout: buildLoadout(a.pick, d.pick, j, a.check, d.check),
            });
        }

        // Track the closest attempt in case nothing wins.
        if (totalWins === 0) {
            const best = <T>(parts: Part<T>[]) =>
                parts.reduce<Part<T> | undefined>(
                    (b, p) =>
                        !b ||
                        p.check.shortfall < b.check.shortfall ||
                        (p.check.shortfall === b.check.shortfall && cmpRank(p.rank, b.rank) < 0)
                            ? p
                            : b,
                    undefined,
                );
            const options: Array<
                [Part<Card | null> | undefined, Part<[Card | null, Card | null]> | undefined]
            > = [
                [best(atk1), best(defAll)],
                [best(atk2), best(defNoShield)],
            ];
            for (const [a, d] of options) {
                if (!a || !d) continue;
                const shortfall = a.check.shortfall + d.check.shortfall;
                const rank = addRank(addRank(a.rank, d.rank), jRank);
                if (
                    !closest ||
                    shortfall < closest.shortfall ||
                    (shortfall === closest.shortfall && cmpRank(rank, closest.rank) < 0)
                ) {
                    closest = {
                        shortfall,
                        rank,
                        loadout: buildLoadout(a.pick, d.pick, j, a.check, d.check),
                    };
                }
            }
        }
    }

    candidates.sort((a, b) => cmpRank(a.rank, b.rank));
    const wins = candidates.slice(0, limit).map((c) => c.loadout);
    return totalWins > 0
        ? { wins, totalWins }
        : { wins: [], totalWins: 0, closest: closest?.loadout };
}

function buildLoadout(
    weapon: Card | null,
    [shield, armour]: [Card | null, Card | null],
    j: Jewellery,
    attack: SideCheck,
    defence: SideCheck,
): Loadout {
    const items: Assignment[] = [];
    if (weapon) items.push({ card: weapon, side: "attack" });
    if (shield) items.push({ card: shield, side: "defence" });
    if (armour) items.push({ card: armour, side: "defence" });
    for (const c of j.attack) items.push({ card: c, side: "attack" });
    for (const c of j.defence) items.push({ card: c, side: "defence" });
    return { items, attack, defence, win: attack.pass && defence.pass };
}

export interface SidePeak {
    /** Total symbols on this side. */
    total: number;
    symbols: SymbolCounts;
    /** The loadout that gets there. */
    items: Assignment[];
}

export interface GearTotals {
    /** The most symbols you can put on Attack, ignoring Defence. */
    attack: SidePeak;
    /** The most symbols you can put on Defence, ignoring Attack. */
    defence: SidePeak;
    /**
     * Attack and Defence totals you can field in the same fight, keeping only the best trade-offs
     * (no other loadout beats one on both sides). Highest Attack first.
     */
    combos: Array<{ attack: number; defence: number }>;
}

/**
 * How strong the gear is: the highest Attack and Defence totals any legal loadout reaches. A monster
 * whose Defence (specific symbols + number) is at most the Attack total, and whose Attack is at most
 * the Defence total, can be beaten as long as its specific symbols are covered.
 */
export function gearTotals(
    cards: Card[],
    options: { exclude?: ReadonlySet<string> } = {},
): GearTotals {
    const usable = cards.filter((c) => !isBroken(c) && !options.exclude?.has(c.id));
    const groups = dedupe(usable);
    const bySlot = (slot: Card["slot"]) => groups.filter((g) => g.card.slot === slot);
    const weapons = bySlot("weapon").map((g) => g.card);
    const oneHanders: Array<Card | null> = [null, ...weapons.filter((w) => !w.twoHanded)];
    const twoHanders = weapons.filter((w) => w.twoHanded);
    const armours: Array<Card | null> = [null, ...bySlot("armour").map((g) => g.card)];
    const shields: Array<Card | null> = [null, ...bySlot("shield").map((g) => g.card)];
    const defencePairs: Array<[Card | null, Card | null]> = [];
    for (const s of shields) for (const a of armours) defencePairs.push([s, a]);

    const size = (cs: Array<Card | null>) =>
        cs.reduce((n, c) => n + (c ? countSymbols(c.symbols) : 0), 0);
    const best = <T>(opts: T[], score: (o: T) => number): T | undefined =>
        opts.reduce<T | undefined>(
            (b, o) => (b === undefined || score(o) > score(b) ? o : b),
            undefined,
        );

    const empty: SidePeak = { total: 0, symbols: {}, items: [] };
    let attack = empty;
    let defence = empty;
    const points: Array<{ attack: number; defence: number }> = [];

    for (const j of jewelleryOptions(bySlot("amulet"), bySlot("ring"))) {
        // One-hander (or no weapon) with the best shield + armour, or a two-hander with armour only.
        const bestArmour = best(armours, (a) => size([a])) ?? null;
        const options: Array<[Card | null | undefined, [Card | null, Card | null] | undefined]> = [
            [best(oneHanders, (w) => size([w])), best(defencePairs, size)],
            [best(twoHanders, (w) => size([w])), [null, bestArmour]],
        ];
        for (const [weapon, def] of options) {
            if (weapon === undefined || !def) continue;
            const [shield, armour] = def;
            const atkSymbols = pool([weapon, ...j.attack]);
            const defSymbols = pool([shield, armour, ...j.defence]);
            const items: Assignment[] = [];
            if (weapon) items.push({ card: weapon, side: "attack" });
            if (shield) items.push({ card: shield, side: "defence" });
            if (armour) items.push({ card: armour, side: "defence" });
            for (const c of j.attack) items.push({ card: c, side: "attack" });
            for (const c of j.defence) items.push({ card: c, side: "defence" });
            const a = countSymbols(atkSymbols);
            const d = countSymbols(defSymbols);
            points.push({ attack: a, defence: d });
            if (a > attack.total)
                attack = {
                    total: a,
                    symbols: atkSymbols,
                    items: items.filter((i) => i.side === "attack"),
                };
            if (d > defence.total)
                defence = {
                    total: d,
                    symbols: defSymbols,
                    items: items.filter((i) => i.side === "defence"),
                };
        }
    }

    // Keep only the trade-offs nothing else beats on both sides.
    points.sort((x, y) => y.attack - x.attack || y.defence - x.defence);
    const combos: Array<{ attack: number; defence: number }> = [];
    for (const p of points) {
        const last = combos[combos.length - 1];
        if (!last || p.defence > last.defence) combos.push(p);
    }
    return { attack, defence, combos };
}
