export interface Command {
  name: string;
  execute: () => void;
  undo: () => void;
}

export class HistoryStack {
  private past: Command[] = [];
  private future: Command[] = [];
  private readonly max = 100;

  execute(cmd: Command): void {
    cmd.execute();
    this.past.push(cmd);
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
  }

  undo(): void {
    const cmd = this.past.pop();
    if (!cmd) return;
    cmd.undo();
    this.future.push(cmd);
  }

  redo(): void {
    const cmd = this.future.pop();
    if (!cmd) return;
    cmd.execute();
    this.past.push(cmd);
  }

  /** True when there is at least one action to undo. */
  get canUndo(): boolean {
    return this.past.length > 0;
  }

  /** True when there is at least one action to redo. */
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Human-readable label of the next undoable action, or undefined. */
  get undoLabel(): string | undefined {
    return this.past[this.past.length - 1]?.name;
  }

  /** Human-readable label of the next redoable action, or undefined. */
  get redoLabel(): string | undefined {
    return this.future[this.future.length - 1]?.name;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

export const history = new HistoryStack();
