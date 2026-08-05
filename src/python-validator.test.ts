import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * engine#115: the shipped Python validator helper must actually apply the
 * canonical slug rule, not merely survive it.
 *
 * The ecosystem validates one schema with two engines - ajv here, the
 * ``jsonschema`` library in every content repo. Schema 1.10 introduced
 * ``\p{Ll}``, which Python's ``re`` cannot compile, so the Python side died
 * on every document. ``python/lce_schema.py`` swaps the ``pattern`` keyword
 * for a ``regex``-backed implementation.
 *
 * These tests run the real Python, because a JS assertion about a Python
 * file would prove nothing about the thing that actually broke. They skip
 * (rather than fail) when python3 or its libraries are absent, so the suite
 * stays runnable on a bare machine - the CI job installs them.
 */

const repoFile = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const PYTHON_DIR = repoFile("../python");
const SCHEMA_PATH = repoFile("../schema/lesson.schema.json");

/** Run a Python snippet with ``python/`` on the path; null when the
 *  interpreter or a required library is missing. */
function runPython(snippet: string): string | null {
  try {
    return execFileSync("python3", ["-c", snippet], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: PYTHON_DIR },
    }).trim();
  } catch (error) {
    const message = String((error as { stderr?: string }).stderr ?? error);
    if (/ModuleNotFoundError|No module named|ENOENT|not found|FATAL: the 'regex'/.test(message)) {
      return null;
    }
    throw error;
  }
}

/** Count validation errors on ``/id`` for a probe lesson with the given id. */
const ID_ERROR_COUNT = (lessonId: string): string => `
import json
from lce_schema import build_validator
schema = json.load(open(${JSON.stringify(SCHEMA_PATH)}))
validator = build_validator(schema)
lesson = {"id": ${JSON.stringify(lessonId)}, "title": "T",
          "steps": [{"id": "theory-1", "type": "theory", "title": "T", "body": "x"}]}
errors = [e for e in validator.iter_errors(lesson) if list(e.absolute_path)[:1] == ["id"]]
print(len(errors))
`;

const probeAvailable = runPython("print('ok')") !== null;

describe.skipIf(!probeAvailable)("shipped Python validator (engine#115)", () => {
  it("loads the canonical schema at all - the regression that started this", () => {
    // Before the helper this raised: check_schema rejected the whole schema
    // because \p{Ll} is not a Python-re regex.
    expect(runPython(ID_ERROR_COUNT("01-einleitung"))).toBe("0");
  });

  it("ENFORCES the slug rule instead of merely surviving it", () => {
    // The half fix (format_checker=None alone) would still raise here; a
    // pattern keyword that silently passes everything would print 0.
    expect(runPython(ID_ERROR_COUNT("A_b ZWEI"))).toBe("1");
  });

  it("boundary: leading hyphen rejected, single character accepted", () => {
    expect(runPython(ID_ERROR_COUNT("-a"))).toBe("1");
    expect(runPython(ID_ERROR_COUNT("a"))).toBe("0");
  });

  it("keeps diacritic ids valid - 158 published identifiers depend on it", () => {
    // Measured over all 11 content repos at origin/main: 15 step ids, 12
    // exercise ids, 29 card ids and 102 tags carry non-ASCII lowercase
    // letters. An ASCII-only pattern would invalidate them, and the only
    // "fix" would be renaming ids that learner progress hangs on.
    expect(runPython(ID_ERROR_COUNT("fünf-wörter"))).toBe("0");
    expect(runPython(ID_ERROR_COUNT("ex-free-veía"))).toBe("0");
  });

  it("agrees with the engine's own verdict on every probe", () => {
    // Same inputs through ajv: the two validators must not disagree, which
    // is the entire point of the exercise.
    const CASES: Array<[string, boolean]> = [
      ["01-einleitung", true],
      ["fünf-wörter", true],
      ["a", true],
      ["A_b ZWEI", false],
      ["-a", false],
    ];
    for (const [lessonId, expectedValid] of CASES) {
      const pythonErrors = runPython(ID_ERROR_COUNT(lessonId));
      expect(pythonErrors, `python verdict for ${lessonId}`).toBe(expectedValid ? "0" : "1");
    }
  });
});

describe("packaging (engine#115)", () => {
  /** The paths npm would actually publish. Measured at the END of the chain:
   *  asserting the `files` entry in package.json would describe the intent,
   *  not the outcome - and the two disagreed once already (`files: ["python"]`
   *  shipped the whole directory including __pycache__). */
  function packedPaths(): string[] {
    // --json puts the file list on stdout; the human-readable form writes it
    // to stderr, where a naive read would see an empty list and pass.
    const report = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json"], {
        encoding: "utf8",
        cwd: repoFile(".."),
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as Record<string, { files: Array<{ path: string }> }>;
    const entries = Object.values(report);
    expect(entries, "npm pack reported no package").toHaveLength(1);
    return entries[0]!.files.map((entry) => entry.path);
  }

  it("ships the helper in the npm package, so consumers read one pinned source", () => {
    expect(packedPaths()).toContain("python/lce_schema.py");
  });

  it("does not ship Python bytecode - it reached the 0.19.0 tarball once", () => {
    // Running this suite compiles python/lce_schema.py in place, so
    // __pycache__ exists on any machine that ran the tests before packing.
    // It is machine-specific (cpython-3XX) and never part of the contract.
    expect(packedPaths().filter((path) => /__pycache__|\.pyc$/.test(path))).toEqual([]);
  });

  it("the helper fails loudly when regex is missing, never silently", () => {
    const source = readFileSync(repoFile("../python/lce_schema.py"), "utf8");
    expect(source).toContain("raise SystemExit");
    // A silent fallback to `re` would reintroduce the original crash; a
    // no-op pattern keyword would be a rule that cannot fail.
    expect(source).not.toMatch(/except ImportError:\s*\n\s*import re/);
  });
});
