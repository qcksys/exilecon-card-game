/** Minimal client for Cloudflare Turnstile in "execute" mode: one fresh token per AI request. */

interface TurnstileApi {
    render(
        el: HTMLElement,
        opts: {
            sitekey: string;
            execution: "execute" | "render";
            appearance?: "always" | "execute" | "interaction-only";
            callback?: (token: string) => void;
            "error-callback"?: (code: string) => void;
            "expired-callback"?: () => void;
            "before-interactive-callback"?: () => void;
            "after-interactive-callback"?: () => void;
        },
    ): string;
    execute(widgetId: string): void;
    reset(widgetId: string): void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | undefined;

function loadScript(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    scriptPromise ??= new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.onload = () =>
            window.turnstile
                ? resolve(window.turnstile)
                : reject(new Error("Turnstile failed to load"));
        s.onerror = () => {
            scriptPromise = undefined;
            reject(new Error("Couldn't load the bot check. Are you online?"));
        };
        document.head.appendChild(s);
    });
    return scriptPromise;
}

export class TurnstileClient {
    private widgetId: string | undefined;
    private pending: { resolve: (t: string) => void; reject: (e: Error) => void } | undefined;

    /**
     * @param onInteractive called with true when Cloudflare shows the "Verify you are human"
     * checkbox (the user has to tap it), and false once it's done.
     */
    constructor(
        private readonly siteKey: string,
        private readonly container: HTMLElement,
        private readonly onInteractive?: (needsTap: boolean) => void,
    ) {}

    /** Get a fresh single-use token. Shows a challenge in the container only if Cloudflare needs one. */
    async token(): Promise<string> {
        const api = await loadScript();
        if (!this.widgetId) {
            this.widgetId = api.render(this.container, {
                sitekey: this.siteKey,
                execution: "execute",
                appearance: "interaction-only",
                callback: (t) => this.pending?.resolve(t),
                "error-callback": (code) =>
                    this.pending?.reject(new Error(`Bot check failed (${code})`)),
                "expired-callback": () =>
                    this.pending?.reject(new Error("Bot check expired, try again")),
                "before-interactive-callback": () => this.onInteractive?.(true),
                "after-interactive-callback": () => this.onInteractive?.(false),
            });
        } else {
            api.reset(this.widgetId);
        }
        const id = this.widgetId;
        return new Promise<string>((resolve, reject) => {
            this.pending = { resolve, reject };
            api.execute(id);
        }).finally(() => {
            this.pending = undefined;
        });
    }
}
