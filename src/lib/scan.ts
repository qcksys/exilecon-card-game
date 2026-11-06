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
    const started = Date.now();
    const done = (status: number, body: unknown, fields: Record<string, unknown>) => {
        logScan({ status, ms: Date.now() - started, ...fields });
        return Response.json(body, { status });
    };

    if (!deps.scanEnabled) {
        return done(
            503,
            { error: "Card scanning is switched off right now." },
            { outcome: "disabled" },
        );
    }
    if (deps.limiter) {
        const { success } = await deps.limiter.limit({ key: deps.ip ?? "unknown" });
        if (!success) {
            return done(
                429,
                { error: "Too many scans. Wait a minute." },
                { outcome: "rate_limited" },
            );
        }
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return done(400, { error: "Expected a photo upload." }, { outcome: "bad_form" });
    }

    const denied = await requireHuman(form, deps.ip, deps.verifyHuman);
    if (denied) {
        logScan({ status: denied.status, ms: Date.now() - started, outcome: "bot_check_failed" });
        return denied;
    }

    const photo = Photo.safeParse(form.get("photo"));
    if (!photo.success) {
        const reason = photo.error.issues[0]?.message ?? "Bad photo";
        return done(400, { error: reason }, { outcome: "bad_photo", reason });
    }
    const image = new Uint8Array(await photo.data.arrayBuffer());
    const imagePart = { type: "file" as const, data: image, mediaType: photo.data.type };
    const photoInfo = { photoBytes: image.byteLength, photoType: photo.data.type };

    let stage: "gate" | "read" = "gate";
    try {
        const gateStart = Date.now();
        const gate = await generateText({
            model: deps.gateModel,
            output: Output.object({ schema: CardGate }),
            maxOutputTokens: 2000,
            providerOptions,
            messages: [{ role: "user", content: [imagePart, { type: "text", text: GATE_PROMPT }] }],
        });
        const gateInfo = {
            gateModel: modelId(deps.gateModel),
            gateMs: Date.now() - gateStart,
            gateUsage: usage(gate.usage),
        };
        if (!gate.output.isItemCard) {
            return done(
                422,
                { error: `That doesn't look like an item card: ${gate.output.reason}` },
                { outcome: "not_a_card", reason: gate.output.reason, ...photoInfo, ...gateInfo },
            );
        }

        stage = "read";
        const readStart = Date.now();
        const read = await generateText({
            model: deps.extractModel,
            output: Output.object({ schema: ScanResult }),
            maxOutputTokens: 4000,
            providerOptions,
            messages: [
                { role: "user", content: [imagePart, { type: "text", text: EXTRACT_PROMPT }] },
            ],
        });
        const card = read.output;
        return done(
            200,
            { scan: card },
            {
                outcome: "read",
                ...photoInfo,
                ...gateInfo,
                readModel: modelId(deps.extractModel),
                readMs: Date.now() - readStart,
                readUsage: usage(read.usage),
                card: {
                    name: card.name,
                    slot: card.slot,
                    twoHanded: card.twoHanded,
                    rarity: card.rarity,
                    symbols: card.symbols,
                    modifiers: card.modifiers,
                },
                uncertain: card.uncertain,
            },
        );
    } catch (err) {
        return done(
            502,
            { error: "The card reader is unavailable." },
            {
                outcome: "error",
                stage,
                error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
                ...photoInfo,
            },
        );
    }
}

/** One structured log line per scan request, searchable in Workers Logs. Never includes the photo, keys or IPs. */
function logScan(fields: Record<string, unknown> & { status: number }) {
    const entry = { event: "scan", ...fields };
    if (fields.status >= 500) console.error(entry);
    else if (fields.status >= 400) console.warn(entry);
    else console.log(entry);
}

function modelId(model: LanguageModel): string {
    return typeof model === "string" ? model : model.modelId;
}

function usage(u: { inputTokens?: number; outputTokens?: number } | undefined) {
    return { input: u?.inputTokens, output: u?.outputTokens };
}
