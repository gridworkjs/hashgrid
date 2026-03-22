import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHashGrid } from '../src/index.js'
import {
  point, rect, circle, bounds,
  SPATIAL_INDEX, isSpatialIndex
} from '@gridworkjs/core'

const accessor = item => bounds(item.geo)

function pts(coords) {
  return coords.map(([x, y], i) => ({ id: i, geo: point(x, y) }))
}

describe('protocol compliance', () => {
  it('has the SPATIAL_INDEX symbol', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.equal(grid[SPATIAL_INDEX], true)
  })

  it('passes isSpatialIndex', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.equal(isSpatialIndex(grid), true)
  })

  it('has all required methods', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    for (const m of ['insert', 'remove', 'search', 'nearest', 'clear']) {
      assert.equal(typeof grid[m], 'function')
    }
  })
})

describe('construction validation', () => {
  it('throws if cellSize is missing', () => {
    assert.throws(() => createHashGrid(accessor), /cellSize is required/)
  })

  it('throws if cellSize is zero', () => {
    assert.throws(() => createHashGrid(accessor, { cellSize: 0 }), /positive finite/)
  })

  it('throws if cellSize is negative', () => {
    assert.throws(() => createHashGrid(accessor, { cellSize: -5 }), /positive finite/)
  })

  it('throws if cellSize is NaN', () => {
    assert.throws(() => createHashGrid(accessor, { cellSize: NaN }), /positive finite/)
  })

  it('throws if cellSize is Infinity', () => {
    assert.throws(() => createHashGrid(accessor, { cellSize: Infinity }), /positive finite/)
  })

  it('throws if accessor is not a function', () => {
    assert.throws(() => createHashGrid(null, { cellSize: 10 }), /accessor must be a function/)
  })
})

describe('input validation', () => {
  it('throws on NaN bounds from accessor', () => {
    const grid = createHashGrid(() => ({ minX: NaN, minY: 0, maxX: 10, maxY: 10 }), { cellSize: 10 })
    assert.throws(() => grid.insert({}), /non-finite/)
  })

  it('throws on Infinity bounds from accessor', () => {
    const grid = createHashGrid(() => ({ minX: 0, minY: 0, maxX: Infinity, maxY: 10 }), { cellSize: 10 })
    assert.throws(() => grid.insert({}), /non-finite/)
  })

  it('throws on inverted bounds from accessor', () => {
    const grid = createHashGrid(() => ({ minX: 10, minY: 0, maxX: 5, maxY: 10 }), { cellSize: 10 })
    assert.throws(() => grid.insert({}), /inverted/)
  })
})

describe('insert and size', () => {
  it('starts empty', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.equal(grid.size, 0)
  })

  it('tracks size after inserts', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 20], [30, 40], [50, 60]])
    for (const item of items) grid.insert(item)
    assert.equal(grid.size, 3)
  })

  it('handles duplicate inserts as separate entries', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const item = { id: 0, geo: point(5, 5) }
    grid.insert(item)
    grid.insert(item)
    assert.equal(grid.size, 2)
  })
})

describe('search', () => {
  it('returns empty for empty grid', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.deepEqual(grid.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), [])
  })

  it('finds items within bounds', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [50, 50], [90, 90]])
    for (const item of items) grid.insert(item)

    const found = grid.search({ minX: 0, minY: 0, maxX: 60, maxY: 60 })
    const ids = found.map(i => i.id).sort()
    assert.deepEqual(ids, [0, 1])
  })

  it('finds items on the boundary edge', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const item = { id: 0, geo: point(50, 50) }
    grid.insert(item)

    const found = grid.search({ minX: 50, minY: 50, maxX: 100, maxY: 100 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('excludes items outside bounds', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [200, 200]])
    for (const item of items) grid.insert(item)

    const found = grid.search({ minX: 0, minY: 0, maxX: 50, maxY: 50 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('accepts geometry objects as query', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [50, 50]])
    for (const item of items) grid.insert(item)

    const found = grid.search(rect(0, 0, 30, 30))
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('accepts circle as query', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [200, 200]])
    for (const item of items) grid.insert(item)

    const found = grid.search(circle(10, 10, 5))
    assert.equal(found.length, 1)
  })

  it('searches with point query', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const item = { id: 0, geo: point(10, 10) }
    grid.insert(item)

    const found = grid.search(point(10, 10))
    assert.equal(found.length, 1)
  })

  it('does not return duplicates for items spanning multiple cells', () => {
    const regionAccessor = item => bounds(item.geo)
    const grid = createHashGrid(regionAccessor, { cellSize: 10 })
    const wide = { id: 0, geo: rect(0, 0, 25, 25) }
    grid.insert(wide)

    const found = grid.search({ minX: 0, minY: 0, maxX: 30, maxY: 30 })
    assert.equal(found.length, 1)
  })
})

describe('region items', () => {
  const regionAccessor = item => bounds(item.geo)

  it('indexes rectangles', () => {
    const grid = createHashGrid(regionAccessor, { cellSize: 20 })
    const r1 = { id: 0, geo: rect(0, 0, 20, 20) }
    const r2 = { id: 1, geo: rect(80, 80, 100, 100) }
    grid.insert(r1)
    grid.insert(r2)

    const found = grid.search({ minX: 10, minY: 10, maxX: 30, maxY: 30 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('finds overlapping regions', () => {
    const grid = createHashGrid(regionAccessor, { cellSize: 20 })
    const r1 = { id: 0, geo: rect(0, 0, 60, 60) }
    const r2 = { id: 1, geo: rect(40, 40, 100, 100) }
    grid.insert(r1)
    grid.insert(r2)

    const found = grid.search({ minX: 45, minY: 45, maxX: 55, maxY: 55 })
    const ids = found.map(i => i.id).sort()
    assert.deepEqual(ids, [0, 1])
  })

  it('handles items spanning many cells', () => {
    const grid = createHashGrid(regionAccessor, { cellSize: 10 })
    const wide = { id: 0, geo: rect(0, 0, 100, 100) }
    grid.insert(wide)

    const found = grid.search({ minX: 50, minY: 50, maxX: 55, maxY: 55 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })
})

describe('remove', () => {
  it('returns false for empty grid', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.equal(grid.remove({ id: 0, geo: point(0, 0) }), false)
  })

  it('removes an item by identity', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const item = { id: 0, geo: point(10, 10) }
    grid.insert(item)
    assert.equal(grid.size, 1)

    assert.equal(grid.remove(item), true)
    assert.equal(grid.size, 0)
    assert.deepEqual(grid.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), [])
  })

  it('does not remove a different object with same coords', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const item = { id: 0, geo: point(10, 10) }
    const clone = { id: 0, geo: point(10, 10) }
    grid.insert(item)

    assert.equal(grid.remove(clone), false)
    assert.equal(grid.size, 1)
  })

  it('removes a region item spanning multiple cells', () => {
    const regionAccessor = item => bounds(item.geo)
    const grid = createHashGrid(regionAccessor, { cellSize: 10 })
    const wide = { id: 0, geo: rect(0, 0, 25, 25) }
    grid.insert(wide)
    assert.equal(grid.size, 1)

    assert.equal(grid.remove(wide), true)
    assert.equal(grid.size, 0)
    assert.deepEqual(grid.search({ minX: 0, minY: 0, maxX: 30, maxY: 30 }), [])
  })

  it('updates bounds after remove', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const a = { id: 0, geo: point(10, 10) }
    const b = { id: 1, geo: point(100, 100) }
    grid.insert(a)
    grid.insert(b)

    grid.remove(b)
    assert.equal(grid.bounds.maxX, 10)
    assert.equal(grid.bounds.maxY, 10)
  })
})

describe('nearest', () => {
  it('returns empty for empty grid', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.deepEqual(grid.nearest({ x: 0, y: 0 }), [])
  })

  it('finds the single nearest item', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [50, 50], [90, 90]])
    for (const item of items) grid.insert(item)

    const result = grid.nearest({ x: 12, y: 12 })
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 0)
  })

  it('finds k nearest items', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[0, 0], [10, 10], [20, 20], [100, 100]])
    for (const item of items) grid.insert(item)

    const result = grid.nearest({ x: 5, y: 5 }, 2)
    assert.equal(result.length, 2)
    const ids = result.map(i => i.id).sort()
    assert.deepEqual(ids, [0, 1])
  })

  it('returns all items when k exceeds size', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [20, 20]])
    for (const item of items) grid.insert(item)

    const result = grid.nearest({ x: 0, y: 0 }, 10)
    assert.equal(result.length, 2)
  })

  it('handles k=0', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    grid.insert({ id: 0, geo: point(10, 10) })
    assert.deepEqual(grid.nearest({ x: 0, y: 0 }, 0), [])
  })

  it('accepts point geometry', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [50, 50]])
    for (const item of items) grid.insert(item)

    const result = grid.nearest(point(11, 11))
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 0)
  })

  it('returns items in distance order', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[100, 100], [10, 10], [50, 50]])
    for (const item of items) grid.insert(item)

    const result = grid.nearest({ x: 0, y: 0 }, 3)
    assert.equal(result[0].id, 1)
    assert.equal(result[1].id, 2)
    assert.equal(result[2].id, 0)
  })
})

describe('clear', () => {
  it('resets the grid', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[10, 10], [50, 50]])
    for (const item of items) grid.insert(item)

    grid.clear()
    assert.equal(grid.size, 0)
    assert.deepEqual(grid.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), [])
  })

  it('allows inserts after clear', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    grid.insert({ id: 0, geo: point(10, 10) })
    grid.clear()

    grid.insert({ id: 1, geo: point(20, 20) })
    assert.equal(grid.size, 1)
    const found = grid.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(found[0].id, 1)
  })
})

describe('bounds property', () => {
  it('is null for empty grid', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    assert.equal(grid.bounds, null)
  })

  it('tracks inserted items', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    grid.insert({ id: 0, geo: point(10, 20) })
    grid.insert({ id: 1, geo: point(50, 60) })

    assert.equal(grid.bounds.minX, 10)
    assert.equal(grid.bounds.minY, 20)
    assert.equal(grid.bounds.maxX, 50)
    assert.equal(grid.bounds.maxY, 60)
  })

  it('is null after clear', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    grid.insert({ id: 0, geo: point(10, 10) })
    grid.clear()
    assert.equal(grid.bounds, null)
  })
})

describe('negative coordinates', () => {
  it('handles negative coordinates correctly', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[-50, -50], [50, 50]])
    for (const item of items) grid.insert(item)

    const found = grid.search({ minX: -60, minY: -60, maxX: -40, maxY: -40 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('nearest works across negative coordinates', () => {
    const grid = createHashGrid(accessor, { cellSize: 10 })
    const items = pts([[-10, -10], [100, 100]])
    for (const item of items) grid.insert(item)

    const result = grid.nearest({ x: -5, y: -5 })
    assert.equal(result[0].id, 0)
  })
})

describe('cell size behavior', () => {
  it('works with very small cell size', () => {
    const grid = createHashGrid(accessor, { cellSize: 0.1 })
    const items = pts([[0.5, 0.5], [1.5, 1.5]])
    for (const item of items) grid.insert(item)

    const found = grid.search({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('works with very large cell size', () => {
    const grid = createHashGrid(accessor, { cellSize: 10000 })
    const items = pts([[10, 10], [50, 50], [90, 90]])
    for (const item of items) grid.insert(item)

    const found = grid.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(found.length, 3)
  })
})

describe('stress', () => {
  it('handles many random points', () => {
    const grid = createHashGrid(accessor, { cellSize: 50 })

    const items = []
    for (let i = 0; i < 1000; i++) {
      const item = { id: i, geo: point(Math.random() * 1000, Math.random() * 1000) }
      items.push(item)
      grid.insert(item)
    }

    assert.equal(grid.size, 1000)

    const found = grid.search({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 })
    assert.equal(found.length, 1000)

    const half = grid.search({ minX: 0, minY: 0, maxX: 500, maxY: 500 })
    assert.ok(half.length > 0)
    assert.ok(half.length < 1000)

    for (const item of half) {
      const b = bounds(item.geo)
      assert.ok(b.minX <= 500 && b.minY <= 500)
    }
  })

  it('nearest returns correct order with many points', () => {
    const grid = createHashGrid(accessor, { cellSize: 50 })

    for (let i = 0; i < 500; i++) {
      grid.insert({ id: i, geo: point(Math.random() * 1000, Math.random() * 1000) })
    }

    const result = grid.nearest({ x: 500, y: 500 }, 10)
    assert.equal(result.length, 10)

    for (let i = 1; i < result.length; i++) {
      const prevB = bounds(result[i - 1].geo)
      const currB = bounds(result[i].geo)
      const prevDist = Math.hypot(prevB.minX - 500, prevB.minY - 500)
      const currDist = Math.hypot(currB.minX - 500, currB.minY - 500)
      assert.ok(prevDist <= currDist + 1e-10)
    }
  })

  it('handles interleaved insert and remove', () => {
    const grid = createHashGrid(accessor, { cellSize: 25 })

    const items = []
    for (let i = 0; i < 200; i++) {
      const item = { id: i, geo: point(Math.random() * 500, Math.random() * 500) }
      items.push(item)
      grid.insert(item)
    }

    for (let i = 0; i < 100; i++) {
      grid.remove(items[i])
    }

    assert.equal(grid.size, 100)

    const found = grid.search({ minX: 0, minY: 0, maxX: 500, maxY: 500 })
    assert.equal(found.length, 100)
  })
})
