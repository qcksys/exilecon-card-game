import { defineCollection } from "astro:content";
import { readFile } from "node:fs/promises";
import { z } from "astro/zod";
import { DOCS, docTitle, rewriteDocLinks } from "./lib/docs";

/** Loads the rules markdown from the repo root, rewriting GitHub-style links into site routes. */
const docs = defineCollection({
    loader: {
        name: "repo-docs",
        load: async ({ store, renderMarkdown, generateDigest, parseData, watcher }) => {
            store.clear();
            for (const [order, doc] of DOCS.entries()) {
                const raw = await readFile(doc.file, "utf8");
                const body = rewriteDocLinks(raw, doc.file);
                const data = await parseData({
                    id: doc.id,
                    data: { title: docTitle(raw), route: doc.route, nav: doc.nav, order },
                });
                store.set({
                    id: doc.id,
                    data,
                    body,
                    digest: generateDigest(body),
                    rendered: await renderMarkdown(body),
                });
                watcher?.add(doc.file);
            }
        },
    },
    schema: z.object({
        title: z.string(),
        route: z.string(),
        nav: z.string(),
        order: z.number(),
    }),
});

export const collections = { docs };
