export type CacheLifecycleStatus = "approved" | "retired";

export function isCacheReusable(status: CacheLifecycleStatus) {
  return status === "approved";
}

export function canRetireCacheItem(status: CacheLifecycleStatus, reason: string) {
  return status === "approved" && reason.trim().length >= 10;
}
