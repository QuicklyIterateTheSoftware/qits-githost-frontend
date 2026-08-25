/**
 * The tree the Code page draws, as pure functions — copied from qits-spa-workspaces'
 * `detail/files/tree-model.ts` and trimmed to this page's needs.
 *
 * What was trimmed, and why it could be: the workspaces model carries `lazy` nodes (the daemon
 * stubs gitignored directories), filter layers, framework detection and search-driven expansion. A
 * bare repository has none of that — the tree listing is one eager answer holding every blob path,
 * nothing is gitignored (an ignored file is simply not committed), and v1 has no filter box. What
 * remains is the load-bearing half: building the tree from deep slash-separated paths with the
 * directories implied, and flattening it with single-child directory chains folded into one row.
 */

/** What a node is. No `lazy` here: every directory's contents are already in hand. */
export type NodeKind = 'file' | 'dir';

/** One node of the committed tree, as this app models it. */
export interface TreeNode {
  readonly kind: NodeKind;
  /** Repository-root-relative. The empty string is the tree root, which is never rendered. */
  readonly path: string;
  /** The last segment, which is what a row shows. */
  readonly name: string;
  readonly children: readonly TreeNode[];
}

/** A root with nothing in it — what the tree is before the first answer arrives. */
export const EMPTY_NODE: TreeNode = { kind: 'dir', path: '', name: '', children: [] };

/** One rendered line of the tree. Compaction means a row is not always one node. */
export interface TreeRow {
  /** The node the row acts on: for a compacted chain, the deepest directory in it. */
  readonly node: TreeNode;
  /**
   * The folded ancestors' names, outermost first — `['src', 'main']` for a row reading
   * `src / main / java`. Rendered dimmed and smaller so the final segment stands out.
   */
  readonly prefix: readonly string[];
  /**
   * Every directory path this one row stands for, deepest last. Toggling a compacted row writes
   * all of them, so ancestors are already open if a later change splits the chain apart.
   */
  readonly chain: readonly string[];
  /** Indent level. A whole chain counts as one. */
  readonly depth: number;
  /** Whether this row's children are showing. */
  readonly open: boolean;
}

/**
 * Build the tree from the listing's blob paths. Directories are implied by the paths and created
 * on the way down — the same trick the workspaces root listing uses, and what makes the eager
 * `GET …/tree` answer enough on its own.
 */
export function buildTree(paths: readonly string[]): TreeNode {
  const draft = newDraft('dir', '', '');
  for (const path of paths) {
    addFile(draft, path);
  }
  return freeze(draft);
}

/**
 * The rows to render, in order: closed directories are not descended into, and a run of
 * single-child directories folds into one `src / main / java` row.
 */
export function flatten(root: TreeNode, expanded: ReadonlySet<string>): readonly TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (parent: TreeNode, depth: number): void => {
    for (const child of parent.children) {
      if (child.kind === 'file') {
        rows.push({ node: child, prefix: [], chain: [], depth, open: false });
        continue;
      }
      const chain = foldChain(child);
      const tail = chain[chain.length - 1];
      const open = expanded.has(tail.path);
      rows.push({
        node: tail,
        prefix: chain.slice(0, -1).map((node) => node.name),
        chain: chain.map((node) => node.path),
        depth,
        open,
      });
      if (open) {
        walk(tail, depth + 1);
      }
    }
  };
  walk(root, 0);
  return rows;
}

/** Every ancestor directory path of `path`, shallowest first — what opening a deep link expands. */
export function ancestorDirs(path: string): readonly string[] {
  const segments = path.split('/').filter((segment) => segment !== '');
  return segments.slice(0, -1).map((_, at) => segments.slice(0, at + 1).join('/'));
}

// ---- the mechanics ------------------------------------------------------------------------------

interface Draft {
  kind: NodeKind;
  path: string;
  name: string;
  children: Map<string, Draft>;
}

function newDraft(kind: NodeKind, path: string, name: string): Draft {
  return { kind, path, name, children: new Map() };
}

function addFile(root: Draft, path: string): void {
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) {
    return;
  }
  let node = root;
  for (let at = 0; at < segments.length - 1; at += 1) {
    node = childDraft(node, segments[at]);
  }
  const name = segments[segments.length - 1];
  if (node.children.has(name)) {
    // A directory already stands here (an earlier path implied it). A file cannot replace it.
    return;
  }
  node.children.set(name, newDraft('file', joinPath(node.path, name), name));
}

function childDraft(parent: Draft, name: string): Draft {
  const existing = parent.children.get(name);
  if (existing) {
    return existing;
  }
  const made = newDraft('dir', joinPath(parent.path, name), name);
  parent.children.set(name, made);
  return made;
}

/** Directories before files, then by name — the order every file browser has. */
function freeze(draft: Draft): TreeNode {
  const children = [...draft.children.values()]
    .map(freeze)
    .sort(
      (left, right) => rankOf(left) - rankOf(right) || left.name.localeCompare(right.name, 'en'),
    );
  return { kind: draft.kind, path: draft.path, name: draft.name, children };
}

function rankOf(node: TreeNode): number {
  return node.kind === 'file' ? 1 : 0;
}

/** Fold a run of single-child directories into one row. */
function foldChain(head: TreeNode): readonly TreeNode[] {
  const chain: TreeNode[] = [head];
  let node = head;
  for (;;) {
    const only = node.children.length === 1 ? node.children[0] : null;
    if (!only || only.kind !== 'dir') {
      return chain;
    }
    chain.push(only);
    node = only;
  }
}

function joinPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`;
}
