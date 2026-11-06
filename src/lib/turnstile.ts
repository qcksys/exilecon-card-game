/** Server-side Cloudflare Turnstile check. Every route that calls an AI model must go through `requireHuman`. */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type VerifyHuman = (token: string, ip: string | undefined) => Promise<boolean>;

export function turnstileVerifier(secret: string, fetchImpl: typeof fetch = fetch): VerifyHuman {
    return async (token, ip) => {
        const body = new FormData();
        body.append("secret", secret);
        body.append("response", token);
        if (ip) body.append("remoteip", ip);
        try {
            const res = await fetchImpl(SITEVERIFY, { method: "POST", body });
            if (!res.ok) return false;
            const data = (await res.json()) as { success?: boolean };
            return data.success === true;
        } catch {
            return false;
        }
    };
}

/** Returns a 403 response when the request has no valid Turnstile token, otherwise null. */
export async function requireHuman(
    form: FormData,
    ip: string | undefined,
    verify: VerifyHuman,
): Promise<Response | null> {
    const token = form.get("cf-turnstile-response");
    if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
        return Response.json(
            { error: "Bot check missing. Reload and try again." },
            { status: 403 },
        );
    }
    if (!(await verify(token, ip))) {
        return Response.json({ error: "Bot check failed. Try again." }, { status: 403 });
    }
    return null;
}
