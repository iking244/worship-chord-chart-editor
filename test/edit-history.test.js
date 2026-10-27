import assert from 'node:assert/strict';
import test from 'node:test';
import { EditHistory } from '../src/shared/edit-history.js';

test('undo and redo restore snapshots and new edits discard redo history', () => {
  const history = new EditHistory();
  const first = { title: 'First', sections: [] };
  const second = { title: 'Second', sections: [{ name: 'Verse' }] };
  const third = { title: 'Third', sections: [{ name: 'Verse' }, { name: 'Chorus' }] };

  history.record(first);
  assert.deepEqual(history.undo(second), first);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(first), second);
  assert.equal(history.canUndo, true);

  history.record(second);
  assert.deepEqual(history.undo(third), second);
  history.record(first);
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(second), null);
});

test('history enforces its capacity and clones recorded states', () => {
  const history = new EditHistory(2);
  const state = { value: 1 };
  history.record(state);
  state.value = 99;
  history.record({ value: 2 });
  history.record({ value: 3 });

  assert.deepEqual(history.undo({ value: 4 }), { value: 3 });
  assert.deepEqual(history.undo({ value: 3 }), { value: 2 });
  assert.equal(history.undo({ value: 2 }), null);
  assert.throws(() => new EditHistory(0), /positive integer/);
});
