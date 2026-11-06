import { posix } from "node:path";

export const REPO_URL = "https://github.com/qcksys/exilecon-card-game";

/** The markdown files in the repo that become pages, in reading order. */
export const DOCS = [
    { id: "readme", file: "README.md", route: "/", nav: "Overview" },
    {
        id: "rules/cards-and-symbols",
        file: "rules/cards-and-symbols.md",
        route: "/rules/cards-and-symbols/",
        nav: "Cards & symbols",
    },
    {
        id: "rules/equipment",
        file: "rules/equipment.md",
        route: "/rules/equipment/",
        nav: "Equipment",
    },
    {
        id: "rules/fighting-monsters",
        file: "rules/fighting-monsters.md",
        route: "/rules/fighting-monsters/",
        nav: "Fighting",
    },
    {
        id: "rules/progression",
        file: "rules/progression.md",
        route: "/rules/progression/",
        nav: "Progression",
    },
    { id: "faq", file: "faq.md", route: "/faq/", nav: "FAQ" },
    {
        id: "reference/exilecon-2023",
        file: "reference/exilecon-2023.md",
        route: "/reference/exilecon-2023/",
        nav: "2023 edition",
    },
    { id: "sources", file: "sources.md", route: "/sources/", nav: "Sources" },
] as const;

export type DocId = (typeof DOCS)[number]["id"];

const routeByFile = new Map<string, string>(DOCS.map((d) => [d.file, d.route]));

/**
 * Rewrite the repo-relative links in a markdown file (written for GitHub) into site URLs:
 * `rules/equipment.md#x` → `/rules/equipment/#x`, `../images/a.jpg` → `/images/a.jpg`,
 * and a bare `images/` folder link → the folder on GitHub.
 */
export function rewriteDocLinks(markdown: string, fromFile: string): string {
    const dir = posix.dirname(fromFile);
    return markdown.replace(
        /(\]\()([^)\s]+)(\))/g,
        (whole, open: string, target: string, close: string) => {
            if (/^(?:[a-z]+:|#|\/)/i.test(target)) return whole;
            const [path = "", hash] = target.split("#");
            const resolved = posix.normalize(posix.join(dir, path));
            const frag = hash ? `#${hash}` : "";
            const route = routeByFile.get(resolved);
            if (route) return `${open}${route}${frag}${close}`;
            if (resolved === "images" || resolved === "images/")
                return `${open}${REPO_URL}/tree/main/images${close}`;
            if (resolved.startsWith("images/")) return `${open}/${resolved}${frag}${close}`;
            return `${open}${REPO_URL}/blob/main/${resolved}${frag}${close}`;
        },
    );
}

/** The first `# Heading` in the file. */
export function docTitle(markdown: string): string {
    return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "ExileCon 2026 Card Game";
}
