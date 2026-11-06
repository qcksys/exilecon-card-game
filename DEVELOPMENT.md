# Development

The site at [card.poe.boats](https://card.poe.boats) is an Astro 7 app on Cloudflare Workers. The rules pages are rendered from the markdown files in this repo (`README.md`, `rules/`, `faq.md`, `reference/`, `sources.md`); edit those and the site follows.

## Setup

```bash
vp install
```

Env vars come from `.env.schema` through [varlock](https://varlock.dev). Secrets resolve from 1Password through the desktop app, so approve the prompt the first time. Values are cached on disk for 12 hours.

## Commands

| Command | What it does |
| --- | --- |
| `vp run dev` | Dev server on <http://localhost:4321>. Locally, Turnstile uses Cloudflare's always-pass test keys. |
| `vp run test` | Unit tests: the loadout solver, the scan route, link rewriting. |
| `vp run check` | `astro check` and Biome. |
| `vp run deploy` | Deploys from your machine: builds with `APP_ENV=prod` and deploys with `varlock-wrangler`, which uploads secrets as Worker secrets. Needs `wrangler login` once. |

## Deploys

Pushing to `main` deploys through GitHub Actions (`.github/workflows/deploy.yml`) after the checks pass. You can also start it by hand with `gh workflow run deploy.yml --ref main`.

Actions doesn't read 1Password. Instead it uses repository secrets mirrored from the `exilecon-card-game` 1Password item, with the same names:
- `ANTHROPIC_API_KEY`
- `TURNSTILE_KEY`
- `TURNSTILE_SECRET`
- `CLOUDFLARE_ACCESS_TOKEN`, which the workflow passes to wrangler as `CLOUDFLARE_API_TOKEN`

When a value changes in 1Password, copy it across without printing it:

```bash
op read -n "op://v3zxer3deg52xqcutwk7pdfeey/ffnyvxsbxh4oolzfwawkylf74e/TURNSTILE_SECRET" | gh secret set TURNSTILE_SECRET
```

## How it fits together

- `src/lib/solver.ts`: finds every legal loadout (weapon, shield unless the weapon is two-handed, armour, amulet, two rings, with each piece of jewellery on Attack or Defence) that beats a monster.
- `src/lib/scan.ts` and `src/pages/api/scan.ts`: card scanning. The flow:
  - the request must pass Turnstile and a per-IP rate limit,
  - Claude Haiku 5.5 checks that the photo is an item card,
  - Claude Sonnet 5.5 reads the stats.

  `SCAN_ENABLED=false` switches scanning off.
- `src/lib/store.ts`: the inventory, kept in the browser's IndexedDB. Nothing is stored on the server.
- `public/sw.js`: a service worker that keeps the pages and assets available offline.
