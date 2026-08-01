import { useEffect } from 'react';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { history } from '@/state/history/HistoryStack';
import { DeleteEntityCommand } from '@/state/history/commands';
import { drawController } from '@/drawing/DrawController';
import { flyToEntity } from '@/globe/camera';
import { recenterGlobe } from '@/globe/CesiumViewer';
import type { ToolMode } from '@/entities/types';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger orbital hotkeys if in First-Person mode
      if (useUiStore.getState().firstPersonActive || useUiStore.getState().tool === 'walk') {
        return;
      }

      // Don't trigger hotkeys if typing inside form inputs or textareas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if (isCtrlOrCmd && key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (isCtrlOrCmd && key.toLowerCase() === 'y') ||
        (isCtrlOrCmd && e.shiftKey && key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        history.redo();
        return;
      }

      // Escape: Cancel active drawing / clear selection
      if (key === 'Escape') {
        e.preventDefault();
        drawController.cancelDrawing();
        useWorldStore.getState().select(null);
        useUiStore.getState().setTool('select');
        return;
      }

      // Delete / Backspace: Delete selected entity
      if (key === 'Delete' || key === 'Backspace') {
        const selectedId = useWorldStore.getState().selectedId;
        if (selectedId) {
          e.preventDefault();
          history.execute(new DeleteEntityCommand(selectedId));
          useWorldStore.getState().select(null);
        }
        return;
      }

      // Space or R: Fly to selected entity or recenter globe
      if (key === ' ' || key === 'Spacebar' || key.toLowerCase() === 'r') {
        const { selectedId, world } = useWorldStore.getState();
        if (selectedId && world.entities[selectedId]) {
          e.preventDefault();
          flyToEntity(world.entities[selectedId]);
        } else if (key.toLowerCase() === 'r') {
          e.preventDefault();
          recenterGlobe();
        }
        return;
      }

      // Tool Switching Hotkeys: 1-8
      const toolMap: Record<string, ToolMode> = {
        '1': 'select',
        '2': 'pan',
        '3': 'drawPolygon',
        '4': 'placePoint',
        '5': 'designAssist',
        '6': 'freehandDraw',
        '7': 'addPart',
        '8': 'eraseRegion',
      };

      if (toolMap[key]) {
        e.preventDefault();
        if (toolMap[key] !== 'drawPolygon') {
          drawController.cancelDrawing();
        }
        useUiStore.getState().setTool(toolMap[key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
