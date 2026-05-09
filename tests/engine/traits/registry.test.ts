import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TraitModelRegistry,
  UnknownTraitModelError,
  type TraitModel,
} from '../../../src/engine/traits/index.js';

const minimalModel: TraitModel = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Two-axis test model.',
  axes: [
    { id: 'a', label: 'A', description: 'first' },
    { id: 'b', label: 'B', description: 'second' },
  ],
  defaults: { a: 0.5, b: 0.5 },
  drift: {
    outcomes: { a: { risky_success: 0.05 } },
    leaderPull: { a: 0.05, b: 0.05 },
    roleActivation: { a: 0.02, b: 0.02 },
  },
  cues: {
    a: { low: 'low-a', high: 'high-a' },
    b: { low: 'low-b', high: 'high-b' },
  },
};

describe('TraitModelRegistry', () => {
  it('register + get + require', () => {
    const reg = new TraitModelRegistry();
    reg.register(minimalModel);
    assert.equal(reg.get('minimal'), minimalModel);
    assert.equal(reg.require('minimal'), minimalModel);
  });

  it('get returns undefined for unknown id', () => {
    const reg = new TraitModelRegistry();
    assert.equal(reg.get('nope'), undefined);
  });

  it('require throws UnknownTraitModelError with helpful message', () => {
    const reg = new TraitModelRegistry();
    reg.register(minimalModel);
    assert.throws(
      () => reg.require('nope'),
      (err: unknown) => {
        assert.ok(err instanceof UnknownTraitModelError);
        assert.match((err as Error).message, /Unknown trait model id: 'nope'/);
        assert.match((err as Error).message, /Registered models: minimal/);
        return true;
      },
    );
  });

  it('list returns all registered in registration order', () => {
    const reg = new TraitModelRegistry();
    reg.register(minimalModel);
    reg.register({ ...minimalModel, id: 'second', name: 'Second' });
    const ids = reg.list().map(m => m.id);
    assert.deepEqual(ids, ['minimal', 'second']);
  });

  it('register throws on duplicate id', () => {
    const reg = new TraitModelRegistry();
    reg.register(minimalModel);
    assert.throws(() => reg.register(minimalModel), /already registered/);
  });

  it('register validates kebab-case id', () => {
    const reg = new TraitModelRegistry();
    assert.throws(
      () => reg.register({ ...minimalModel, id: 'Bad ID' }),
      /must be kebab-case/,
    );
  });

  it('register validates axes count 2..12', () => {
    const reg = new TraitModelRegistry();
    assert.throws(
      () => reg.register({ ...minimalModel, axes: [{ id: 'a', label: 'A', description: 'one only' }] }),
      /count must be 2..12/,
    );
  });

  it('register rejects defaults out of [0, 1]', () => {
    const reg = new TraitModelRegistry();
    assert.throws(
      () => reg.register({ ...minimalModel, defaults: { a: 1.5, b: 0.5 } }),
      /must be a number in \[0, 1\]/,
    );
  });

  it('register rejects drift referencing unknown axis', () => {
    const reg = new TraitModelRegistry();
    assert.throws(
      () => reg.register({
        ...minimalModel,
        drift: {
          outcomes: { c: { risky_success: 0.05 } },
          leaderPull: {},
          roleActivation: {},
        },
      }),
      /unknown axis 'c'/,
    );
  });
});
