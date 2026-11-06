import { createStore, del, get, set } from "idb-keyval";
import { z } from "zod";
import { CARD_PRESETS, Card, Monster, type Rarity, type Slot, type SymbolCounts } from "./game";

const db = createStore("exilecon-card-game", "kv");

const CardList = z.array(Card);
const MonsterList = z.array(Monster);

export interface Preset {
    name: string;
    slot: Slot;
    twoHanded: boolean;
    rarity: Rarity;
    symbols: SymbolCounts;
}

async function readList<T>(key: string, schema: z.ZodType<T[]>): Promise<T[]> {
    const raw = await get(key, db);
    const parsed = schema.safeParse(raw ?? []);
    return parsed.success ? parsed.data : [];
}

export const loadCards = () => readList("cards", CardList);
export const saveCards = (cards: Card[]) => set("cards", cards, db);

export const loadMonsters = () => readList("monsters", MonsterList);
export const saveMonsters = (monsters: Monster[]) => set("monsters", monsters, db);

export async function savePhoto(id: string, blob: Blob): Promise<void> {
    await set(`photo:${id}`, blob, db);
}
export async function loadPhoto(id: string): Promise<Blob | undefined> {
    return get<Blob>(`photo:${id}`, db);
}
export async function deletePhoto(id: string): Promise<void> {
    await del(`photo:${id}`, db);
}

/** Names you've confirmed before, so typing them again prefills the stats. Built-in presets come first. */
export async function loadPresets(): Promise<Preset[]> {
    const learned = (await get<Preset[]>("presets", db)) ?? [];
    const byName = new Map<string, Preset>();
    for (const p of [...CARD_PRESETS, ...learned]) byName.set(p.name.toLowerCase(), p);
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function learnPreset(card: Card): Promise<void> {
    const learned = (await get<Preset[]>("presets", db)) ?? [];
    const next = learned.filter((p) => p.name.toLowerCase() !== card.name.toLowerCase());
    next.push({
        name: card.name,
        slot: card.slot,
        twoHanded: card.twoHanded,
        rarity: card.rarity,
        symbols: card.symbols,
    });
    await set("presets", next, db);
}
