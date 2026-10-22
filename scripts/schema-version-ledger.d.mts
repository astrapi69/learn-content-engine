export interface SchemaSetTexts {
  lesson: string;
  manifest: string;
}

export function schemaSetDigest(texts: SchemaSetTexts): string;

export function schemaSetVersions(texts: SchemaSetTexts): { lesson: string; manifest: string };

export function ledgerFindings(ledger: Record<string, string>, texts: SchemaSetTexts): string[];
