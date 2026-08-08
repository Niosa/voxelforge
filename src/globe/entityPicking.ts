type PickedCesiumObject = {
  id?: unknown;
  primitive?: { id?: unknown };
};

function candidateIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];

  const object = value as { id?: unknown; terraEntityId?: unknown };
  return [object.terraEntityId, object.id].filter(
    (candidate): candidate is string => typeof candidate === 'string',
  );
}

/** Resolve a Cesium pick result back to a persistent VoxelForge world entity. */
export function resolvePickedWorldEntityId(
  picked: unknown,
  worldEntityIds: ReadonlySet<string>,
): string | null {
  if (!picked || typeof picked !== 'object') return null;

  const result = picked as PickedCesiumObject;
  const candidates = [
    ...candidateIds(result.id),
    ...candidateIds(result.primitive?.id),
  ];

  return candidates.find((candidate) => worldEntityIds.has(candidate)) ?? null;
}
