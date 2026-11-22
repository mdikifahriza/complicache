import type { CacheEntry } from '../types'
import { buildReverseGraphQuiet, resolveDependents } from './graph'

export type AuditIssueCode =
  | 'orphan-permanent-cache'
  | 'effect-unknown-cache'
  | 'depends-on-unknown-cache'

export interface AuditIssue {
  code: AuditIssueCode
  /** Nama cache atau model yang bermasalah. */
  subject: string
  message: string
}

/**
 * Audit statis schema + model effects. Murni (tanpa efek samping, tanpa Next) —
 * cocok dipanggil di test/CI: `assert.deepEqual(auditSchema(S, E), [])`.
 *
 * Memeriksa:
 *  - cache permanen (tanpa `ttl`) yang tidak bisa dimatikan oleh model mana pun,
 *    baik langsung maupun lewat `dependsOn` (hanya mati via invalidate() manual);
 *  - effect yang menunjuk nama cache yang tidak ada di schema;
 *  - `dependsOn` ke cache yang tidak ada di schema.
 */
export function auditSchema(
  schema: Record<string, CacheEntry>,
  modelEffects: Partial<Record<string, readonly string[] | 'none'>> = {}
): AuditIssue[] {
  const issues: AuditIssue[] = []
  const names = Object.keys(schema)

  for (const name of names) {
    for (const dep of schema[name]?.dependsOn ?? []) {
      if (!(dep in schema)) {
        issues.push({
          code: 'depends-on-unknown-cache',
          subject: name,
          message: `Cache "${name}" dependsOn "${dep}", tetapi "${dep}" tidak ada di schema.`,
        })
      }
    }
  }

  const triggers: string[] = []
  for (const [model, effects] of Object.entries(modelEffects)) {
    if (!effects || effects === 'none') continue
    for (const cacheName of effects as readonly string[]) {
      if (!(cacheName in schema)) {
        issues.push({
          code: 'effect-unknown-cache',
          subject: model,
          message: `Model "${model}" menunjuk cache "${cacheName}", tetapi "${cacheName}" tidak ada di schema.`,
        })
      } else {
        triggers.push(cacheName)
      }
    }
  }

  // Cache yang ikut mati lewat dependsOn dari sebuah trigger juga dianggap terjangkau.
  const reachable = resolveDependents(buildReverseGraphQuiet(schema), triggers)
  for (const name of names) {
    if (schema[name]?.ttl === undefined && !reachable.has(name)) {
      issues.push({
        code: 'orphan-permanent-cache',
        subject: name,
        message:
          `Cache "${name}" permanen (tanpa ttl) dan tidak dipicu model mana pun, ` +
          `sehingga hanya mati lewat invalidate() manual atau restart server.`,
      })
    }
  }

  return issues
}

/**
 * Cetak pohon cascade: apa saja yang ikut mati jika `name` diinvalidasi.
 *
 * @example
 * explain(SCHEMA, 'news')
 * // news
 * // └─ sitemap
 * //    └─ homepage
 */
export function explain(schema: Record<string, CacheEntry>, name: string): string {
  if (!(name in schema)) {
    throw new Error(`[complicache] Cache "${name}" tidak ada di schema.`)
  }
  const graph = buildReverseGraphQuiet(schema)
  const lines: string[] = [name]

  const walk = (node: string, prefix: string, trail: Set<string>): void => {
    const children = [...(graph.get(node) ?? [])].filter((c) => !trail.has(c))
    children.forEach((child, i) => {
      const last = i === children.length - 1
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${child}`)
      walk(child, prefix + (last ? '   ' : '│  '), new Set([...trail, child]))
    })
  }
  walk(name, '', new Set([name]))
  return lines.join('\n')
}
