## geoflatbush [![Simply Awesome](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects)

A geographic extension for [flatbush](https://github.com/mourner/flatbush), a very fast static 2D spatial index.
Performs nearest neighbors queries for geographic bounding boxes, taking Earth curvature and date line wrapping into account. Similar to [geokdbush](https://github.com/mourner/geokdbush), but for boxes instead of points.

```js
import {around} from 'geoflatbush';

around(index, 30.5, 50.5, 10); // return 10 nearest boxes to Kyiv
```

### API

#### `around(index, lng, lat[, maxResults, maxDistance, filterFn])`

Returns an array of item indices from the given Flatbush index in order of geographical distance from the given `lng, lat` point
(known as K nearest neighbors, or KNN).

```js
const ids = around(index, 30.5, 50.5, 5); // returns 5 ids around Kyiv
```

`maxResults` and `maxDistance` are `Infinity` by default. `maxDistance` is assumed in kilometers.

If given a `filterFn`, calls it on items that potentially belong to the results (passing the item's index)
and only includes an item if the function returned a truthy value.

#### `distance(lng, lat, lng2, lat2)`

Returns the geographical distance between two given points in kilometers using the Haversine distance formula.