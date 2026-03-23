import {
  SPATIAL_INDEX, bounds as toBounds,
  intersects, distanceToPoint
} from '@gridworkjs/core'

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds */
/** @typedef {{ x: number, y: number }} Point */
/**
 * @template T
 * @typedef {(item: T) => Bounds} Accessor
 */

/**
 * @typedef {object} HashGridOptions
 * @property {number} cellSize - Width and height of each grid cell
 */

function validateAccessorBounds(b) {
  if (b === null || typeof b !== 'object') {
    throw new Error('accessor must return a bounds object')
  }
  if (!Number.isFinite(b.minX) || !Number.isFinite(b.minY) ||
      !Number.isFinite(b.maxX) || !Number.isFinite(b.maxY)) {
    throw new Error('accessor returned non-finite bounds')
  }
  if (b.minX > b.maxX || b.minY > b.maxY) {
    throw new Error('accessor returned inverted bounds (minX > maxX or minY > maxY)')
  }
}

function normalizeBounds(input) {
  if (input != null && typeof input === 'object' &&
      'minX' in input && 'minY' in input && 'maxX' in input && 'maxY' in input) {
    return input
  }
  return toBounds(input)
}

function cellKey(cx, cy) {
  return cx + ',' + cy
}

function heapPush(heap, entry) {
  heap.push(entry)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heap[p].dist <= heap[i].dist) break
    ;[heap[p], heap[i]] = [heap[i], heap[p]]
    i = p
  }
}

function heapPop(heap) {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    for (;;) {
      let s = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < heap.length && heap[l].dist < heap[s].dist) s = l
      if (r < heap.length && heap[r].dist < heap[s].dist) s = r
      if (s === i) break
      ;[heap[i], heap[s]] = [heap[s], heap[i]]
      i = s
    }
  }
  return top
}

/**
 * Creates a spatial hash grid index.
 *
 * @param {(item: any) => Bounds | object} accessor - Maps items to their bounding boxes or geometries
 * @param {HashGridOptions} options
 * @returns {import('@gridworkjs/core').SpatialIndex}
 */
export function createHashGrid(accessor, options = {}) {
  const cellSize = options.cellSize

  if (cellSize == null) {
    throw new Error('cellSize is required')
  }
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error('cellSize must be a positive finite number')
  }
  if (typeof accessor !== 'function') {
    throw new Error('accessor must be a function')
  }

  const invCellSize = 1 / cellSize
  const cells = new Map()
  let size = 0
  let totalBounds = null

  function toCell(v) {
    return Math.floor(v * invCellSize)
  }

  function cellRange(b) {
    return {
      minCX: Math.floor(b.minX * invCellSize),
      minCY: Math.floor(b.minY * invCellSize),
      maxCX: Math.floor(b.maxX * invCellSize),
      maxCY: Math.floor(b.maxY * invCellSize)
    }
  }

  function addToCell(cx, cy, entry) {
    const key = cellKey(cx, cy)
    let bucket = cells.get(key)
    if (!bucket) {
      bucket = []
      cells.set(key, bucket)
    }
    bucket.push(entry)
  }

  function removeFromCell(cx, cy, entry) {
    const key = cellKey(cx, cy)
    const bucket = cells.get(key)
    if (!bucket) return
    const idx = bucket.indexOf(entry)
    if (idx !== -1) {
      bucket.splice(idx, 1)
      if (bucket.length === 0) cells.delete(key)
    }
  }

  function recalcBounds() {
    if (size === 0) {
      totalBounds = null
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const seen = new Set()
    for (const bucket of cells.values()) {
      for (const entry of bucket) {
        if (seen.has(entry)) continue
        seen.add(entry)
        const b = entry.bounds
        if (b.minX < minX) minX = b.minX
        if (b.minY < minY) minY = b.minY
        if (b.maxX > maxX) maxX = b.maxX
        if (b.maxY > maxY) maxY = b.maxY
      }
    }
    totalBounds = { minX, minY, maxX, maxY }
  }

  const index = {
    [SPATIAL_INDEX]: true,

    accessor,

    get size() { return size },

    get bounds() { return totalBounds },

    insert(item) {
      const raw = accessor(item)
      const itemBounds = normalizeBounds(raw)
      validateAccessorBounds(itemBounds)

      const entry = { item, bounds: itemBounds }
      const { minCX, minCY, maxCX, maxCY } = cellRange(itemBounds)

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
          addToCell(cx, cy, entry)
        }
      }

      if (totalBounds === null) {
        totalBounds = { ...itemBounds }
      } else {
        if (itemBounds.minX < totalBounds.minX) totalBounds.minX = itemBounds.minX
        if (itemBounds.minY < totalBounds.minY) totalBounds.minY = itemBounds.minY
        if (itemBounds.maxX > totalBounds.maxX) totalBounds.maxX = itemBounds.maxX
        if (itemBounds.maxY > totalBounds.maxY) totalBounds.maxY = itemBounds.maxY
      }

      size++
    },

    remove(item) {
      const raw = accessor(item)
      const itemBounds = normalizeBounds(raw)
      validateAccessorBounds(itemBounds)
      const { minCX, minCY, maxCX, maxCY } = cellRange(itemBounds)

      let entry = null
      const firstKey = cellKey(minCX, minCY)
      const bucket = cells.get(firstKey)
      if (bucket) {
        entry = bucket.find(e => e.item === item) ?? null
      }

      if (!entry) {
        for (let cx = minCX; cx <= maxCX && !entry; cx++) {
          for (let cy = minCY; cy <= maxCY && !entry; cy++) {
            if (cx === minCX && cy === minCY) continue
            const b = cells.get(cellKey(cx, cy))
            if (b) entry = b.find(e => e.item === item) ?? null
          }
        }
      }

      if (!entry) return false

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
          removeFromCell(cx, cy, entry)
        }
      }

      size--
      recalcBounds()
      return true
    },

    search(query) {
      if (size === 0) return []
      const queryBounds = normalizeBounds(query)
      if (!Number.isFinite(queryBounds.minX) || !Number.isFinite(queryBounds.minY) ||
          !Number.isFinite(queryBounds.maxX) || !Number.isFinite(queryBounds.maxY)) {
        throw new Error('search requires bounds with finite values')
      }
      const { minCX, minCY, maxCX, maxCY } = cellRange(queryBounds)

      const results = []
      const seen = new Set()

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
          const bucket = cells.get(cellKey(cx, cy))
          if (!bucket) continue
          for (const entry of bucket) {
            if (seen.has(entry)) continue
            seen.add(entry)
            if (intersects(entry.bounds, queryBounds)) {
              results.push(entry.item)
            }
          }
        }
      }

      return results
    },

    nearest(queryPoint, k = 1) {
      if (size === 0 || k <= 0) return []

      const px = queryPoint.x
      const py = queryPoint.y
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        throw new Error('nearest requires a point with finite x and y')
      }

      const results = []
      const seen = new Set()
      let ring = 0
      const centerCX = toCell(px)
      const centerCY = toCell(py)

      const heap = []

      // expand in rings until we have k candidates and the ring is far enough
      while (true) {
        const minCX = centerCX - ring
        const maxCX = centerCX + ring
        const minCY = centerCY - ring
        const maxCY = centerCY + ring

        for (let cx = minCX; cx <= maxCX; cx++) {
          for (let cy = minCY; cy <= maxCY; cy++) {
            if (ring > 0 && cx > minCX && cx < maxCX && cy > minCY && cy < maxCY) continue
            const bucket = cells.get(cellKey(cx, cy))
            if (!bucket) continue
            for (const entry of bucket) {
              if (seen.has(entry)) continue
              seen.add(entry)
              heapPush(heap, { dist: distanceToPoint(entry.bounds, px, py), item: entry.item })
            }
          }
        }

        // the minimum possible distance to any item in the next ring
        const nextRingDist = ring * cellSize
        const haveCandidates = heap.length >= k

        if (haveCandidates) {
          let kthDist = peekKth(heap, k)
          if (kthDist <= nextRingDist) break
        }

        // if we've checked all cells, stop
        if (seen.size >= size) break
        ring++
      }

      while (heap.length > 0 && results.length < k) {
        results.push(heapPop(heap).item)
      }

      return results
    },

    clear() {
      cells.clear()
      size = 0
      totalBounds = null
    }
  }

  return index
}

function peekKth(heap, k) {
  // extract k items, record the kth distance, then put them back
  if (heap.length < k) return Infinity
  const extracted = []
  for (let i = 0; i < k; i++) {
    extracted.push(heapPop(heap))
  }
  const kthDist = extracted[extracted.length - 1].dist
  for (const e of extracted) {
    heapPush(heap, e)
  }
  return kthDist
}
