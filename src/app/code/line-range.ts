/**
 * The `?lines=` grammar, shared between the page (which parses the URL) and the viewer (which
 * paints the range). Copied from qits-spa-workspaces' `detail/files/file-navigation.ts` — the same
 * spelling on both apps is what makes a deep link portable between them.
 */

/** A range of lines, one-based and inclusive at both ends — the way a file's own numbers read. */
export interface LineRange {
  readonly startLine: number;
  readonly endLine: number;
}

/** `12` for one line, `12-20` for a range — what `?lines=` holds. */
export function formatRange(range: LineRange): string {
  return range.startLine === range.endLine
    ? `${range.startLine}`
    : `${range.startLine}-${range.endLine}`;
}

/**
 * Read a `lines` parameter. Anything unreadable is no anchor rather than an error: the parameter
 * is hand-editable and arrives from other services, and a malformed one should cost the highlight,
 * never the file.
 */
export function parseRange(value: string | null): LineRange | null {
  if (!value) {
    return null;
  }
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1 || end < start) {
    return null;
  }
  return { startLine: start, endLine: end };
}
