import { z } from "zod";
import { Card, newId } from "./game";

/** Cards travel without their photos or ids; the receiver gets fresh ids. */
const SharedCard = Card.omit({ id: true, photoId: true, createdAt: true });
const SharedCards = z.array(SharedCard).max(200);
type SharedCard = z.infer<typeof SharedCard>;

function toBase64Url(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(
    bytes: Uint8Array,
    stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
    const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
}

export function strip(cards: Card[]): SharedCard[] {
    return cards.map(({ id: _id, photoId: _p, createdAt: _c, ...rest }) => rest);
}

export async function encodeCards(cards: Card[]): Promise<string> {
    const json = new TextEncoder().encode(JSON.stringify(strip(cards)));
    return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeCards(encoded: string): Promise<Card[]> {
    const json = await pipe(fromBase64Url(encoded), new DecompressionStream("deflate-raw"));
    return hydrate(JSON.parse(new TextDecoder().decode(json)));
}

/** Validate cards from a file or link and give them new ids. */
export function hydrate(raw: unknown): Card[] {
    const list = SharedCards.parse(Array.isArray(raw) ? raw : (raw as { cards?: unknown })?.cards);
    const now = Date.now();
    return list.map((c, i) => ({ ...c, id: newId(), createdAt: now + i }));
}
