import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { ScanResult } from "./game";
import { handleScan, type ScanDeps } from "./scan";
import { turnstileVerifier } from "./turnstile";

let logs: Array<MockInstance<(...args: unknown[]) => void>> = [];
beforeEach(() => {
    logs = (["log", "warn", "error"] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => undefined),
    );
});
afterEach(() => {
    for (const spy of logs) spy.mockRestore();
});

/** Every structured scan log entry written during the test. */
function scanLogs(): Array<Record<string, unknown>> {
    return logs
        .flatMap((spy) => spy.mock.calls.map((args) => args[0]))
        .filter(
            (e): e is Record<string, unknown> =>
                typeof e === "object" && e !== null && "event" in e,
        );
}

function jsonModel(value: unknown) {
    return new MockLanguageModelV4({
        doGenerate: {
            content: [{ type: "text", text: JSON.stringify(value) }],
            finishReason: { unified: "stop", raw: "end_turn" },
            usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 10, text: 10, reasoning: 0 },
            },
            warnings: [],
        },
    });
}

const SCAN: ScanResult = {
    name: "Hardwood Spear",
    slot: "weapon",
    twoHanded: false,
    rarity: "magic",
    symbols: { sword: 0, fire: 0, cold: 0, lightning: 2, life: 0, block: 0, chaos: 0 },
    modifiers: ["Weapon of Charging"],
    durability: 2,
    uncertain: [],
};

function request(opts: { token?: string; photo?: Blob | null } = {}) {
    const form = new FormData();
    if (opts.token !== undefined) form.append("cf-turnstile-response", opts.token);
    const photo =
        opts.photo === undefined
            ? new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })
            : opts.photo;
    if (photo) form.append("photo", photo, "card.jpg");
    return new Request("https://card.poe.boats/api/scan", { method: "POST", body: form });
}

function deps(overrides: Partial<ScanDeps> = {}): ScanDeps {
    return {
        scanEnabled: true,
        ip: "203.0.113.7",
        verifyHuman: async () => true,
        gateModel: jsonModel({ isItemCard: true, reason: "An item card" }),
        extractModel: jsonModel(SCAN),
        ...overrides,
    };
}

describe("handleScan", () => {
    it("reads a card when the bot check and the gate pass", async () => {
        const d = deps();
        const res = await handleScan(request({ token: "ok" }), d);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ scan: SCAN });
        expect((d.gateModel as MockLanguageModelV4).doGenerateCalls).toHaveLength(1);
        expect((d.extractModel as MockLanguageModelV4).doGenerateCalls).toHaveLength(1);
    });

    it("sends the photo to both models", async () => {
        const d = deps();
        await handleScan(request({ token: "ok" }), d);
        for (const model of [d.gateModel, d.extractModel] as MockLanguageModelV4[]) {
            const prompt = model.doGenerateCalls[0]?.prompt ?? [];
            const parts = prompt.flatMap((m) =>
                Array.isArray(m.content)
                    ? (m.content as Array<{ type: string; mediaType?: string }>)
                    : [],
            );
            expect(parts.some((p) => p.type === "file" && p.mediaType === "image/jpeg")).toBe(true);
        }
    });

    it("rejects a missing Turnstile token without calling a model", async () => {
        const d = deps();
        const res = await handleScan(request(), d);
        expect(res.status).toBe(403);
        expect((d.gateModel as MockLanguageModelV4).doGenerateCalls).toHaveLength(0);
    });

    it("rejects a failed Turnstile check without calling a model", async () => {
        const d = deps({ verifyHuman: async () => false });
        const res = await handleScan(request({ token: "bad" }), d);
        expect(res.status).toBe(403);
        expect((d.gateModel as MockLanguageModelV4).doGenerateCalls).toHaveLength(0);
    });

    it("stops at the gate when the photo isn't an item card", async () => {
        const d = deps({
            gateModel: jsonModel({ isItemCard: false, reason: "It's the rules leaflet." }),
        });
        const res = await handleScan(request({ token: "ok" }), d);
        expect(res.status).toBe(422);
        expect((d.extractModel as MockLanguageModelV4).doGenerateCalls).toHaveLength(0);
    });

    it("rate-limits per IP before doing any work", async () => {
        const verifyHuman = vi.fn(async () => true);
        const res = await handleScan(
            request({ token: "ok" }),
            deps({ verifyHuman, limiter: { limit: async () => ({ success: false }) } }),
        );
        expect(res.status).toBe(429);
        expect(verifyHuman).not.toHaveBeenCalled();
    });

    it("honours the kill switch", async () => {
        const res = await handleScan(request({ token: "ok" }), deps({ scanEnabled: false }));
        expect(res.status).toBe(503);
    });

    it("validates the photo", async () => {
        expect((await handleScan(request({ token: "ok", photo: null }), deps())).status).toBe(400);
        const gif = new Blob([new Uint8Array([1])], { type: "image/gif" });
        expect((await handleScan(request({ token: "ok", photo: gif }), deps())).status).toBe(400);
        const huge = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/jpeg" });
        expect((await handleScan(request({ token: "ok", photo: huge }), deps())).status).toBe(400);
    });

    it("returns 502 when the model call fails", async () => {
        const broken = new MockLanguageModelV4({
            doGenerate: async () => {
                throw new Error("upstream down");
            },
        });
        const res = await handleScan(request({ token: "ok" }), deps({ gateModel: broken }));
        expect(res.status).toBe(502);
        expect(scanLogs()[0]).toMatchObject({
            event: "scan",
            outcome: "error",
            stage: "gate",
            status: 502,
        });
    });

    it("logs one structured line per request, without the photo", async () => {
        await handleScan(request({ token: "ok" }), deps());
        await handleScan(request(), deps());
        const [read, denied] = scanLogs();
        expect(read).toMatchObject({
            event: "scan",
            outcome: "read",
            status: 200,
            card: { name: "Hardwood Spear", slot: "weapon", rarity: "magic" },
            gateUsage: { input: 10, output: 10 },
        });
        expect(read?.photoBytes).toBe(3);
        expect(JSON.stringify(read)).not.toMatch(/data|ip/i);
        expect(denied).toMatchObject({ outcome: "bot_check_failed", status: 403 });
    });
});

describe("turnstileVerifier", () => {
    it("posts the secret, token and IP to siteverify", async () => {
        const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
            Response.json({ success: true }),
        );
        const ok = await turnstileVerifier("secret", fetchImpl as unknown as typeof fetch)(
            "tok",
            "1.2.3.4",
        );
        expect(ok).toBe(true);
        const body = fetchImpl.mock.calls[0]?.[1]?.body as FormData;
        expect(body.get("secret")).toBe("secret");
        expect(body.get("response")).toBe("tok");
        expect(body.get("remoteip")).toBe("1.2.3.4");
    });

    it("fails closed on errors and unsuccessful responses", async () => {
        const no = vi.fn(async () => Response.json({ success: false }));
        expect(await turnstileVerifier("s", no as unknown as typeof fetch)("t", undefined)).toBe(
            false,
        );
        const boom = vi.fn(async () => {
            throw new Error("network");
        });
        expect(await turnstileVerifier("s", boom as unknown as typeof fetch)("t", undefined)).toBe(
            false,
        );
    });
});
