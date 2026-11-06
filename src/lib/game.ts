import { z } from "zod";

/** Every symbol that can appear on an item card or a monster stat. */
export const SYMBOLS = ["sword", "fire", "cold", "lightning", "life", "block", "chaos"] as const;
export const SymbolId = z.enum(SYMBOLS);
export type SymbolId = z.infer<typeof SymbolId>;

export const SYMBOL_INFO: Record<SymbolId, { label: string; colour: string }> = {
    sword: { label: "Sword", colour: "#d4a24c" },
    fire: { label: "Fire", colour: "#e2552b" },
    cold: { label: "Cold", colour: "#4aa3df" },
    lightning: { label: "Lightning", colour: "#a07cf0" },
    life: { label: "Life", colour: "#d9363e" },
    block: { label: "Block", colour: "#f08c2a" },
    chaos: { label: "Chaos", colour: "#8e5bb5" },
};

export const SLOTS = ["weapon", "shield", "armour", "amulet", "ring"] as const;
export const Slot = z.enum(SLOTS);
export type Slot = z.infer<typeof Slot>;

export const SLOT_LABEL: Record<Slot, string> = {
    weapon: "Weapon",
    shield: "Shield",
    armour: "Armour",
    amulet: "Amulet",
    ring: "Ring",
};

export const RARITIES = ["normal", "magic", "rare", "unique"] as const;
export const Rarity = z.enum(RARITIES);
export type Rarity = z.infer<typeof Rarity>;

export const RARITY_WEIGHT: Record<Rarity, number> = { normal: 0, magic: 1, rare: 2, unique: 3 };

/** Symbol counts, e.g. `{ sword: 2, fire: 1 }`. Missing symbols count as 0. */
export const SymbolCounts = z.partialRecord(SymbolId, z.number().int().min(0).max(20));
export type SymbolCounts = z.infer<typeof SymbolCounts>;

export const Card = z.object({
    id: z.string(),
    name: z.string().trim().min(1).max(80),
    slot: Slot,
    /** Only meaningful for weapons: a two-hander also takes the shield slot. */
    twoHanded: z.boolean().default(false),
    rarity: Rarity.default("normal"),
    symbols: SymbolCounts,
    durability: z.number().int().min(1).max(10).default(2),
    damage: z.number().int().min(0).max(10).default(0),
    note: z.string().max(200).default(""),
    photoId: z.string().optional(),
    createdAt: z.number().int(),
});
export type Card = z.infer<typeof Card>;

export const MonsterStat = z.object({
    symbols: SymbolCounts,
    number: z.number().int().min(0).max(30),
});
export type MonsterStat = z.infer<typeof MonsterStat>;

export const Monster = z.object({
    id: z.string().optional(),
    name: z.string().max(80).default(""),
    act: z.number().int().min(1).max(10).optional(),
    attack: MonsterStat,
    defence: MonsterStat,
});
export type Monster = z.infer<typeof Monster>;

/** What the AI card scan returns. Kept flat and explicit so it works as a structured-output schema. */
export const ScanResult = z.object({
    name: z.string().describe("The item name printed in the banner at the top of the card"),
    slot: Slot.describe(
        "Which slot the item uses, from the type box and the highlighted slot icon",
    ),
    twoHanded: z
        .boolean()
        .describe(
            "True only for weapons whose slot column shows one tall axe icon (no shield icon)",
        ),
    rarity: Rarity.describe(
        "normal = grey frame, magic = blue frame, rare = yellow, unique = orange",
    ),
    symbols: z
        .object({
            sword: z.number().int().min(0),
            fire: z.number().int().min(0),
            cold: z.number().int().min(0),
            lightning: z.number().int().min(0),
            life: z.number().int().min(0),
            block: z.number().int().min(0),
            chaos: z.number().int().min(0),
        })
        .describe("Total count of each symbol on the card, including symbols added by modifiers"),
    modifiers: z
        .array(z.string())
        .describe(
            "Modifier names printed in the type box, e.g. 'Weapon of Charging'. Empty for normal items.",
        ),
    durability: z.number().int().min(1).describe("Number of durability pips on the right edge"),
    uncertain: z
        .array(
            z.enum(["name", "slot", "twoHanded", "rarity", "symbols", "modifiers", "durability"]),
        )
        .describe("Fields you could not read confidently"),
});
export type ScanResult = z.infer<typeof ScanResult>;

export const CardGate = z.object({
    isItemCard: z
        .boolean()
        .describe(
            "True if the photo shows an ExileCon card-game item card (weapon, shield, armour, amulet or ring)",
        ),
    reason: z.string().describe("One short sentence explaining the decision"),
});
export type CardGate = z.infer<typeof CardGate>;

/** Built-in presets: the normal cards seen in starter packs. */
export const CARD_PRESETS: Array<Pick<Card, "name" | "slot" | "twoHanded" | "rarity" | "symbols">> =
    [
        {
            name: "Shortsword",
            slot: "weapon",
            twoHanded: false,
            rarity: "normal",
            symbols: { sword: 1 },
        },
        {
            name: "Corroded Longsword",
            slot: "weapon",
            twoHanded: true,
            rarity: "normal",
            symbols: { sword: 2 },
        },
        {
            name: "Splintered Tower Shield",
            slot: "shield",
            twoHanded: false,
            rarity: "normal",
            symbols: { block: 1 },
        },
        {
            name: "Rusted Cuirass",
            slot: "armour",
            twoHanded: false,
            rarity: "normal",
            symbols: { life: 2 },
        },
    ];

export function countSymbols(symbols: SymbolCounts): number {
    let total = 0;
    for (const s of SYMBOLS) total += symbols[s] ?? 0;
    return total;
}

export function isBroken(card: Pick<Card, "damage" | "durability">): boolean {
    return card.damage >= card.durability;
}

export function newId(): string {
    return crypto.randomUUID();
}
