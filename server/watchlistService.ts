export type WatchlistStore = {
  findExisting: (userId: number, propId: number) => Promise<number | undefined>;
  remove: (watchlistId: number) => Promise<void>;
  save: (userId: number, propId: number) => Promise<void>;
};

export async function toggleWatchlistRecord(store: WatchlistStore, userId: number, propId: number) {
  const existingId = await store.findExisting(userId, propId);
  if (existingId !== undefined) {
    await store.remove(existingId);
    return { saved: false } as const;
  }

  await store.save(userId, propId);
  return { saved: true } as const;
}
