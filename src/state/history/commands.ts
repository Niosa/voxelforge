import type { TerraEntity } from '@/entities/types';
import { useWorldStore } from '@/state/worldStore';
import type { Command } from './HistoryStack';

export class AddEntityCommand implements Command {
  name = 'AddEntity';
  constructor(private entity: TerraEntity) {}

  execute(): void {
    useWorldStore.getState().upsertEntity(this.entity);
  }

  undo(): void {
    useWorldStore.getState().removeEntity(this.entity.id);
  }
}

/** Adds several entities as ONE undoable action (e.g. a completed island chain). */
export class AddEntitiesCommand implements Command {
  name = 'AddEntities';
  constructor(private entities: TerraEntity[]) {}

  execute(): void {
    const store = useWorldStore.getState();
    for (const e of this.entities) {
      store.upsertEntity(e);
    }
  }

  undo(): void {
    const store = useWorldStore.getState();
    for (const e of this.entities) {
      store.removeEntity(e.id);
    }
  }
}

export class DeleteEntityCommand implements Command {
  name = 'DeleteEntity';
  private snapshot: TerraEntity | null = null;

  constructor(private id: string) {}

  execute(): void {
    const entity = useWorldStore.getState().world.entities[this.id];
    if (!entity) return;
    this.snapshot = structuredClone(entity);
    useWorldStore.getState().removeEntity(this.id);
  }

  undo(): void {
    if (this.snapshot) {
      useWorldStore.getState().upsertEntity(this.snapshot);
    }
  }
}

export class UpdateEntityCommand implements Command {
  name = 'UpdateEntity';
  private before: TerraEntity | null = null;

  constructor(
    private id: string,
    private patch: Partial<TerraEntity>,
  ) {}

  execute(): void {
    const entity = useWorldStore.getState().world.entities[this.id];
    if (!entity) return;
    this.before = structuredClone(entity);
    useWorldStore.getState().updateEntity(this.id, this.patch);
  }

  undo(): void {
    if (!this.before) return;
    useWorldStore.getState().upsertEntity(this.before);
  }
}
