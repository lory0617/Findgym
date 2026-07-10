// Reconcile device-local saved ids with the cloud copy. Pure and testable;
// the app wraps these with the async backend client.
export function mergeSavedIds(localIds, cloudIds, excludedIds = []) {
  const local = Array.isArray(localIds) ? localIds : [];
  const cloud = Array.isArray(cloudIds) ? cloudIds : [];
  const excluded = new Set(Array.isArray(excludedIds) ? excludedIds : []);
  const merged = [];
  for (const id of [...local, ...cloud]) {
    if (id && !excluded.has(id) && !merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}
