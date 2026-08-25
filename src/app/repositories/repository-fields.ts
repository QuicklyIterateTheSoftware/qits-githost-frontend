/**
 * How a repository record is drawn: its storage id, and whatever else the host chose to say.
 *
 * **There is no clone-address helper here, and there must not be one.** A repository's id on this
 * host is an opaque storage key minted by qits-projects — it is not a name, and `/git/<id>` is an
 * internal route only qits-projects may call. Building that string here would put an address on
 * screen that no reader can use and that the host will refuse them. The one public clone address is
 * project-scoped, `/git/<project>/<repository>`, and it is spelled on the Projects pages. An
 * orphan, the only kind of record this helper draws now, has no project left to spell one with.
 */
import type { RepositoryDto } from '../api/dto';

/** One extra field of a repository record, ready to draw: the service's own name for it, and a value. */
export interface RepositoryField {
  readonly name: string;
  readonly value: string;
}

/**
 * Everything the service sent about a repository beyond its id, in the order it sent it.
 *
 * The record is expected to grow — the service is being built beside this client — so the page
 * shows what arrives rather than a fixed set of columns. Fields with nothing in them are dropped:
 * a label above an empty cell claims the service answered "nothing" when it answered nothing at
 * all.
 *
 * Names are left exactly as the wire spells them, so a reader can match a cell to the API.
 */
export function extraFields(repository: RepositoryDto): readonly RepositoryField[] {
  return Object.entries(repository)
    .filter(([name]) => name !== 'id')
    .map(([name, value]) => ({ name, value: describeValue(value) }))
    .filter((field): field is RepositoryField => field.value !== null);
}

/**
 * One value as a line of text, or null for a value there is nothing to say about.
 *
 * Objects and arrays are printed as JSON rather than skipped: an unexpected shape is still an
 * answer, and hiding it would make a service change invisible here.
 */
function describeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? null
      : value.map((item) => describeValue(item) ?? 'null').join(', ');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
