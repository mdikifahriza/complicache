import type { CacheEntry } from '../types'
import { CacheSchemaError } from './errors'

/**
 * Deteksi siklus pada schema dependency graph menggunakan DFS.
 *
 * "A dependsOn B" artinya A bergantung pada B (ada edge A → B).
 * Jika ada path B → ... → A, maka terjadi circular dependency.
 *
 * @returns String deskripsi siklus (misal "a → b → a") atau null jika aman.
 */
export function detectCycles(schema: Record<string, CacheEntry>): string | null {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const path: string[] = []

  function dfs(node: string): string | null {
    visited.add(node)
    inStack.add(node)
    path.push(node)

    for (const dep of schema[node]?.dependsOn ?? []) {
      if (!schema[dep]) continue // dependensi ke target tak dikenal ditangani terpisah
      if (!visited.has(dep)) {
        const cycle = dfs(dep)
        if (cycle) return cycle
      } else if (inStack.has(dep)) {
        const cycleStart = path.indexOf(dep)
        const cycle = [...path.slice(cycleStart), dep]
        return cycle.join(' → ')
      }
    }

    path.pop()
    inStack.delete(node)
    return null
  }

  for (const name of Object.keys(schema)) {
    if (!visited.has(name)) {
      const cycle = dfs(name)
      if (cycle) return cycle
    }
  }

  return null
}

/**
 * Bangun reverse-dependency map dari schema.
 *
 * "dependsOn" di schema artinya: "kalau X diinvalidasi, saya (Y) ikut mati".
 * Map yang dibangun di sini adalah kebalikannya: "kalau X diinvalidasi, siapa saja yang ikut?"
 *
 * Throws CacheSchemaError jika ditemukan circular dependency.
 */
export function buildReverseGraph(
  schema: Record<string, CacheEntry>
): Map<string, Set<string>> {
  const cycle = detectCycles(schema)
  if (cycle) {
    throw new CacheSchemaError(
      `[complicache] Circular dependency terdeteksi pada schema: ${cycle}`
    )
  }

  const graph = new Map<string, Set<string>>()

  // Pastikan semua nama ada di map (termasuk yang tidak punya dependan)
  for (const name of Object.keys(schema)) {
    graph.set(name, new Set())
  }

  // Isi reverse edges: "X dependsOn Y" → Y menambahkan X ke dependannya
  for (const [name, entry] of Object.entries(schema)) {
    for (const dep of entry.dependsOn ?? []) {
      if (!graph.has(dep)) {
        console.warn(
          `[complicache] "${name}" dependsOn "${dep}", tapi "${dep}" tidak ada di schema. Dependensi ini diabaikan.`
        )
        continue
      }
      graph.get(dep)!.add(name)
    }
  }

  return graph
}

/**
 * Sama seperti `buildReverseGraph`, tetapi tanpa `console.warn` untuk dependensi
 * tak dikenal (dipakai audit, yang melaporkannya sebagai temuan terstruktur).
 * Tetap melempar CacheSchemaError jika ada siklus.
 */
export function buildReverseGraphQuiet(
  schema: Record<string, CacheEntry>
): Map<string, Set<string>> {
  const cycle = detectCycles(schema)
  if (cycle) {
    throw new CacheSchemaError(
      `[complicache] Circular dependency terdeteksi pada schema: ${cycle}`
    )
  }
  const graph = new Map<string, Set<string>>()
  for (const name of Object.keys(schema)) graph.set(name, new Set())
  for (const [name, entry] of Object.entries(schema)) {
    for (const dep of entry.dependsOn ?? []) {
      graph.get(dep)?.add(name)
    }
  }
  return graph
}

/**
 * Dari satu set nama cache yang akan diinvalidasi, hitung semua cache
 * yang ikut mati — termasuk dependan rekursif (BFS).
 *
 * @example
 * // schema: sitemap dependsOn ['news'], homepage dependsOn ['sitemap']
 * resolveDependents(graph, ['news'])
 * // → Set { 'news', 'sitemap', 'homepage' }
 */
export function resolveDependents(
  graph: Map<string, Set<string>>,
  names: readonly string[]
): Set<string> {
  const result = new Set<string>()
  const queue = [...names]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (result.has(current)) continue
    result.add(current)

    for (const dependent of graph.get(current) ?? []) {
      if (!result.has(dependent)) {
        queue.push(dependent)
      }
    }
  }

  return result
}
