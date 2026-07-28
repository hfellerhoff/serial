export function prepareArrayChunks<T>(list: T[], length: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += length) {
    const end = Math.min(i + length, list.length);
    chunks.push(list.slice(i, end));
  }
  return chunks;
}

export function assembleIteratorResult<
  TId extends string | number,
  T extends { id: TId },
>(data: T[][]) {
  return data.reduce((acc, cur) => {
    cur.forEach((item) => {
      const existingIndex = acc.findIndex(
        (existingItem) => existingItem.id === item.id,
      );
      if (existingIndex >= 0) {
        acc.splice(existingIndex, 1, item);
      } else {
        acc.push(item);
      }
    });

    return acc;
  }, []);
}
