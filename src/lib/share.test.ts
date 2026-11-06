import { describe, expect, it } from "vitest";
import type { Card } from "./game";
import { decodeCards, encodeCards, hydrate, strip } from "./share";

const cards: Card[] = [
    {
        id: "a",
        name: "Corroded Longsword",
        slot: "weapon",
        twoHanded: true,
        rarity: "normal",
        symbols: { sword: 2 },
        durability: 2,
        damage: 1,
        note: "",
        photoId: "a",
        createdAt: 1,
    },
    {
        id: "b",
        name: "Hardwood Spear",
        slot: "weapon",
        twoHanded: false,
        rarity: "magic",
        symbols: { lightning: 2 },
        durability: 2,
        damage: 0,
        note: "Weapon of Charging",
        createdAt: 2,
    },
];

describe("share links", () => {
    it("round-trips cards without ids or photos", async () => {
        const encoded = await encodeCards(cards);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        const back = await decodeCards(encoded);
        expect(back.map(({ id: _i, createdAt: _c, ...rest }) => rest)).toEqual(strip(cards));
        expect(back.every((c) => !c.photoId)).toBe(true);
        expect(new Set(back.map((c) => c.id)).size).toBe(2);
        expect(back.some((c) => c.id === "a" || c.id === "b")).toBe(false);
    });

    it("rejects garbage", async () => {
        await expect(decodeCards("not-a-link")).rejects.toThrow();
    });
});

describe("hydrate (file import)", () => {
    it("accepts the export file format and a bare array", () => {
        expect(hydrate({ version: 1, cards: strip(cards) })).toHaveLength(2);
        expect(hydrate(strip(cards))).toHaveLength(2);
    });

    it("rejects cards with invalid stats", () => {
        expect(() => hydrate([{ ...strip(cards)[0], slot: "boots" }])).toThrow();
        expect(() => hydrate([{ ...strip(cards)[0], symbols: { sword: -1 } }])).toThrow();
    });
});
