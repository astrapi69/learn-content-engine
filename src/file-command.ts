/**
 * Shared scaffolding for the file-oriented CLI cores (`lint`, `migrate`): the
 * common report shape, the errors-only exit code, the `<command> <file...>
 * [--flag...]` arg split, and the invalid-file line. `cli.ts` and `migrate.ts`
 * build their command-specific pieces on top instead of re-deriving this
 * plumbing (the bin shim still owns filesystem access).
 */

/** The fields every per-file CLI report carries; command-specific reports
 *  ({@link LintReport}, {@link MigrateReport}) extend this. `ok` is
 *  errors-only - a file with warnings but no errors is still ``ok``. */
export interface FileReport {
  path: string;
  ok: boolean;
  parseError?: string;
}

/** Exit code for a batch of file reports: ``1`` iff any file failed (parse
 *  error or validation error), ``0`` otherwise. Warnings never fail. */
export function exitCodeFor(reports: FileReport[]): number {
  return reports.every((report) => report.ok) ? 0 : 1;
}

/** The human-output line for a file that could not be parsed/read. */
export function parseErrorLine(report: FileReport): string {
  return `ERROR ${report.path}: invalid JSON - ${report.parseError}`;
}

/** A parsed file command: the file paths plus the set of boolean flags that
 *  were present, or a usage error. */
export type ParsedFileArgs = { paths: string[]; flags: Set<string> } | { error: string };

/**
 * Split ``<command> <file...> [--flag...]`` into paths + the present flags.
 * ``expected`` is the usage hint shown when ``argv[0]`` is not ``command``;
 * ``usage`` is returned when no file paths remain. Known flag tokens are
 * removed from the path list wherever they appear.
 */
export function parseFileArgs(
  command: string,
  argv: string[],
  knownFlags: string[],
  expected: string,
  usage: string,
): ParsedFileArgs {
  if (argv[0] !== command) {
    return { error: `unknown command '${argv[0] ?? ""}' (expected: ${expected})` };
  }
  const rest = argv.slice(1);
  const flags = new Set(knownFlags.filter((flag) => rest.includes(flag)));
  const paths = rest.filter((arg) => !knownFlags.includes(arg));
  if (paths.length === 0) {
    return { error: usage };
  }
  return { paths, flags };
}
