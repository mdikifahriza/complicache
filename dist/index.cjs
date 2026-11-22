"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/errors.ts
var CacheSchemaError, CacheDriverError, CacheSerializationError;
var init_errors = __esm({
  "src/core/errors.ts"() {
    "use strict";
    CacheSchemaError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "CacheSchemaError";
      }
    };
    CacheDriverError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "CacheDriverError";
      }
    };
    CacheSerializationError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "CacheSerializationError";
      }
    };
  }
});

// src/drivers/memory.ts
var memory_exports = {};
__export(memory_exports, {
  createMemoryDriver: () => createMemoryDriver
});
function createMemoryDriver() {
  const store = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  const tagGeneration = /* @__PURE__ */ new Map();
  function buildKey(descriptor, args) {
    const parts = [descriptor.name, ...descriptor.keyParts];
    if (args.length > 0) {
      try {
        parts.push(JSON.stringify(args));
      } catch {
        parts.push(String(args));
      }
    }
    return parts.join(":");
  }
  function isExpired(entry) {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }
  function currentGeneration(tags) {
    let gen = 0;
    for (const tag of tags) {
      gen += tagGeneration.get(tag) ?? 0;
    }
    return gen;
  }
  function cloneValue(val) {
    if (val === null || val === void 0) return val;
    if (typeof val !== "object") return val;
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(val);
      }
    } catch {
    }
    try {
      return JSON.parse(JSON.stringify(val));
    } catch {
      return val;
    }
  }
  return {
    name: "memory",
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: false,
      supportsPrivate: false
    },
    wrap(fn, descriptor) {
      return async (...args) => {
        const key = buildKey(descriptor, args);
        const hit = store.get(key);
        const gen = currentGeneration(descriptor.tags);
        if (hit && !isExpired(hit) && hit.generation === gen) {
          return cloneValue(hit.value);
        }
        const existing = inflight.get(key);
        if (existing) {
          const result = await existing;
          return cloneValue(result);
        }
        const genAtStart = gen;
        const promise = fn(...args);
        inflight.set(key, promise);
        try {
          const result = await promise;
          const genNow = currentGeneration(descriptor.tags);
          if (genNow === genAtStart) {
            store.set(key, {
              value: cloneValue(result),
              // ttl === 0 means "expire immediately" (not permanent)
              // ttl === undefined means "permanent (no expiration)"
              expiresAt: descriptor.ttl !== void 0 && descriptor.ttl !== null ? Date.now() + descriptor.ttl * 1e3 : null,
              tags: new Set(descriptor.tags),
              generation: genAtStart
            });
          }
          return cloneValue(result);
        } finally {
          inflight.delete(key);
        }
      };
    },
    revalidateTag(tag) {
      tagGeneration.set(tag, (tagGeneration.get(tag) ?? 0) + 1);
      for (const [key, entry] of store.entries()) {
        if (entry.tags.has(tag)) {
          store.delete(key);
        }
      }
    },
    revalidatePath(_path, _type) {
    }
  };
}
var init_memory = __esm({
  "src/drivers/memory.ts"() {
    "use strict";
  }
});

// src/drivers/pass-through.ts
var pass_through_exports = {};
__export(pass_through_exports, {
  createPassThroughDriver: () => createPassThroughDriver
});
function createPassThroughDriver(options) {
  if (!options?.silent) {
    console.warn(
      "[complicache] Cache dinonaktifkan: berjalan dalam mode pass-through. Pasang Next.js atau berikan driver custom."
    );
  }
  return {
    name: "pass-through",
    capabilities: {
      supportsTags: false,
      supportsTTL: false,
      supportsRemote: false,
      supportsPrivate: false
    },
    wrap(fn) {
      return fn;
    },
    revalidateTag(_tag) {
    },
    revalidatePath(_path, _type) {
    }
  };
}
var init_pass_through = __esm({
  "src/drivers/pass-through.ts"() {
    "use strict";
  }
});

// src/drivers/next-modern.ts
var next_modern_exports = {};
__export(next_modern_exports, {
  createNextModernDriver: () => createNextModernDriver,
  ttlToProfile: () => ttlToProfile
});
function getNextCache() {
  try {
    return require("next/cache");
  } catch {
    throw new CacheDriverError(
      "[complicache] next/cache tidak ditemukan. Pastikan Next.js terinstall."
    );
  }
}
function ttlToProfile(ttl) {
  if (ttl === void 0) return "max";
  if (ttl <= 60) return "seconds";
  if (ttl <= 3600) return "minutes";
  if (ttl <= 86400) return "hours";
  if (ttl <= 604800) return "days";
  if (ttl <= 2592e3) return "weeks";
  return "max";
}
function isNext16Plus(nc) {
  return typeof nc.updateTag === "function" || typeof nc.cacheLife === "function";
}
function createNextModernDriver() {
  return {
    name: "next-modern",
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: true,
      supportsPrivate: true
    },
    wrap(fn, descriptor) {
      return getNextCache().unstable_cache(fn, descriptor.keyParts, {
        tags: descriptor.tags,
        ...descriptor.ttl !== void 0 ? { revalidate: descriptor.ttl } : {}
      });
    },
    revalidateTag(tag, options) {
      const nc = getNextCache();
      const next16 = isNext16Plus(nc);
      if (options?.mode === "now") {
        if (next16 && typeof nc.updateTag === "function") {
          nc.updateTag(tag);
          return;
        }
        if (next16) {
          try {
            nc.revalidateTag(tag, { expire: 0 });
            return;
          } catch {
          }
        }
        nc.revalidateTag(tag);
        return;
      }
      if (next16) {
        nc.revalidateTag(tag, "max");
      } else {
        nc.revalidateTag(tag);
      }
    },
    revalidatePath(path, type) {
      getNextCache().revalidatePath(path, type);
    }
  };
}
var init_next_modern = __esm({
  "src/drivers/next-modern.ts"() {
    "use strict";
    init_errors();
  }
});

// src/drivers/next-classic.ts
var next_classic_exports = {};
__export(next_classic_exports, {
  createNextClassicDriver: () => createNextClassicDriver
});
function getNextCache2() {
  try {
    return require("next/cache");
  } catch {
    throw new CacheDriverError(
      "[complicache] next/cache tidak ditemukan. Pastikan Next.js terinstall atau gunakan MemoryDriver."
    );
  }
}
function createNextClassicDriver() {
  return {
    name: "next-classic",
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: false,
      supportsPrivate: false
    },
    wrap(fn, descriptor) {
      return getNextCache2().unstable_cache(fn, descriptor.keyParts, {
        tags: descriptor.tags,
        ...descriptor.ttl !== void 0 ? { revalidate: descriptor.ttl } : {}
      });
    },
    revalidateTag(tag) {
      getNextCache2().revalidateTag(tag);
    },
    revalidatePath(path, type) {
      getNextCache2().revalidatePath(path, type);
    }
  };
}
var init_next_classic = __esm({
  "src/drivers/next-classic.ts"() {
    "use strict";
    init_errors();
  }
});

// src/drivers/auto.ts
var auto_exports = {};
__export(auto_exports, {
  createAutoDriver: () => createAutoDriver,
  detectDriver: () => detectDriver,
  resetAutoDriver: () => resetAutoDriver
});
async function tryLoadNextCache() {
  try {
    return require("next/cache");
  } catch {
  }
  try {
    const mod = await import("next/cache");
    return mod.default ?? mod;
  } catch {
  }
  return null;
}
async function detectDriver() {
  const nc = await tryLoadNextCache();
  if (nc) {
    if (typeof nc.cacheTag === "function") {
      try {
        const { createNextModernDriver: createNextModernDriver2 } = (init_next_modern(), __toCommonJS(next_modern_exports));
        return createNextModernDriver2();
      } catch {
        const mod = await Promise.resolve().then(() => (init_next_modern(), next_modern_exports));
        return mod.createNextModernDriver();
      }
    }
    if (typeof nc.unstable_cache === "function") {
      try {
        const { createNextClassicDriver: createNextClassicDriver2 } = (init_next_classic(), __toCommonJS(next_classic_exports));
        return createNextClassicDriver2();
      } catch {
        const mod = await Promise.resolve().then(() => (init_next_classic(), next_classic_exports));
        return mod.createNextClassicDriver();
      }
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[complicache] FATAL: next/cache tidak ditemukan di production. Cache dinonaktifkan secara diam-diam di production berbahaya. Pasang Next.js, atau sediakan driver eksplisit via options.driver (misalnya createMemoryDriver())."
    );
  }
  console.warn(
    "[complicache] Cache dinonaktifkan: berjalan dalam mode pass-through. Pasang Next.js atau berikan driver custom."
  );
  try {
    const { createPassThroughDriver: createPassThroughDriver2 } = (init_pass_through(), __toCommonJS(pass_through_exports));
    return createPassThroughDriver2({ silent: true });
  } catch {
    const mod = await Promise.resolve().then(() => (init_pass_through(), pass_through_exports));
    return mod.createPassThroughDriver({ silent: true });
  }
}
function createAutoDriver() {
  try {
    const nc = require("next/cache");
    if (typeof nc.cacheTag === "function") {
      const { createNextModernDriver: createNextModernDriver2 } = (init_next_modern(), __toCommonJS(next_modern_exports));
      return createNextModernDriver2();
    }
  } catch {
  }
  try {
    const nc = require("next/cache");
    if (typeof nc.unstable_cache === "function") {
      const { createNextClassicDriver: createNextClassicDriver2 } = (init_next_classic(), __toCommonJS(next_classic_exports));
      return createNextClassicDriver2();
    }
  } catch {
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[complicache] FATAL: next/cache tidak ditemukan di production. Sediakan driver eksplisit via options.driver."
    );
  }
  console.warn(
    "[complicache] Cache dinonaktifkan: berjalan dalam mode pass-through. Pasang Next.js atau berikan driver custom."
  );
  const { createPassThroughDriver: createPassThroughDriver2 } = (init_pass_through(), __toCommonJS(pass_through_exports));
  return createPassThroughDriver2({ silent: true });
}
function resetAutoDriver() {
}
var init_auto = __esm({
  "src/drivers/auto.ts"() {
    "use strict";
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  CacheDriverError: () => CacheDriverError,
  CacheSchemaError: () => CacheSchemaError,
  CacheSerializationError: () => CacheSerializationError,
  DEFAULT_MUTATION_OPERATIONS: () => DEFAULT_MUTATION_OPERATIONS,
  auditSchema: () => auditSchema,
  buildReverseGraph: () => buildReverseGraph,
  createAutoDriver: () => createAutoDriver,
  createCacheModule: () => createCacheModule,
  createMemoryDriver: () => createMemoryDriver,
  createNextAdapter: () => createNextAdapter,
  createNextClassicDriver: () => createNextClassicDriver,
  createNextModernDriver: () => createNextModernDriver,
  createPassThroughDriver: () => createPassThroughDriver,
  createPrismaInvalidator: () => createPrismaInvalidator,
  defaultSerializer: () => defaultSerializer,
  defineCacheSchema: () => defineCacheSchema,
  defineModelEffects: () => defineModelEffects,
  defineModelEffectsStrict: () => defineModelEffectsStrict,
  detectCycles: () => detectCycles,
  detectDriver: () => detectDriver,
  explain: () => explain,
  resetAutoDriver: () => resetAutoDriver,
  resolveDependents: () => resolveDependents,
  sanitizeTag: () => sanitizeTag,
  tagOf: () => tagOf,
  tagWithKey: () => tagWithKey,
  ttlToProfile: () => ttlToProfile
});
module.exports = __toCommonJS(src_exports);

// src/core/graph.ts
init_errors();
function detectCycles(schema) {
  const visited = /* @__PURE__ */ new Set();
  const inStack = /* @__PURE__ */ new Set();
  const path = [];
  function dfs(node) {
    visited.add(node);
    inStack.add(node);
    path.push(node);
    for (const dep of schema[node]?.dependsOn ?? []) {
      if (!schema[dep]) continue;
      if (!visited.has(dep)) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (inStack.has(dep)) {
        const cycleStart = path.indexOf(dep);
        const cycle = [...path.slice(cycleStart), dep];
        return cycle.join(" \u2192 ");
      }
    }
    path.pop();
    inStack.delete(node);
    return null;
  }
  for (const name of Object.keys(schema)) {
    if (!visited.has(name)) {
      const cycle = dfs(name);
      if (cycle) return cycle;
    }
  }
  return null;
}
function buildReverseGraph(schema) {
  const cycle = detectCycles(schema);
  if (cycle) {
    throw new CacheSchemaError(
      `[complicache] Circular dependency terdeteksi pada schema: ${cycle}`
    );
  }
  const graph = /* @__PURE__ */ new Map();
  for (const name of Object.keys(schema)) {
    graph.set(name, /* @__PURE__ */ new Set());
  }
  for (const [name, entry] of Object.entries(schema)) {
    for (const dep of entry.dependsOn ?? []) {
      if (!graph.has(dep)) {
        console.warn(
          `[complicache] "${name}" dependsOn "${dep}", tapi "${dep}" tidak ada di schema. Dependensi ini diabaikan.`
        );
        continue;
      }
      graph.get(dep).add(name);
    }
  }
  return graph;
}
function buildReverseGraphQuiet(schema) {
  const cycle = detectCycles(schema);
  if (cycle) {
    throw new CacheSchemaError(
      `[complicache] Circular dependency terdeteksi pada schema: ${cycle}`
    );
  }
  const graph = /* @__PURE__ */ new Map();
  for (const name of Object.keys(schema)) graph.set(name, /* @__PURE__ */ new Set());
  for (const [name, entry] of Object.entries(schema)) {
    for (const dep of entry.dependsOn ?? []) {
      graph.get(dep)?.add(name);
    }
  }
  return graph;
}
function resolveDependents(graph, names) {
  const result = /* @__PURE__ */ new Set();
  const queue = [...names];
  while (queue.length > 0) {
    const current = queue.shift();
    if (result.has(current)) continue;
    result.add(current);
    for (const dependent of graph.get(current) ?? []) {
      if (!result.has(dependent)) {
        queue.push(dependent);
      }
    }
  }
  return result;
}

// src/core/tag.ts
function sanitizeTag(tag) {
  return tag.replace(/[\x00\r\n]/g, "").replace(/[^\x20-\x7E]/g, "_").slice(0, 256).trim();
}
function tagOf(name) {
  return sanitizeTag(`cache:${name}`);
}
function tagWithKey(name, ...keyParts) {
  const parts = [`cache:${name}`, ...keyParts].filter(Boolean).join(":");
  return sanitizeTag(parts);
}

// src/core/audit.ts
function auditSchema(schema, modelEffects = {}) {
  const issues = [];
  const names = Object.keys(schema);
  for (const name of names) {
    for (const dep of schema[name]?.dependsOn ?? []) {
      if (!(dep in schema)) {
        issues.push({
          code: "depends-on-unknown-cache",
          subject: name,
          message: `Cache "${name}" dependsOn "${dep}", tetapi "${dep}" tidak ada di schema.`
        });
      }
    }
  }
  const triggers = [];
  for (const [model, effects] of Object.entries(modelEffects)) {
    if (!effects || effects === "none") continue;
    for (const cacheName of effects) {
      if (!(cacheName in schema)) {
        issues.push({
          code: "effect-unknown-cache",
          subject: model,
          message: `Model "${model}" menunjuk cache "${cacheName}", tetapi "${cacheName}" tidak ada di schema.`
        });
      } else {
        triggers.push(cacheName);
      }
    }
  }
  const reachable = resolveDependents(buildReverseGraphQuiet(schema), triggers);
  for (const name of names) {
    if (schema[name]?.ttl === void 0 && !reachable.has(name)) {
      issues.push({
        code: "orphan-permanent-cache",
        subject: name,
        message: `Cache "${name}" permanen (tanpa ttl) dan tidak dipicu model mana pun, sehingga hanya mati lewat invalidate() manual atau restart server.`
      });
    }
  }
  return issues;
}
function explain(schema, name) {
  if (!(name in schema)) {
    throw new Error(`[complicache] Cache "${name}" tidak ada di schema.`);
  }
  const graph = buildReverseGraphQuiet(schema);
  const lines = [name];
  const walk = (node, prefix, trail) => {
    const children = [...graph.get(node) ?? []].filter((c) => !trail.has(c));
    children.forEach((child, i) => {
      const last = i === children.length - 1;
      lines.push(`${prefix}${last ? "\u2514\u2500 " : "\u251C\u2500 "}${child}`);
      walk(child, prefix + (last ? "   " : "\u2502  "), /* @__PURE__ */ new Set([...trail, child]));
    });
  };
  walk(name, "", /* @__PURE__ */ new Set([name]));
  return lines.join("\n");
}

// src/core/module.ts
function adapterToDriver(adapter) {
  return {
    name: "adapter-shim",
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: false,
      supportsPrivate: false
    },
    wrap(fn, descriptor) {
      return adapter.cache(fn, descriptor.keyParts, {
        tags: descriptor.tags,
        ...descriptor.ttl !== void 0 ? { revalidate: descriptor.ttl } : {}
      });
    },
    revalidateTag(tag) {
      adapter.revalidateTag(tag);
    }
  };
}
function resolveLogger(opt) {
  if (!opt || opt === "silent") return null;
  if (opt === "verbose") {
    return {
      hit: (name, keyParts) => {
        console.log(`[complicache] hit: ${name} (${keyParts.join(":")})`);
      },
      miss: (name, keyParts) => {
        console.log(`[complicache] miss: ${name} (${keyParts.join(":")})`);
      },
      invalidate: (names) => {
        console.log(`[complicache] invalidate: ${names.join(", ")}`);
      },
      dryRun: (action, affected) => {
        console.log(
          `[complicache DRY RUN] ${action}: akan menginvalidasi [${affected.join(", ")}]`
        );
      },
      error: (err, ctx) => {
        console.error(`[complicache] error pada ${ctx}:`, err);
      }
    };
  }
  return opt;
}
function createCacheModule(schema, modelEffects, options) {
  let _driver = null;
  let _driverPromise = null;
  function getDriver() {
    if (_driver) return _driver;
    if (options?.driver) {
      if (typeof options.driver === "object") {
        _driver = options.driver;
        return _driver;
      }
      if (options.driver === "memory") {
        const { createMemoryDriver: createMemoryDriver2 } = (init_memory(), __toCommonJS(memory_exports));
        _driver = createMemoryDriver2();
        return _driver;
      }
      if (options.driver === "pass-through") {
        const { createPassThroughDriver: createPassThroughDriver2 } = (init_pass_through(), __toCommonJS(pass_through_exports));
        _driver = createPassThroughDriver2();
        return _driver;
      }
      if (options.driver === "next") {
        try {
          const nc = require("next/cache");
          if (typeof nc.cacheTag === "function") {
            const { createNextModernDriver: createNextModernDriver2 } = (init_next_modern(), __toCommonJS(next_modern_exports));
            _driver = createNextModernDriver2();
            return _driver;
          }
          if (typeof nc.unstable_cache === "function") {
            const { createNextClassicDriver: createNextClassicDriver2 } = (init_next_classic(), __toCommonJS(next_classic_exports));
            _driver = createNextClassicDriver2();
            return _driver;
          }
        } catch {
        }
        throw new Error(
          '[complicache] driver: "next" ditentukan, tetapi next/cache tidak ditemukan. Pastikan Next.js terinstall.'
        );
      }
    }
    if (options?.adapter) {
      _driver = adapterToDriver(options.adapter);
      return _driver;
    }
    try {
      const { createAutoDriver: createAutoDriver2 } = (init_auto(), __toCommonJS(auto_exports));
      _driver = createAutoDriver2();
      return _driver;
    } catch (err) {
      if (err?.message?.includes("FATAL:")) {
        throw err;
      }
      throw new Error(
        "[complicache] Tidak bisa memuat CacheDriver secara sinkron. Jika menggunakan ESM, panggil await ensureDriver() terlebih dahulu, atau sediakan driver eksplisit via options.driver."
      );
    }
  }
  async function ensureDriver() {
    if (_driver) return _driver;
    if (options?.driver) {
      if (typeof options.driver === "object") {
        _driver = options.driver;
        return _driver;
      }
      if (options.driver === "memory") {
        const mod = await Promise.resolve().then(() => (init_memory(), memory_exports));
        _driver = mod.createMemoryDriver();
        return _driver;
      }
      if (options.driver === "pass-through") {
        const mod = await Promise.resolve().then(() => (init_pass_through(), pass_through_exports));
        _driver = mod.createPassThroughDriver();
        return _driver;
      }
      if (options.driver === "next") {
        try {
          const mod = await Promise.resolve().then(() => (init_auto(), auto_exports));
          const detected = await mod.detectDriver();
          if (detected.name === "pass-through") {
            throw new Error("next/cache tidak ditemukan");
          }
          _driver = detected;
          return _driver;
        } catch {
          throw new Error(
            '[complicache] driver: "next" ditentukan, tetapi next/cache tidak ditemukan.'
          );
        }
      }
    }
    if (options?.adapter) {
      _driver = adapterToDriver(options.adapter);
      return _driver;
    }
    if (!_driverPromise) {
      _driverPromise = (async () => {
        try {
          const { detectDriver: detectDriver2 } = await Promise.resolve().then(() => (init_auto(), auto_exports));
          const driver = await detectDriver2();
          _driver = driver;
          return driver;
        } catch (err) {
          throw new Error(
            `[complicache] Tidak bisa memuat CacheDriver. Pastikan Next.js terinstall, atau sediakan driver custom via options.driver. Detail: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      })();
    }
    return _driverPromise;
  }
  const dryRun = options?.dryRun ?? false;
  const logger = resolveLogger(options?.logger);
  const reverseGraph = buildReverseGraph(schema);
  const counters = /* @__PURE__ */ new Map();
  function counterOf(name) {
    let c = counters.get(name);
    if (!c) {
      c = {
        calls: 0,
        misses: 0,
        errors: 0,
        lastLoaderMs: null,
        lastLoadedAt: null,
        lastInvalidatedAt: null
      };
      counters.set(name, c);
    }
    return c;
  }
  function markInvalidated(names) {
    const now = Date.now();
    for (const n of names) counterOf(n).lastInvalidatedAt = now;
  }
  function safeRevalidate(driver, tag, opts, context) {
    try {
      const r = driver.revalidateTag(tag, opts);
      if (r && typeof r.then === "function") {
        ;
        r.catch((err) => logger?.error?.(err, context));
      }
    } catch (err) {
      logger?.error?.(err, context);
    }
  }
  function cached(name, keyParts, loader) {
    return build(name, keyParts, loader);
  }
  function build(name, keyParts, loader, recordKey) {
    const entry = schema[name];
    if (!entry) {
      const available = Object.keys(schema).join(", ");
      throw new Error(
        `[complicache] Cache "${name}" tidak ada di schema.
Cache yang terdaftar: ${available}`
      );
    }
    const tag = tagOf(name);
    const descriptor = {
      name,
      tags: recordKey === void 0 ? [tag] : [tag, tagWithKey(name, recordKey)],
      keyParts: recordKey === void 0 ? [tag, ...keyParts] : [tag, ...keyParts, "key", recordKey],
      scope: "default",
      ...entry.ttl !== void 0 ? { ttl: entry.ttl } : {}
    };
    const stat = counterOf(name);
    const instrumented = async (...args) => {
      stat.misses++;
      logger?.miss?.(name, descriptor.keyParts);
      const t0 = Date.now();
      try {
        return await loader(...args);
      } catch (err) {
        stat.errors++;
        throw err;
      } finally {
        stat.lastLoadedAt = Date.now();
        stat.lastLoaderMs = stat.lastLoadedAt - t0;
      }
    };
    const driverFn = getDriver().wrap(instrumented, descriptor);
    return async (...args) => {
      stat.calls++;
      const missesBefore = stat.misses;
      const result = await driverFn(...args);
      if (stat.misses === missesBefore) logger?.hit?.(name, descriptor.keyParts);
      return result;
    };
  }
  function cachedByKey(name, keyParts, loader, keyOf) {
    if (!schema[name]) {
      build(name, keyParts, loader);
    }
    return (...args) => build(name, keyParts, loader, keyOf(...args))(...args);
  }
  function invalidateKey(name, key, options2) {
    if (!schema[name]) {
      const available = Object.keys(schema).join(", ");
      throw new Error(
        `[complicache] Cache "${String(name)}" tidak ada di schema.
Cache yang terdaftar: ${available}`
      );
    }
    const dependents = [...resolveDependents(reverseGraph, [name])].filter((n) => n !== name);
    if (dryRun) {
      logger?.dryRun?.("invalidateKey", [`${name}:${key}`, ...dependents]);
      return;
    }
    logger?.invalidate?.([`${name}:${key}`, ...dependents]);
    markInvalidated([name, ...dependents]);
    const driver = getDriver();
    safeRevalidate(driver, tagWithKey(name, key), options2, `revalidateTag(${name}:${key})`);
    for (const dep of dependents) {
      safeRevalidate(driver, tagOf(dep), options2, `revalidateTag(${dep})`);
    }
  }
  function invalidate(...args) {
    let invalidateOpts;
    let rawNames = [];
    if (args.length > 0 && typeof args[args.length - 1] === "object" && args[args.length - 1] !== null && !Array.isArray(args[args.length - 1])) {
      invalidateOpts = args[args.length - 1];
      rawNames = args.slice(0, -1).flat();
    } else {
      rawNames = args.flat();
    }
    for (const name of rawNames) {
      if (!schema[name]) {
        const available = Object.keys(schema).join(", ");
        throw new Error(
          `[complicache] Cache "${String(name)}" tidak ada di schema.
Cache yang terdaftar: ${available}`
        );
      }
    }
    const toInvalidate = resolveDependents(reverseGraph, rawNames);
    const affected = [...toInvalidate];
    if (dryRun) {
      logger?.dryRun?.("invalidate", affected);
      return;
    }
    logger?.invalidate?.(affected);
    markInvalidated(affected);
    const driver = getDriver();
    for (const name of toInvalidate) {
      safeRevalidate(driver, tagOf(name), invalidateOpts, `revalidateTag(${name})`);
    }
  }
  function invalidateModel(model, options2) {
    if (!(model in modelEffects)) {
      const available = Object.keys(modelEffects).join(", ");
      throw new Error(
        `[complicache] Model "${String(model)}" tidak terdaftar di modelEffects.
Model yang terdaftar: ${available}`
      );
    }
    const effects = modelEffects[model];
    if (!effects || effects === "none") return;
    if (options2) {
      invalidate(...effects, options2);
    } else {
      invalidate(...effects);
    }
  }
  function invalidateAll(options2) {
    const names = Object.keys(schema);
    if (dryRun) {
      logger?.dryRun?.("invalidateAll", names);
      return;
    }
    logger?.invalidate?.(names);
    markInvalidated(names);
    const driver = getDriver();
    for (const name of names) {
      safeRevalidate(driver, tagOf(name), options2, `invalidateAll(${name})`);
    }
  }
  function withDependents(names) {
    return resolveDependents(reverseGraph, names);
  }
  function revalidatePath(path, type) {
    if (dryRun) {
      logger?.dryRun?.(`revalidatePath(${path})`, []);
      return;
    }
    const driver = getDriver();
    if (driver.revalidatePath) {
      try {
        driver.revalidatePath(path, type);
      } catch (err) {
        logger?.error?.(err, `revalidatePath(${path})`);
      }
    }
  }
  function stats() {
    const out = {};
    for (const name of Object.keys(schema)) {
      const c = counterOf(name);
      out[name] = { ...c, hits: Math.max(0, c.calls - c.misses) };
    }
    return out;
  }
  function resetStats() {
    counters.clear();
  }
  function audit() {
    return auditSchema(
      schema,
      modelEffects
    );
  }
  function explain2(name) {
    return explain(schema, name);
  }
  if (options?.driver === "next") {
    getDriver();
  }
  return {
    cached,
    wrap: cached,
    // ergonomic alias
    cachedByKey,
    wrapByKey: cachedByKey,
    invalidateKey,
    invalidate,
    invalidateModel,
    invalidateAll,
    withDependents,
    revalidatePath,
    stats,
    resetStats,
    audit,
    explain: explain2,
    ensureDriver
  };
}

// src/builders.ts
function defineCacheSchema(schema) {
  return schema;
}
function defineModelEffects(effects) {
  return effects;
}
function defineModelEffectsStrict(effects) {
  return effects;
}

// src/index.ts
init_memory();
init_auto();
init_next_classic();
init_next_modern();
init_pass_through();

// src/adapters/next.ts
function createNextAdapter() {
  const nextCache = require("next/cache");
  return {
    cache(loader, keys, options) {
      return nextCache.unstable_cache(loader, [...keys], {
        tags: options.tags,
        ...options.revalidate !== void 0 ? { revalidate: options.revalidate } : {}
      });
    },
    revalidateTag(tag) {
      nextCache.revalidateTag(tag);
    }
  };
}

// src/index.ts
init_errors();

// src/core/serializer.ts
init_errors();
var isDate = (v) => (
  // instanceof saja tidak cukup: Date dari realm lain (vm context, iframe, edge runtime
  // sandbox) bukan instance dari Date global kita.
  v instanceof Date || Object.prototype.toString.call(v) === "[object Date]"
);
function encode(value, key, ancestors) {
  if (typeof value === "bigint") {
    return { __type: "BigInt", value: value.toString() };
  }
  if (typeof value !== "object" || value === null) return value;
  if (isDate(value)) {
    return { __type: "Date", value: value.toISOString() };
  }
  if (ancestors.has(value)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  const withToJSON = value;
  if (typeof withToJSON.toJSON === "function") {
    ancestors.add(value);
    try {
      return encode(withToJSON.toJSON.call(value, key), key, ancestors);
    } finally {
      ancestors.delete(value);
    }
  }
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object Number]" || tag === "[object String]" || tag === "[object Boolean]") {
    return value;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, i) => encode(item, String(i), ancestors));
    }
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = encode(value[k], k, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}
function reviver(_key, value) {
  if (typeof value === "object" && value !== null && "__type" in value && "value" in value) {
    const typed = value;
    if (typed.__type === "Date") {
      return new Date(typed.value);
    }
    if (typed.__type === "BigInt") {
      return BigInt(typed.value);
    }
  }
  return value;
}
var defaultSerializer = {
  serialize(data) {
    try {
      return JSON.stringify(encode(data, "", /* @__PURE__ */ new Set()));
    } catch (err) {
      throw new CacheSerializationError(
        `[complicache] Gagal menyerialisasi data cache: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
  deserialize(raw) {
    try {
      return JSON.parse(raw, reviver);
    } catch (err) {
      throw new CacheSerializationError(
        `[complicache] Gagal mendeserialisasi data cache: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
};

// src/prisma.ts
var DEFAULT_MUTATION_OPERATIONS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany"
];
function createPrismaInvalidator(cache, options = {}) {
  const ops = new Set(options.operations ?? DEFAULT_MUTATION_OPERATIONS);
  const onError = options.onError ?? "warn";
  const warned = /* @__PURE__ */ new Set();
  const fire = (model) => {
    try {
      if (options.invalidate) cache.invalidateModel(model, options.invalidate);
      else cache.invalidateModel(model);
    } catch (err) {
      if (onError === "throw") throw err;
      if (onError === "warn" && !warned.has(model)) {
        warned.add(model);
        console.warn(
          `[complicache] invalidasi otomatis untuk model "${model}" gagal: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  };
  return {
    name: "complicache-invalidator",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (ops.has(operation)) {
            fire(model);
            const delay = options.reinvalidateAfterMs;
            if (delay && delay > 0) {
              const t = setTimeout(() => {
                try {
                  fire(model);
                } catch {
                }
              }, delay);
              t.unref?.();
            }
          }
          return result;
        }
      }
    }
  };
}
