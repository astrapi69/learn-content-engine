// Real-content conformance run (TEIL C). Clones every public content repo
// (official, test/starter, and the alc-* domain repos) read-only (depth 1)
// and drives EVERY set + lesson through the full engine pipeline:
// manifest -> canonical set entries -> per-set lesson context ->
// canonical lessons, then validates each against the bundled schema.
//
// Success criterion: 100% of lessons parse without error. validate() failures
// are collected and printed as a discrepancy list (content the engine rejects)
// for per-case diagnosis - never silently softened.
//
// On-demand only (needs network); NOT part of the mandatory CI. The CI truth is
// the vendored fixtures. Run: `make conformance-real`.
//
// Env:
//   CONFORMANCE_LOCAL=/abs/dir  Use existing local clones under this parent dir
//                               (siblings named like the repos) instead of
//                               cloning - for offline verification.

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  asContentSetEntry,
  parseLesson,
  parseManifest,
  setBasePath,
  validateLesson,
  validateManifest,
} from "../dist/index.js";

const REPOS = [
  { name: "adaptive-learner-content", url: "https://github.com/astrapi69/adaptive-learner-content.git" },
  { name: "adaptive-learner-content-test", url: "https://github.com/astrapi69/adaptive-learner-content-test.git" },
  { name: "alc-psychology", url: "https://github.com/astrapi69/alc-psychology.git" },
  { name: "alc-programming", url: "https://github.com/astrapi69/alc-programming.git" },
  { name: "alc-technology", url: "https://github.com/astrapi69/alc-technology.git" },
  { name: "alc-ai", url: "https://github.com/astrapi69/alc-ai.git" },
  { name: "alc-traffic-knowledge", url: "https://github.com/astrapi69/alc-traffic-knowledge.git" },
  { name: "alc-dog-training", url: "https://github.com/astrapi69/alc-dog-training.git" },
  { name: "alc-die-waehrung-des-geistes", url: "https://github.com/astrapi69/alc-die-waehrung-des-geistes.git" },
];

const localParent = process.env.CONFORMANCE_LOCAL;

function resolveRepo(repo, workDir) {
  if (localParent) {
    const dir = join(localParent, repo.name);
    if (!existsSync(dir)) throw new Error(`local repo not found: ${dir}`);
    console.log(`  using local clone ${dir}`);
    return dir;
  }
  const dir = join(workDir, repo.name);
  console.log(`  cloning ${repo.url} (depth 1)`);
  execSync(`git clone --depth 1 --quiet ${repo.url} ${dir}`, { stdio: "inherit" });
  return dir;
}

function listLessonFiles(lessonsDir) {
  if (!existsSync(lessonsDir)) return [];
  return readdirSync(lessonsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(lessonsDir, name));
}

function countExercises(lesson, tally) {
  for (const step of lesson.steps ?? []) {
    if (step.type === "exercise" && step.exercise) {
      tally[step.exercise.type] = (tally[step.exercise.type] ?? 0) + 1;
    }
  }
}

function run() {
  const totals = { repos: 0, sets: 0, lessons: 0, parseErrors: 0, invalid: 0 };
  const exerciseTally = {};
  const discrepancies = [];
  const workDir = localParent ? null : mkdtempSync(join(tmpdir(), "lce-conformance-"));

  try {
    for (const repo of REPOS) {
      console.log(`\n== ${repo.name} ==`);
      totals.repos += 1;
      const repoDir = resolveRepo(repo, workDir);

      const manifestText = readFileSync(join(repoDir, "manifest.yaml"), "utf8");
      const manifest = parseManifest(manifestText);
      const manifestCheck = validateManifest(manifest);
      if (!manifestCheck.valid) {
        for (const issue of manifestCheck.errors) {
          discrepancies.push({ kind: "manifest", repo: repo.name, path: issue.path, message: issue.message });
        }
      }

      const sets = manifest?.sets ?? [];
      for (const parsedSet of sets) {
        totals.sets += 1;
        const entry = asContentSetEntry({ source: repo.name, branch: "main" }, parsedSet, null);
        const context = {
          language: entry.language,
          target_language: entry.target_language,
          source_language: entry.source_language,
          domain: entry.domain,
        };
        const lessonsDir = join(repoDir, setBasePath(parsedSet), "lessons");
        for (const lessonPath of listLessonFiles(lessonsDir)) {
          totals.lessons += 1;
          const rawLesson = readFileSync(lessonPath, "utf8");
          let lesson;
          try {
            lesson = parseLesson(rawLesson, context);
          } catch (error) {
            totals.parseErrors += 1;
            discrepancies.push({ kind: "parse", repo: repo.name, path: lessonPath, message: String(error) });
            continue;
          }
          countExercises(lesson, exerciseTally);
          const check = validateLesson(JSON.parse(rawLesson));
          if (!check.valid) {
            totals.invalid += 1;
            const rel = lessonPath.slice(repoDir.length + 1);
            for (const issue of check.errors.slice(0, 4)) {
              discrepancies.push({ kind: "validate", repo: repo.name, path: `${rel}${issue.path}`, message: issue.message });
            }
          }
        }
      }
    }
  } finally {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  }

  console.log("\n=== Conformance summary ===");
  console.log(`repos:   ${totals.repos}`);
  console.log(`sets:    ${totals.sets}`);
  console.log(`lessons: ${totals.lessons}`);
  console.log(`parse errors:    ${totals.parseErrors}`);
  console.log(`invalid lessons: ${totals.invalid}`);
  console.log("exercises by type:");
  for (const [type, count] of Object.entries(exerciseTally).sort()) {
    console.log(`  ${type.padEnd(16)} ${count}`);
  }

  if (discrepancies.length > 0) {
    console.log(
      `\n=== Discrepancies (${discrepancies.length}) - diagnose per case, do not silently soften ===`,
    );
    console.log(
      "  These are content-side findings (validate() enforces the same rules the app's\n" +
        "  Pydantic model_validators do). Triage each as content-error / engine-gap / app-\n" +
        "  tolerance; the engine is NOT softened to hide them.",
    );
    for (const item of discrepancies.slice(0, 60)) {
      console.log(`  [${item.kind}] ${item.repo}: ${item.path}\n           ${item.message}`);
    }
    if (discrepancies.length > 60) console.log(`  ... and ${discrepancies.length - 60} more`);
  }

  // Success criterion is PARSE (the whole real corpus flows through the engine).
  // validate() discrepancies are reported for content triage, not a target
  // failure, since they mean the engine correctly rejected malformed content.
  const parseClean = totals.parseErrors === 0;
  console.log(`\nparse success: ${parseClean ? "100%" : "FAILED"} (${totals.lessons - totals.parseErrors}/${totals.lessons})`);
  process.exit(parseClean ? 0 : 1);
}

run();
