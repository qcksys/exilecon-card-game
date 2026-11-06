import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import { CardGate, ScanResult } from "./game";
import { requireHuman, type VerifyHuman } from "./turnstile";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const Photo = z
    .instanceof(File, { message: "No photo uploaded" })
    .refine(
        (f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type),
        "Photo must be JPEG, PNG or WebP",
    )
    .refine((f) => f.size > 0 && f.size <= MAX_PHOTO_BYTES, "Photo must be under 2 MB");

export interface RateLimiter {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ScanDeps {
    scanEnabled: boolean;
    ip: string | undefined;
    limiter?: RateLimiter;
    verifyHuman: VerifyHuman;
    /** Cheap model that only decides whether the photo is an item card. */
    gateModel: LanguageModel;
    /** Stronger model that reads the card. */
    extractModel: LanguageModel;
}

// Native structured output: Sonnet 5.5 rejects the forced tool call that the JSON-tool fallback uses.
const providerOptions = {
    anthropic: {
        structuredOutputMode: "outputFormat",
        effort: "low",
    } satisfies AnthropicLanguageModelOptions,
};

const GATE_PROMPT = `Decide whether this photo shows an item card from the ExileCon 2026 Path of Exile card game.

An item card is a dark playing card with: a name banner at the top; a row of round symbol icons under it; a dashed box naming the item type (Weapon, Shield, Armour, Amulet, Ring, sometimes with a modifier like "Weapon of Charging"); a column of five slot icons down the left edge; and "DURABILITY" with pips down the right edge.

Answer false for anything else, including the rules leaflet, the Quick Reference card, monster T-shirts, other cards, people, or unrelated objects. Several overlapping item cards count as true if one is clearly in front.`;

const EXTRACT_PROMPT = `Read the item card in front in this photo (from the ExileCon 2026 Path of Exile card game) and report its stats.

Card layout:
- Name: the banner across the top.
- Symbols: round icons in a row under the name. Magic and rare items also have extra symbols inside the dashed type box next to the modifier name. Count every symbol from both places.
- Type box: the dashed box in the middle names the slot (Weapon, Shield, Armour, Amulet or Ring) and, for magic/rare items, the modifier (e.g. "Weapon of Charging").
- Slot column (left edge): the item's own slot icon is highlighted. These icons are NOT symbols; never count them. A two-handed weapon shows one tall axe icon where a one-handed weapon shows a small axe icon plus a separate shield icon.
- Durability (right edge): one pip per point of durability. Pips are NOT symbols.
- Rarity from the frame colour: grey/white = normal, blue = magic, yellow = rare, orange/brown = unique.

Symbols:
- sword: a gold sword
- fire: red/orange flames
- cold: a blue snowflake
- lightning: a purple lightning bolt
- life: a red heart
- block: an orange shield emblem
- chaos: a purple skull

If glare or angle makes any field unreadable, give your best guess and list that field in "uncertain".`;

export async function handleScan(request: Request, deps: ScanDeps): Promise<Response> {
    if (!deps.scanEnabled) {
        return Response.json(
            { error: "Card scanning is switched off right now." },
            { status: 503 },
        );
    }
    if (deps.limiter) {
        const { success } = await deps.limiter.limit({ key: deps.ip ?? "unknown" });
        if (!success)
            return Response.json({ error: "Too many scans. Wait a minute." }, { status: 429 });
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return Response.json({ error: "Expected a photo upload." }, { status: 400 });
    }

    const denied = await requireHuman(form, deps.ip, deps.verifyHuman);
    if (denied) return denied;

    const photo = Photo.safeParse(form.get("photo"));
    if (!photo.success) {
        return Response.json(
            { error: photo.error.issues[0]?.message ?? "Bad photo" },
            { status: 400 },
        );
    }
    const image = new Uint8Array(await photo.data.arrayBuffer());
    const imagePart = { type: "file" as const, data: image, mediaType: photo.data.type };

    try {
        const gate = await generateText({
            model: deps.gateModel,
            output: Output.object({ schema: CardGate }),
            maxOutputTokens: 2000,
            providerOptions,
            messages: [{ role: "user", content: [imagePart, { type: "text", text: GATE_PROMPT }] }],
        });
        if (!gate.output.isItemCard) {
            return Response.json(
                { error: `That doesn't look like an item card: ${gate.output.reason}` },
                { status: 422 },
            );
        }

        const read = await generateText({
            model: deps.extractModel,
            output: Output.object({ schema: ScanResult }),
            maxOutputTokens: 4000,
            providerOptions,
            messages: [
                { role: "user", content: [imagePart, { type: "text", text: EXTRACT_PROMPT }] },
            ],
        });
        return Response.json({ scan: read.output });
    } catch (err) {
        console.error("scan failed", err instanceof Error ? err.message : err);
        return Response.json({ error: "The card reader is unavailable." }, { status: 502 });
    }
}
