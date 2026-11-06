import { describe, expect, it } from "vitest";
import { docTitle, REPO_URL, rewriteDocLinks } from "./docs";

describe("rewriteDocLinks", () => {
    it("maps doc links to site routes, keeping anchors", () => {
        expect(rewriteDocLinks("[x](rules/equipment.md#the-starter-pack)", "README.md")).toBe(
            "[x](/rules/equipment/#the-starter-pack)",
        );
        expect(rewriteDocLinks("[x](../faq.md#open-questions)", "rules/progression.md")).toBe(
            "[x](/faq/#open-questions)",
        );
        expect(rewriteDocLinks("[x](fighting-monsters.md)", "rules/equipment.md")).toBe(
            "[x](/rules/fighting-monsters/)",
        );
        expect(rewriteDocLinks("[x](README.md)", "faq.md")).toBe("[x](/)");
    });

    it("serves images from /images", () => {
        expect(
            rewriteDocLinks("![a](../images/shortsword.jpg)", "rules/cards-and-symbols.md"),
        ).toBe("![a](/images/shortsword.jpg)");
        expect(rewriteDocLinks("[b](images/rules-leaflet.jpg)", "sources.md")).toBe(
            "[b](/images/rules-leaflet.jpg)",
        );
    });

    it("sends the images folder link to GitHub", () => {
        expect(rewriteDocLinks("[`images/`](images/)", "sources.md")).toBe(
            `[\`images/\`](${REPO_URL}/tree/main/images)`,
        );
    });

    it("leaves external, absolute and same-page links alone", () => {
        const md = "[a](https://example.com) [b](#here) [c](/fight/)";
        expect(rewriteDocLinks(md, "faq.md")).toBe(md);
    });
});

describe("docTitle", () => {
    it("reads the first heading", () => {
        expect(docTitle("intro\n# Cards and symbols\n## More")).toBe("Cards and symbols");
    });
});
