export function markdownTruncate(content: string, length: number) {
  if (content.length <= length) {
    return content;
  }

  const previewSample = content.slice(0, length);
  const sliceIndex = [...previewSample.matchAll(/\n/g)][5];
  let endIndex = sliceIndex ? sliceIndex.index : previewSample.length;
  const openFence = findOpenFence(content.slice(0, endIndex));

  if (openFence) {
    const closingFenceIndex = findFenceClosureIndex(content, endIndex, openFence);
    endIndex = closingFenceIndex === -1 ? content.length : closingFenceIndex;
  }

  if (endIndex >= content.length) {
    return content;
  }

  return `${content.slice(0, endIndex).trimEnd()}\n...`;
}

type FenceMarker = {
  char: "`" | "~";
  size: number;
};

function findOpenFence(content: string): FenceMarker | null {
  let openFence: FenceMarker | null = null;

  for (const line of content.split("\n")) {
    if (!openFence) {
      openFence = parseFenceStart(line);
      continue;
    }

    if (isFenceClosure(line, openFence)) {
      openFence = null;
    }
  }

  return openFence;
}

function parseFenceStart(line: string): FenceMarker | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  const marker = match[1];
  return {
    char: marker[0] as FenceMarker["char"],
    size: marker.length
  };
}

function isFenceClosure(line: string, marker: FenceMarker): boolean {
  const match = /^(?: {0,3})(`{3,}|~{3,})\s*$/.exec(line);
  return Boolean(match && match[1][0] === marker.char && match[1].length >= marker.size);
}

function findFenceClosureIndex(content: string, fromIndex: number, marker: FenceMarker): number {
  const remaining = content.slice(fromIndex);
  const pattern = new RegExp(`\\n(?: {0,3})${marker.char}{${marker.size},}\\s*(?=\\n|$)`);
  const match = pattern.exec(remaining);

  if (!match) {
    return -1;
  }

  return fromIndex + match.index + match[0].length;
}
