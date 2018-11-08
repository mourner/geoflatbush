## geoflatbush

A geographic extension for [flatbush](https://github.com/mourner/flatbush), a very fast static 2D spatial index.
Performs nearest neighbors queries for geographic bounding boxes, taking Earth curvature and date line wrapping into account. Similar to [geokdbush](https://github.com/mourner/geokdbush), but for boxes instead of points.

```js
import {around} from 'geoflatbush';

around(index, 30.5, 50.5, 10); // return 10 nearest boxes to Kyiv
```
