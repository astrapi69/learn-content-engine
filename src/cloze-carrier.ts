/**
 * Whether a cloze sentence carries text of its own (``W-CLOZE-NO-CARRIER``).
 * Shared by the rule and by ``migrate``, so the warning and the conversion it
 * recommends agree on which exercises they mean (engine#254).
 */

/** True when a cloze sentence still reads as a sentence once its blanks are
 *  removed: at least one letter or digit is left. A sentence of blanks,
 *  spaces and punctuation alone carries no context for the learner. */
export const carriesClozeText = (sentence: string): boolean =>
  /[\p{L}\p{N}]/u.test(sentence.split("___").join(" "));
