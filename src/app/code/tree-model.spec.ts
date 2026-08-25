import { ancestorDirs, buildTree, flatten } from './tree-model';

/**
 * The tree as arithmetic — building from deep paths with directories implied, ordering, and the
 * single-child chain compaction. Trimmed with the model from the workspaces spec: no lazy stubs
 * and no filters here, so their cases went with them.
 */
describe('tree-model', () => {
  it('implies directories from deep paths and orders directories before files', () => {
    const root = buildTree(['README.md', 'src/app/main.ts', 'src/index.html']);

    expect(root.children.map((child) => child.name)).toEqual(['src', 'README.md']);
    const src = root.children[0];
    expect(src.kind).toBe('dir');
    expect(src.children.map((child) => child.path)).toEqual(['src/app', 'src/index.html']);
  });

  it('keeps a directory when a path later spells a file of the same name', () => {
    const root = buildTree(['tools/build/run.sh', 'tools/build']);
    const tools = root.children[0];
    expect(tools.children).toHaveLength(1);
    expect(tools.children[0].kind).toBe('dir');
  });

  it('folds a run of single-child directories into one row', () => {
    const root = buildTree(['src/main/java/App.java', 'README.md']);
    const rows = flatten(root, new Set());

    expect(rows).toHaveLength(2);
    expect(rows[0].prefix).toEqual(['src', 'main']);
    expect(rows[0].node.name).toBe('java');
    expect(rows[0].chain).toEqual(['src', 'src/main', 'src/main/java']);
    expect(rows[0].open).toBe(false);
  });

  it('descends only into open directories, and a chain opens as one', () => {
    const root = buildTree(['src/main/java/App.java']);

    expect(flatten(root, new Set())).toHaveLength(1);
    const open = flatten(root, new Set(['src', 'src/main', 'src/main/java']));
    expect(open.map((row) => row.node.name)).toEqual(['java', 'App.java']);
    expect(open[0].open).toBe(true);
    expect(open[1].depth).toBe(1);
  });

  it('splits a chain where a directory has two visible children', () => {
    const root = buildTree(['src/main/App.java', 'src/test/AppTest.java']);
    const rows = flatten(root, new Set(['src']));

    expect(rows.map((row) => row.node.name)).toEqual(['src', 'main', 'test']);
    expect(rows[1].prefix).toEqual([]);
  });

  it('names the ancestors a deep link must open', () => {
    expect(ancestorDirs('src/app/code/main.ts')).toEqual(['src', 'src/app', 'src/app/code']);
    expect(ancestorDirs('README.md')).toEqual([]);
  });
});
