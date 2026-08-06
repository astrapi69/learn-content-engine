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

/** Markdown emphasis that may wrap the version token itself. `currently
 *  `1.7`` was a stale claim in exactly the gated phrasing, and the gate read
 *  past it because the pattern had no room for the backticks. */
const WRAPPED_VERSION = "[`*_]{0,2}v?(\\d+\\.\\d+)[`*_]{0,2}";

/** Every phrasing that asserts the PRESENT schema version. A current-version
 *  claim written any other way escapes this gate, which is how README.md kept
 *  "Tracks the lesson schema at v1.7" through four schema bumps. When a new
 *  phrasing enters the docs, it belongs here AND in SEEDED_STALE_CLAIMS. */
const CLAIM_PATTERNS = [
    new RegExp(`currently (?:version )?${WRAPPED_VERSION}`, "g"),
    new RegExp(`aktuell (?:Version )?${WRAPPED_VERSION}`, "g"),
    new RegExp(`[Tt]racks the lesson schema at ${WRAPPED_VERSION}`, "g"),
    new RegExp(`schema at ${WRAPPED_VERSION}`, "g"),
];

/** One stale example per supported phrasing. A phrasing added without an
 *  entry here is a pattern nobody proved can fail. */
const SEEDED_STALE_CLAIMS = [
    "the schema is currently 0.1",
    "das Schema ist aktuell 0.1",
    "the schema is currently `0.1`",
    "Tracks the lesson schema at **v0.1**.",
    "pinned to the schema at v0.1",
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

    it.each(SEEDED_STALE_CLAIMS)("catches a stale claim written as %j", (seeded) => {
        // Negative control per phrasing: a pattern that never fires on a
        // known-bad string is a rule that cannot fail.
        const caught = CLAIM_PATTERNS.some((pattern) =>
            [...seeded.matchAll(pattern)].some((claim) => claim[1] !== SCHEMA_VERSION),
        );
        expect(caught, `no pattern catches: ${seeded}`).toBe(true);
    });
});

/** Prose that calls `domain` free-form asserts the pre-0.20.0 state; since
 *  engine#127 the field carries the known-values-plus-other vocabulary
 *  (`KNOWN_CONTENT_DOMAINS`). Other fields may legitimately be free-form
 *  (`ai_validation`), so the patterns bind to the `domain` token. */
const FREE_FORM_DOMAIN_PATTERNS = [
    /free-form\s+`?domain`?/gi,
    /frei belegbare\w*\s+`?domain`?/gi,
];

const SEEDED_FREE_FORM_CLAIMS = [
    "a free-form `domain` field",
    "ein frei belegbares `domain`-Feld",
];

describe("free-form domain claims in the docs (engine#127)", () => {
    const docFiles = ["README.md", ...markdownFilesUnder("docs")];

    it.each(docFiles)("%s does not call `domain` free-form", (filePath) => {
        const prose = readFileSync(filePath, "utf-8");
        const staleClaims = FREE_FORM_DOMAIN_PATTERNS.flatMap((pattern) =>
            [...prose.matchAll(pattern)].map((claim) => claim[0]),
        );
        expect(staleClaims, `pre-0.20.0 domain claim in ${filePath}`).toEqual([]);
    });

    it.each(SEEDED_FREE_FORM_CLAIMS)("catches a stale claim written as %j", (seeded) => {
        const caught = FREE_FORM_DOMAIN_PATTERNS.some(
            (pattern) => [...seeded.matchAll(pattern)].length > 0,
        );
        expect(caught, `no pattern catches: ${seeded}`).toBe(true);
    });
});
