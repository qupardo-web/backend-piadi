const { test } = require('node:test');
const assert = require('node:assert/strict');
const cacheService = require('../src/services/cacheService');
const { CacheService } = require('../src/services/cacheService');

test('CacheService - get and set with hit/miss tracking', () => {
  const cache = new CacheService({ defaultTTL: 1000 });

  assert.equal(cache.get('nonexistent'), null);
  assert.equal(cache.stats().misses, 1);

  cache.set('key1', { foo: 'bar' });
  const val = cache.get('key1');
  assert.deepEqual(val, { foo: 'bar' });
  assert.equal(cache.stats().hits, 1);
});

test('CacheService - TTL expiration', async () => {
  const cache = new CacheService({ defaultTTL: 50 }); // 50ms TTL

  cache.set('expiringKey', 'alive', 50);
  assert.equal(cache.get('expiringKey'), 'alive');

  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(cache.get('expiringKey'), null);
});

test('CacheService - wrap executes fetchFn only on cache miss', async () => {
  const cache = new CacheService({ defaultTTL: 1000 });
  let callCount = 0;

  const fetcher = async () => {
    callCount++;
    return { data: 42 };
  };

  const res1 = await cache.wrap('calcKey', fetcher);
  assert.deepEqual(res1, { data: 42 });
  assert.equal(callCount, 1);

  const res2 = await cache.wrap('calcKey', fetcher);
  assert.deepEqual(res2, { data: 42 });
  assert.equal(callCount, 1); // Not called again!
});

test('CacheService - del and delByPrefix', () => {
  const cache = new CacheService();
  cache.set('kpi:vcm:1', 'val1');
  cache.set('kpi:vcm:2', 'val2');
  cache.set('kpi:ec:1', 'val3');

  assert.equal(cache.get('kpi:vcm:1'), 'val1');

  const deleted = cache.delByPrefix('kpi:vcm:');
  assert.equal(deleted, 2);
  assert.equal(cache.get('kpi:vcm:1'), null);
  assert.equal(cache.get('kpi:vcm:2'), null);
  assert.equal(cache.get('kpi:ec:1'), 'val3');
});

test('CacheService - invalidateDepartment removes relevant caches', () => {
  const cache = new CacheService();
  cache.set('kpi:vinculacion_medio:total', 10);
  cache.set('filters:vinculacion_medio:all', ['a', 'b']);
  cache.set('landing:metas', [{ id: 1 }]);
  cache.set('kpi:educacion_continua:total', 20);

  cache.invalidateDepartment('vinculacion_medio');

  assert.equal(cache.get('kpi:vinculacion_medio:total'), null);
  assert.equal(cache.get('filters:vinculacion_medio:all'), null);
  assert.equal(cache.get('landing:metas'), null);
  assert.equal(cache.get('kpi:educacion_continua:total'), 20);
});

test('CacheService - invalidateMetas removes metas and landing caches', () => {
  const cache = new CacheService();
  cache.set('metas:list', [1, 2]);
  cache.set('landing:metas', [3, 4]);
  cache.set('kpi:vcm:1', 100);

  cache.invalidateMetas();

  assert.equal(cache.get('metas:list'), null);
  assert.equal(cache.get('landing:metas'), null);
  assert.equal(cache.get('kpi:vcm:1'), 100);
});

test('CacheService - flush clears everything', () => {
  const cache = new CacheService();
  cache.set('k1', 1);
  cache.set('k2', 2);

  cache.flush();

  assert.equal(cache.stats().size, 0);
  assert.equal(cache.get('k1'), null);
});

test('CacheService - maxItems evicts oldest entries', () => {
  const cache = new CacheService({ maxItems: 3 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  cache.set('d', 4); // should evict 'a'

  assert.equal(cache.get('a'), null);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.get('d'), 4);
});
