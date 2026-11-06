import { env } from "cloudflare:workers";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { APIRoute } from "astro";
import { ENV } from "varlock/env";
import { handleScan } from "../../lib/scan";
import { turnstileVerifier } from "../../lib/turnstile";

export const prerender = false;

export const POST: APIRoute = ({ request }) => {
    const anthropic = createAnthropic({ apiKey: ENV.ANTHROPIC_API_KEY });
    return handleScan(request, {
        scanEnabled: ENV.SCAN_ENABLED,
        ip: request.headers.get("cf-connecting-ip") ?? undefined,
        limiter: env.SCAN_LIMITER,
        verifyHuman: turnstileVerifier(ENV.TURNSTILE_SECRET_KEY),
        gateModel: anthropic("claude-haiku-5-5"),
        extractModel: anthropic("claude-sonnet-5-5"),
    });
};
