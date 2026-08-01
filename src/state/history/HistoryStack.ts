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

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

export const history = new HistoryStack();
