export class EditHistory {
  constructor(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError('History limit must be a positive integer.');
    }
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  record(previousState) {
    this.undoStack.push(structuredClone(previousState));
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(currentState) {
    if (!this.canUndo) {
      return null;
    }
    this.redoStack.push(structuredClone(currentState));
    if (this.redoStack.length > this.limit) {
      this.redoStack.shift();
    }
    return this.undoStack.pop();
  }

  redo(currentState) {
    if (!this.canRedo) {
      return null;
    }
    this.undoStack.push(structuredClone(currentState));
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
