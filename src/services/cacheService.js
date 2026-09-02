/**
 * Centralized In-Memory Caching Service for PIADI
 * Accelerates read-heavy operations (KPIs, Series, Breakdowns, Filters, Landing Metas)
 * with automatic invalidation (cache busting) upon file uploads or entity modifications.
 */

class CacheService {
  constructor(options = {}) {
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutos por defecto
    this.maxItems = options.maxItems || 2000;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (!this.store.has(key)) {
      this.misses++;
      return null;
    }

    const item = this.store.get(key);
    const now = Date.now();

    if (now > item.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return item.value;
  }

  set(key, value, ttlMs = this.defaultTTL) {
    if (this.store.size >= this.maxItems) {
      // Eliminar el primer elemento (FIFO/LRU básico)
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }

    const expiresAt = Date.now() + (ttlMs || this.defaultTTL);
    this.store.set(key, { value, expiresAt });
    return value;
  }

  del(key) {
    return this.store.delete(key);
  }

  delByPrefix(prefix) {
    let deletedCount = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  flush() {
    const count = this.store.size;
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    return count;
  }

  async wrap(key, fetchFn, ttlMs = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const freshValue = await fetchFn();
    this.set(key, freshValue, ttlMs);
    return freshValue;
  }

  invalidateDepartment(deptKey) {
    const key = String(deptKey || '').toLowerCase();
    this.delByPrefix(`kpi:${key}:`);
    this.delByPrefix(`filters:${key}:`);
    this.delByPrefix(`dept:${key}:`);
    this.delByPrefix('landing:metas');
    this.delByPrefix('metas:');
  }

  invalidateMetas() {
    this.delByPrefix('metas:');
    this.delByPrefix('landing:metas');
  }

  stats() {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)) : 0
    };
  }
}

const cacheService = new CacheService();

module.exports = cacheService;
module.exports.CacheService = CacheService;
