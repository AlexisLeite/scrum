export function markdownTruncate(content: string, length: number) {
    let mustSlice = content.length > length;
    if (mustSlice) {
      content = content.slice(0, length)
      const sliceIndex = [...content.matchAll(/\n/g)][5];
      if (sliceIndex) {
        content = `${content.slice(0, sliceIndex.index)}\n...`
      }
    }

    return content;
}