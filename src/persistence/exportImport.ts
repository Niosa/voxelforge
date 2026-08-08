import type { World } from '@/entities/types';

export function exportWorldToJsonFile(world: World): void {
  const jsonStr = JSON.stringify(world, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeName = world.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filename = `${safeName || 'world'}.terraforge.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importWorldFromJsonFile(file: File): Promise<World> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text) as World;

        if (!parsed.id || !parsed.name || !parsed.entities) {
          throw new Error('Invalid Terraforge world file format.');
        }

        // Standardize format
        const world: World = {
          id: parsed.id,
          name: parsed.name,
          entities: parsed.entities || {},
          camera: parsed.camera || {
            lon: 0,
            lat: 20,
            height: 12_000_000,
            heading: 0,
            pitch: -90,
          },
          version: 1,
        };

        resolve(world);
      } catch (err) {
        reject(new Error(`Failed to parse world file: ${(err as Error).message}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file from disk.'));
    reader.readAsText(file);
  });
}
