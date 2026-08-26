import { describe, expect, it, vi } from "vitest";
import { toggleWatchlistRecord } from "./watchlistService";

describe("watchlist persistence", () => {
  it("saves a prop when the user has not already saved it", async () => {
    const store = {
      findExisting: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    };
    await expect(toggleWatchlistRecord(store, 7, 42)).resolves.toEqual({ saved: true });
    expect(store.save).toHaveBeenCalledWith(7, 42);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("removes a prop when the user has already saved it", async () => {
    const store = {
      findExisting: vi.fn().mockResolvedValue(99),
      remove: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    };
    await expect(toggleWatchlistRecord(store, 7, 42)).resolves.toEqual({ saved: false });
    expect(store.remove).toHaveBeenCalledWith(99);
    expect(store.save).not.toHaveBeenCalled();
  });
});
