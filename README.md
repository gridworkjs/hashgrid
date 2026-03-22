<p align="center">
  <img src="logo.svg" width="256" height="256" alt="@gridworkjs/hashgrid">
</p>

<h1 align="center">@gridworkjs/hashgrid</h1>

<p align="center">Spatial hash grid for uniform distributions and fast neighbor lookups</p>

## Install

```
npm install @gridworkjs/hashgrid
```

## Usage

```js
import { createHashGrid } from '@gridworkjs/hashgrid'
import { point, rect, bounds } from '@gridworkjs/core'

// create a hash grid - cellSize should match your data's density
const grid = createHashGrid(item => bounds(item.position), { cellSize: 50 })

// insert items
grid.insert({ id: 1, position: point(10, 20) })
grid.insert({ id: 2, position: point(50, 60) })
grid.insert({ id: 3, position: rect(70, 70, 90, 90) })

// search for items intersecting a region
grid.search({ minX: 0, minY: 0, maxX: 55, maxY: 65 })
// => [{ id: 1, ... }, { id: 2, ... }]

// also accepts geometry objects as queries
grid.search(rect(0, 0, 55, 65))

// find nearest neighbors
grid.nearest({ x: 12, y: 22 }, 2)
// => [{ id: 1, ... }, { id: 2, ... }]

// remove by identity
grid.remove(item)

grid.size   // number of items
grid.bounds // bounding box of all items
grid.clear()
```

## When to Use a Hash Grid

Hash grids are ideal when your data is **uniformly distributed** and items are roughly the same size. They offer O(1) cell lookups, making them excellent for collision detection, particle systems, and game engines.

If your data is clustered or varies widely in size, consider `@gridworkjs/quadtree` or `@gridworkjs/rtree` instead.

## Choosing a Cell Size

The `cellSize` parameter controls the width and height of each grid cell. For best performance:

- Set `cellSize` to roughly the size of your items or the typical query range
- Too small: items span many cells, increasing memory and insert cost
- Too large: cells contain many items, reducing search selectivity

## API

### `createHashGrid(accessor, options)`

Creates a new hash grid. The `accessor` function maps each item to its bounding box (`{ minX, minY, maxX, maxY }`). Use `bounds()` from `@gridworkjs/core` to convert geometries.

The `cellSize` option is required.

Returns a spatial index implementing the gridwork protocol.

### `grid.insert(item)`

Adds an item to the grid. The item is placed into every cell its bounding box overlaps.

### `grid.remove(item)`

Removes an item by identity (`===`). Returns `true` if found and removed.

### `grid.search(query)`

Returns all items whose bounds intersect the query. Accepts bounds objects or geometry objects (point, rect, circle).

### `grid.nearest(point, k?)`

Returns the `k` nearest items to the given point, sorted by distance. Defaults to `k=1`. Accepts `{ x, y }` or a point geometry.

### `grid.clear()`

Removes all items from the grid.

### `grid.size`

Number of items in the grid.

### `grid.bounds`

Bounding box of all items, or `null` if empty.

## License

MIT
