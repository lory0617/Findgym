export function mergeGymDatasets(existingGyms, incomingGyms) {
  const existing = Array.isArray(existingGyms) ? existingGyms : [];
  const incoming = Array.isArray(incomingGyms) ? incomingGyms : [];
  const seen = new Set(existing.map((gym) => buildVenueKey(gym)));
  const merged = [...existing];
  const added = [];
  const skipped = [];

  incoming.forEach((gym, index) => {
    const key = buildVenueKey(gym);

    if (!key) {
      skipped.push({
        index,
        id: gym?.id || "",
        name: gym?.name || "",
        reason: "missing_merge_key"
      });
      return;
    }

    if (seen.has(key)) {
      skipped.push({
        index,
        id: gym?.id || "",
        name: gym?.name || "",
        reason: "duplicate_existing"
      });
      return;
    }

    seen.add(key);
    merged.push(gym);
    added.push(gym);
  });

  return {
    merged,
    added,
    skipped
  };
}

function buildVenueKey(gym) {
  const parts = [gym?.name, gym?.city, gym?.district, gym?.address].map(normalizeKeyPart);

  if (parts.some((part) => !part)) {
    return "";
  }

  return parts.join("|");
}

function normalizeKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("臺", "台")
    .replace(/\s+/g, "");
}
