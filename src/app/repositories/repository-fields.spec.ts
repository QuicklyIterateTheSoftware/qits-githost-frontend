import { cloneAddress, extraFields } from './repository-fields';

describe('cloneAddress', () => {
  it('puts the id under the git segment, not this app’s', () => {
    expect(cloneAddress('qits-ci')).toBe('/git/qits-ci');
  });
});

/**
 * The defensive half of the contract: only `id` is promised, everything else is drawn from whatever
 * arrived. These cases are the ones that would otherwise reach the template as a crash or as a blank
 * cell that reads like an answer.
 */
describe('extraFields', () => {
  it('has nothing to add for a record of nothing but an id', () => {
    expect(extraFields({ id: 'qits-ci' })).toEqual([]);
  });

  it('keeps the service’s own names, in the order they arrived', () => {
    expect(extraFields({ id: 'qits-ci', defaultBranch: 'main', branchCount: 3 })).toEqual([
      { name: 'defaultBranch', value: 'main' },
      { name: 'branchCount', value: '3' },
    ]);
  });

  it('drops fields with nothing in them rather than labelling a blank', () => {
    expect(extraFields({ id: 'qits-ci', description: null, mirror: undefined, tags: [] })).toEqual(
      [],
    );
  });

  it('draws false, which is an answer, and not as absence', () => {
    expect(extraFields({ id: 'qits-ci', empty: false })).toEqual([
      { name: 'empty', value: 'false' },
    ]);
  });

  it('flattens a list and prints an unexpected shape rather than hiding it', () => {
    expect(extraFields({ id: 'qits-ci', branches: ['main', 'wip'], head: { sha: 'abc' } })).toEqual(
      [
        { name: 'branches', value: 'main, wip' },
        { name: 'head', value: '{"sha":"abc"}' },
      ],
    );
  });
});
