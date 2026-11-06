import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import varlockAstroIntegration from "@varlock/astro-integration";
import { defineConfig } from "astro/config";

/**
 * The rules markdown references photos in /images (so GitHub renders them). Copy them into
 * public/images (gitignored) so the site can serve them at /images/*.
 */
const syncDocImages = {
    name: "sync-doc-images",
    hooks: {
        "astro:config:setup": () => {
            mkdirSync("public/images", { recursive: true });
            cpSync("images", "public/images", { recursive: true });
        },
    },
};

/**
 * Write every built /_astro/* file into sw.js so the service worker can precache the whole app
 * (island scripts included) for offline use, and version its cache by the asset hashes.
 */
const precacheAssets = {
    name: "precache-assets",
    hooks: {
        "astro:build:done": ({ dir, logger }) => {
            const root = fileURLToPath(dir);
            const swPath = [join(root, "sw.js"), join(root, "..", "client", "sw.js")].find(
                existsSync,
            );
            if (!swPath) {
                logger.warn("sw.js not found in the build output; offline precache skipped");
                return;
            }
            const clientRoot = join(swPath, "..");
            const astroDir = join(clientRoot, "_astro");
            const assets = existsSync(astroDir)
                ? readdirSync(astroDir)
                      .filter((f) => /\.(m?js|css|woff2?)$/.test(f))
                      .map((f) => `/_astro/${f}`)
                      .sort()
                : [];
            const version = createHash("sha256")
                .update(assets.join("\n"))
                .digest("hex")
                .slice(0, 12);
            const sw = readFileSync(swPath, "utf8")
                .replace('"__PRECACHE_ASSETS__"', JSON.stringify(assets))
                .replace('"__SW_VERSION__"', JSON.stringify(version));
            writeFileSync(swPath, sw);
            logger.info(`service worker precaches ${assets.length} assets (cache ${version})`);
        },
    },
};

export default defineConfig({
    site: "https://card.poe.boats",
    session: false,
    adapter: cloudflare({ imageService: "passthrough" }),
    integrations: [syncDocImages, varlockAstroIntegration(), react(), precacheAssets],
    vite: {
        plugins: [tailwindcss()],
    },
});
