import { describe, expect, it } from "vitest";
import type { Card, MonsterStat, SymbolCounts } from "./game";
import { checkSide, gearTotals, solve } from "./solver";

let seq = 0;
function card(partial: Partial<Card> & Pick<Card, "slot" | "symbols">): Card {
    seq += 1;
    return {
        id: `c${seq}`,
        name: partial.name ?? `${partial.slot} ${seq}`,
        twoHanded: false,
        rarity: "normal",
        durability: 2,
        damage: 0,
        note: "",
        createdAt: seq,
        ...partial,
    };
}

const stat = (symbols: SymbolCounts, number: number): MonsterStat => ({ symbols, number });

const shortsword = card({ name: "Shortsword", slot: "weapon", symbols: { sword: 1 } });
const longsword = card({
    name: "Corroded Longsword",
    slot: "weapon",
    twoHanded: true,
    symbols: { sword: 2 },
});
const towerShield = card({
    name: "Splintered Tower Shield",
    slot: "shield",
    symbols: { block: 1 },
});
const cuirass = card({ name: "Rusted Cuirass", slot: "armour", symbols: { life: 2 } });

describe("checkSide", () => {
    it("Example A: Cold + 2 is withstood by Cold, Life, Life", () => {
        const r = checkSide({ cold: 1, life: 2 }, stat({ cold: 1 }, 2));
        expect(r.pass).toBe(true);
        expect(r.surplus).toBe(0);
    });

    it("Example B: Sword + Fire + 2 needs four symbols including a Sword and a Fire", () => {
        const s = stat({ sword: 1, fire: 1 }, 2);
        expect(checkSide({ sword: 2 }, s)).toMatchObject({ pass: false, missing: { fire: 1 } });
        expect(checkSide({ sword: 2, fire: 1 }, s)).toMatchObject({ pass: false, extrasShort: 1 });
        expect(checkSide({ sword: 2, fire: 1, cold: 1 }, s).pass).toBe(true);
    });

    it("Example C: three symbols don't help when the specific one is missing", () => {
        const r = checkSide({ life: 2, block: 1 }, stat({ cold: 1 }, 2));
        expect(r.pass).toBe(false);
        expect(r.missing).toEqual({ cold: 1 });
        expect(r.extrasShort).toBe(0);
        expect(r.shortfall).toBe(1);
    });

    it("Example D: 4 + Fire + Fire needs six symbols", () => {
        const s = stat({ fire: 2 }, 4);
        expect(checkSide({ fire: 2, sword: 3 }, s).pass).toBe(false);
        expect(checkSide({ fire: 2, sword: 4 }, s).pass).toBe(true);
        expect(checkSide({ fire: 6 }, s).pass).toBe(true);
    });

    it("doesn't double-count a symbol used to match a specific one", () => {
        const r = checkSide({ fire: 1 }, stat({ fire: 1 }, 1));
        expect(r.pass).toBe(false);
        expect(r.extras).toBe(0);
    });

    it("a stat with no requirement always passes", () => {
        expect(checkSide({}, stat({}, 0)).pass).toBe(true);
    });
});

describe("solve", () => {
    const starter = [shortsword, longsword, towerShield, cuirass];

    it("fails the leaflet monster with the normal starter cards and says Cold is missing", () => {
        const r = solve(starter, {
            attack: stat({ cold: 1 }, 2),
            defence: stat({ sword: 1, fire: 1 }, 2),
        });
        expect(r.totalWins).toBe(0);
        expect(r.closest?.defence.missing).toEqual({ cold: 1 });
        expect(r.closest?.attack.missing).toEqual({ fire: 1 });
    });

    it("finds the cheapest winning loadout first", () => {
        const r = solve(starter, {
            attack: stat({}, 1),
            defence: stat({ sword: 1 }, 0),
        });
        expect(r.totalWins).toBeGreaterThan(0);
        const best = r.wins[0];
        expect(best?.items.map((i) => i.card.name).sort()).toEqual([
            "Shortsword",
            "Splintered Tower Shield",
        ]);
    });

    it("never pairs a shield with a two-handed weapon", () => {
        // Needs two Swords (only the two-hander has them) and Block + Life + 1 on Defence (shield + armour).
        const r = solve(starter, {
            attack: stat({ block: 1, life: 1 }, 1),
            defence: stat({ sword: 2 }, 0),
        });
        expect(r.totalWins).toBe(0);
        expect(r.closest).toBeDefined();
    });

    it("puts each piece of jewellery wholly on one side", () => {
        const amulet = card({ name: "Amulet", slot: "amulet", symbols: { fire: 1, cold: 1 } });
        const r = solve([shortsword, cuirass, amulet], {
            // Attack needs Fire, Defence needs Cold: one amulet can't cover both.
            attack: stat({ cold: 1 }, 0),
            defence: stat({ sword: 1, fire: 1 }, 0),
        });
        expect(r.totalWins).toBe(0);

        const r2 = solve([shortsword, cuirass, amulet], {
            attack: stat({ life: 1 }, 0),
            defence: stat({ sword: 1, fire: 1 }, 0),
        });
        expect(r2.totalWins).toBeGreaterThan(0);
        const amuletUse = r2.wins[0]?.items.find((i) => i.card.slot === "amulet");
        expect(amuletUse?.side).toBe("attack");
    });

    it("uses at most two rings", () => {
        const rings = [1, 2, 3].map((n) =>
            card({ name: `Ring ${n}`, slot: "ring", symbols: { lightning: 1 } }),
        );
        expect(
            solve(rings, { attack: stat({}, 0), defence: stat({ lightning: 3 }, 0) }).totalWins,
        ).toBe(0);
        expect(
            solve(rings, { attack: stat({}, 0), defence: stat({ lightning: 2 }, 0) }).totalWins,
        ).toBeGreaterThan(0);
    });

    it("can use two copies of the same ring", () => {
        const a = card({ name: "Ruby Ring", slot: "ring", symbols: { fire: 1 } });
        const b = card({ name: "Ruby Ring", slot: "ring", symbols: { fire: 1 } });
        const r = solve([a, b], { attack: stat({}, 0), defence: stat({ fire: 2 }, 0) });
        expect(r.totalWins).toBeGreaterThan(0);
        expect(r.wins[0]?.items).toHaveLength(2);
    });

    it("skips broken and excluded cards", () => {
        const broken = card({
            name: "Broken Sword",
            slot: "weapon",
            symbols: { sword: 1 },
            damage: 2,
        });
        const m = { attack: stat({}, 0), defence: stat({ sword: 1 }, 0) };
        expect(solve([broken], m).totalWins).toBe(0);
        expect(solve([shortsword], m, { exclude: new Set([shortsword.id]) }).totalWins).toBe(0);
        expect(solve([shortsword], m).totalWins).toBe(1);
    });

    it("prefers normal items over magic ones when both win", () => {
        const magic = card({
            name: "Hardwood Spear",
            slot: "weapon",
            rarity: "magic",
            symbols: { lightning: 2 },
        });
        const plain = card({ name: "Plain Spear", slot: "weapon", symbols: { lightning: 1 } });
        const r = solve([magic, plain], {
            attack: stat({}, 0),
            defence: stat({ lightning: 1 }, 0),
        });
        expect(r.wins[0]?.items[0]?.card.name).toBe("Plain Spear");
        expect(r.totalWins).toBe(2);
    });

    it("handles a large inventory quickly", () => {
        const many: Card[] = [];
        const syms = ["sword", "fire", "cold", "lightning", "life", "block"] as const;
        for (let i = 0; i < 60; i++) {
            const slot =
                (["weapon", "shield", "armour", "amulet", "ring"] as const)[i % 5] ?? "ring";
            many.push(
                card({
                    slot,
                    twoHanded: slot === "weapon" && i % 2 === 0,
                    symbols: {
                        [syms[i % 6] ?? "sword"]: 1 + (i % 3),
                        [syms[(i + 2) % 6] ?? "fire"]: i % 2,
                    },
                }),
            );
        }
        const t = performance.now();
        const r = solve(many, {
            attack: stat({ fire: 1, cold: 1 }, 3),
            defence: stat({ sword: 2 }, 2),
        });
        expect(performance.now() - t).toBeLessThan(3000);
        expect(r.wins.length).toBeLessThanOrEqual(5);
    });
});

describe("gearTotals", () => {
    const starter = [shortsword, longsword, towerShield, cuirass];

    it("finds the highest Attack and Defence, and the trade-off between them", () => {
        const t = gearTotals(starter);
        expect(t.attack.total).toBe(2);
        expect(t.attack.symbols).toEqual({ sword: 2 });
        expect(t.attack.items.map((i) => i.card.name)).toEqual(["Corroded Longsword"]);
        expect(t.defence.total).toBe(3);
        expect(t.defence.symbols).toEqual({ block: 1, life: 2 });
        // The two-hander rules out the shield, so 2 Attack comes with only 2 Defence.
        expect(t.combos).toEqual([
            { attack: 2, defence: 2 },
            { attack: 1, defence: 3 },
        ]);
    });

    it("puts jewellery on whichever side it helps", () => {
        const amulet = card({ name: "Amulet", slot: "amulet", symbols: { fire: 1, cold: 1 } });
        const t = gearTotals([...starter, amulet]);
        expect(t.attack.total).toBe(4);
        expect(t.defence.total).toBe(5);
        expect(t.combos).toEqual([
            { attack: 4, defence: 2 },
            { attack: 3, defence: 3 },
            { attack: 2, defence: 4 },
            { attack: 1, defence: 5 },
        ]);
    });

    it("ignores broken and excluded cards", () => {
        const broken = card({
            name: "Broken Maul",
            slot: "weapon",
            twoHanded: true,
            symbols: { sword: 5 },
            damage: 2,
        });
        expect(gearTotals([...starter, broken]).attack.total).toBe(2);
        expect(gearTotals(starter, { exclude: new Set([cuirass.id]) }).defence.total).toBe(1);
    });

    it("is all zeros with no cards", () => {
        expect(gearTotals([])).toMatchObject({
            attack: { total: 0 },
            defence: { total: 0 },
            combos: [{ attack: 0, defence: 0 }],
        });
    });
});
