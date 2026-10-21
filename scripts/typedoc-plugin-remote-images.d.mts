/** Type surface of typedoc-plugin-remote-images.mjs for the Vitest suite (src/typedoc-remote-images.test.ts). */

/** What the plugin needs from TypeDoc's Application: its renderer's event hook. */
export interface MarkdownHookHost {
  renderer: {
    on(event: string, listener: (event: { parsedText: string }) => void, priority?: number): void;
  };
}

export function remoteImagesToAltText(html: string): string;
export function load(app: MarkdownHookHost): void;
