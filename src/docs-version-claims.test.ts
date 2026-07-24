import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * Doc claims about the CURRENT schema version must match the schema.
 *
 * "Currently 1.x" style prose drifts by design whenever the schema moves;
 * this happened three times (concepts.md said 1.6 after 1.7 shipped, the
 * official content repo's LESSON-FORMAT said 1.7 after 1.8, then the blog
 * said 1.7 after 1.8). Historical introduced-in annotations ("(schema
 * v1.5)", "Before schema v1.2") and illustrative ranges stay out of
 * scope: only the "currently ..." forms assert the PRESENT version, so
 * only they are pinned. Prose that states the current version must use
 * such a form to stay under this gate.
 */
const SCHEMA_VERSION = (
    JSON.parse(readFileSync("schema/lesson.schema.json", "utf-8")) as {
        "x-schema-version": string;
    }
)["x-schema-version"];

const CLAIM_PATTERNS = [
    /currently (?:version )?v?(\d+\.\d+)/g,
    /aktuell (?:Version )?v?(\d+\.\d+)/g,
];

function markdownFilesUnder(rootDir: string): string[] {
    const collected: string[] = [];
    for (const entry of readdirSync(rootDir, {withFileTypes: true})) {
        const entryPath = join(rootDir, entry.name);
        if (entry.isDirectory()) collected.push(...markdownFilesUnder(entryPath));
        else if (entry.name.endsWith(".md")) collected.push(entryPath);
    }
    return collected;
}

describe("current-version claims in the docs", () => {
    const docFiles = ["README.md", ...markdownFilesUnder("docs")];

    it("finds at least one current-version claim (the scan is not blind)", () => {
        const claimCount = docFiles.reduce((count, filePath) => {
            const prose = readFileSync(filePath, "utf-8");
            return (
                count +
                CLAIM_PATTERNS.reduce(
                    (perFile, pattern) => perFile + [...prose.matchAll(pattern)].length,
                    0,
                )
            );
        }, 0);
        expect(claimCount).toBeGreaterThan(0);
    });

    it.each(docFiles)("%s claims only the current schema version", (filePath) => {
        const prose = readFileSync(filePath, "utf-8");
        const wrongClaims: string[] = [];
        for (const pattern of CLAIM_PATTERNS) {
            for (const claim of prose.matchAll(pattern)) {
                if (claim[1] !== SCHEMA_VERSION) wrongClaims.push(claim[0]);
            }
        }
        expect(wrongClaims, `stale version claims in ${filePath}`).toEqual([]);
    });
});
