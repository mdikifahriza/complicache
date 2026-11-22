/**
 * complicache
 *
 * Schema-driven Next.js Data Cache — definisikan entri cache, dependency graph,
 * dan model effects sekali, pakai konsisten di semua proyek tanpa ribet cari sambungan.
 *
 * Pola pemakaian:
 *   1. Definisikan schema + model effects di proyek (lib/cache/schema.ts)
 *   2. Buat module dari schema (lib/cache/index.ts)
 *   3. Pakai { wrap, cached, invalidate, invalidateModel } di service/action
 *
 * @see README.md
 */

// ── Core factory ────────────────────────────────────────────────────────────
export { createCacheModule } from './core/module'

// ── Schema builders ─────────────────────────────────────────────────────────
export { defineCacheSchema, defineModelEffects, defineModelEffectsStrict } from './builders'

// ── Drivers (Modular & Version-Resilient) ────────────────────────────────────
export { createMemoryDriver } from './drivers/memory'
export { createAutoDriver, resetAutoDriver, detectDriver } from './drivers/auto'
export { createNextClassicDriver } from './drivers/next-classic'
export { createNextModernDriver, ttlToProfile } from './drivers/next-modern'
export { createPassThroughDriver } from './drivers/pass-through'

// ── Legacy adapter (backward compat) ────────────────────────────────────────
export { createNextAdapter } from './adapters/next'

// ── Error Classes ───────────────────────────────────────────────────────────
export {
  CacheSchemaError,
  CacheDriverError,
  CacheSerializationError,
} from './core/errors'

// ── Tag Helpers ─────────────────────────────────────────────────────────────
export { tagOf, tagWithKey, sanitizeTag } from './core/tag'

// ── Serializer ──────────────────────────────────────────────────────────────
export { defaultSerializer, type Serializer } from './core/serializer'

// ── Graph Engine ────────────────────────────────────────────────────────────
export { detectCycles, buildReverseGraph, resolveDependents } from './core/graph'

// ── Prisma (structural typing, tanpa dependensi @prisma/client) ─────────────
export {
  createPrismaInvalidator,
  DEFAULT_MUTATION_OPERATIONS,
  type PrismaInvalidatorOptions,
  type PrismaInvalidatorExtension,
  type InvalidatorTarget,
} from './prisma'

// ── Audit ───────────────────────────────────────────────────────────────────
export { auditSchema, explain, type AuditIssue, type AuditIssueCode } from './core/audit'

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  CacheEntry,
  CacheAdapter,
  CacheModule,
  CacheModuleOptions,
  CacheLogger,
  CacheStats,
  InvalidateOptions,
  CacheDriver,
  CacheDescriptor,
} from './types'
