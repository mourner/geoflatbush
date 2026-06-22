
/** @import Flatbush from 'flatbush' */

const earthRadius = 6371;
const rad = Math.PI / 180;

// Module-level scratch stack reused across `within` calls to avoid per-call allocation.
// This makes `within` non-re-entrant — see the note on its declaration.
/** @type {number[]} */
const withinStack = [];

/**
 * Search items in a given Flatbush index in order of geographical distance from the given point.
 * Assumes the index contains bbox values of the form [minLng, minLat, maxLng, maxLat].
 *
 * @param {Flatbush} index Flatbush index.
 * @param {number} lng Longitude.
 * @param {number} lat Latitude.
 * @param {number} [maxResults=Infinity] Number of items to return (if not provided, search will return all the items in the index, sorted).
 * @param {number} [maxDistance=Infinity] Maximum distance to search for in kilometers.
 * @param {(index: number) => boolean} [filterFn] An optional function for filtering the results.
 * @returns {number[]} An array of indices of items found.
 */
export function around(index, lng, lat, maxResults = Infinity, maxDistance = Infinity, filterFn) {
    const result = [];

    const cosLat = Math.cos(lat * rad);
    const sinLat = Math.sin(lat * rad);

    // We order the priority queue by negative cosine of angular distance (smaller = closer),
    // avoiding a Math.acos per box. Convert maxDistance to its equivalent threshold once.
    const negCosMaxDist = maxDistance === Infinity ? Infinity : -Math.cos(maxDistance / earthRadius);

    const {_boxes: boxes, _indices: indices, _queue: q, _levelBounds: levelBounds} = index;
    const nodeSize4 = index.nodeSize * 4;
    const numItems4 = index.numItems * 4;

    // Tree nodes and leaves share the queue; encode leaves with LSB = 1 so we can tell them
    // apart with `& 1`. Seed with the root node — any priority works since the queue is empty.
    q.push((boxes.length - 4) << 1, 0);

    while (q.length) {
        const top = q.ids[0];
        // if the closest queued entry is a leaf, it's the next result in distance order
        if (top & 1) {
            if (q.values[0] > negCosMaxDist) break;
            q.pop();
            result.push(top >> 1);
            if (result.length === maxResults) break;
            continue;
        }

        q.pop();
        const nodeIndex = top >> 1;
        const isLeafLevel = nodeIndex < numItems4;
        const end = Math.min(nodeIndex + nodeSize4, upperBound(nodeIndex, levelBounds));

        for (let pos = nodeIndex; pos < end; pos += 4) {
            const childIndex = indices[pos >> 2] | 0;
            const negCosDist = boxNegCosDist(lng, lat, boxes[pos], boxes[pos + 1], boxes[pos + 2], boxes[pos + 3], cosLat, sinLat);

            if (isLeafLevel) {
                if (!filterFn || filterFn(childIndex)) q.push((childIndex << 1) | 1, negCosDist);
            } else {
                q.push(childIndex << 1, negCosDist);
            }
        }
    }

    q.clear();
    return result;
}

/**
 * Search items in a given Flatbush index within a geographical radius from the given point.
 * Unlike `around`, results are returned in arbitrary order, which makes this significantly faster
 * for radius queries because it avoids maintaining a priority queue and sorting.
 * Assumes the index contains bbox values of the form [minLng, minLat, maxLng, maxLat].
 *
 * @param {Flatbush} index Flatbush index.
 * @param {number} lng Longitude.
 * @param {number} lat Latitude.
 * @param {number} radius Search radius in kilometers.
 * @param {(index: number) => boolean} [filterFn] An optional function for filtering the results.
 * @returns {number[]} An array of indices of items found.
 *
 * Note: `within` is not re-entrant — don't call `within` from inside its own `filterFn`.
 */
export function within(index, lng, lat, radius, filterFn) {
    const result = [];

    const cosLat = Math.cos(lat * rad);
    const sinLat = Math.sin(lat * rad);

    // Compare in negative-cosine space (smaller = closer) to avoid a Math.acos per box.
    const negCosRadius = -Math.cos(radius / earthRadius);

    // Angular radius in degrees. The latitude gap to a box is a trig-free lower bound on the
    // distance to it (great-circle distance is always >= the latitude difference), so anything
    // more than this many degrees away in latitude can be pruned without the full distance test.
    const angularRadius = radius / earthRadius / rad;

    // Conservative planar bracket setup (degrees). Over the query's latitude band
    // B = [|lat| - ρ, |lat| + ρ] the only varying metric term, cos²φ, is bounded by cmin2/cmax2,
    // which rigorously bracket the great-circle distance with trig-free arithmetic:
    //   latGap² + cmin2·lngGap²  ≤  σ²  ≤  latGap² + cmax2·lngGap²   (all in degrees²)
    // so most boxes are pruned/accepted without any trig; only the boundary band needs the exact
    // spherical test. No special-casing for large radii: the lower bound's only premise (the
    // disk's geodesic convexity) can fail only when ρ ≥ π/2, but that forces bandHi ≥ 90 and hence
    // cmin2 = 0, collapsing it to the always-valid latitude prune. cmin2 > 0 implies ρ < π/2.
    const rho2 = angularRadius * angularRadius;
    const latAbs = lat < 0 ? -lat : lat;
    const bandHi = latAbs + angularRadius;
    const bandLo = latAbs - angularRadius;
    const cosMax = Math.cos(Math.max(0, bandLo) * rad);        // largest cosφ in B (1 if B straddles equator)
    const cosMin = bandHi >= 90 ? 0 : Math.cos(bandHi * rad);  // smallest cosφ in B (0 if B reaches a pole)
    const cmax2 = cosMax * cosMax;
    const cmin2 = cosMin * cosMin;

    const {_boxes: boxes, _indices: indices, _levelBounds: levelBounds} = index;
    const nodeSize4 = index.nodeSize * 4;

    // Plain stack-based depth-first traversal, pruning any node whose lower-bound distance
    // exceeds the radius. We carry each node's tree level on the stack alongside its offset
    // (rather than re-deriving it with a binary search) so the node end is a direct lookup.
    // Seed with the root node at the top level.
    const stack = withinStack;
    let sp = 0;
    stack[sp++] = boxes.length - 4;
    stack[sp++] = levelBounds.length - 1;

    while (sp > 0) {
        const level = stack[--sp];
        const nodeIndex = stack[--sp];
        const isLeafLevel = level === 0;
        const end = Math.min(nodeIndex + nodeSize4, levelBounds[level]);

        for (let pos = nodeIndex; pos < end; pos += 4) {
            const childIndex = indices[pos >> 2] | 0;

            // cheap trig-free pre-prune: the latitude gap is a lower bound on the distance
            const minLng = boxes[pos];
            const minLat = boxes[pos + 1];
            const maxLng = boxes[pos + 2];
            const maxLat = boxes[pos + 3];
            const latGap = lat > maxLat ? lat - maxLat : lat < minLat ? minLat - lat : 0;
            if (latGap > angularRadius) continue;

            // longitude gap to the nearest box edge, wrapped to [0, 180] (trig-free)
            let lngGap;
            if (lng >= minLng && lng <= maxLng) {
                lngGap = 0;
            } else {
                let w = minLng - lng; if (w < 0) w += 360;
                let e = lng - maxLng; if (e < 0) e += 360;
                lngGap = w <= e ? w : e;
                if (lngGap > 180) lngGap = 360 - lngGap;
            }
            const latGap2 = latGap * latGap;
            const lngGap2 = lngGap * lngGap;
            if (latGap2 + cmin2 * lngGap2 > rho2) continue; // rigorous lower bound beyond radius — prune (no trig)

            // For leaf points, accept outright when the upper bound is also within radius; only the
            // boundary band (lower bound in, upper bound out) falls through to the exact spherical test.
            if (isLeafLevel && latGap2 + cmax2 * lngGap2 > rho2 &&
                boxNegCosDist(lng, lat, minLng, minLat, maxLng, maxLat, cosLat, sinLat) > negCosRadius) continue;

            if (isLeafLevel) {
                // leaf items are points; reaching here means they're within range
                if (!filterFn || filterFn(childIndex)) result.push(childIndex);
            } else {
                stack[sp++] = childIndex;
                stack[sp++] = level - 1;
            }
        }
    }

    return result;
}

/**
 * Binary search for the first value in the array bigger than the given.
 * @param {number} value
 * @param {number[]} arr
 */
function upperBound(value, arr) {
    let i = 0;
    let j = arr.length - 1;
    while (i < j) {
        const m = (i + j) >> 1;
        if (arr[m] > value) {
            j = m;
        } else {
            i = m + 1;
        }
    }
    return arr[i];
}

/**
 * Lower bound for distance from a location to points inside a bounding box,
 * expressed as the negative cosine of the angular distance (monotonic with real distance,
 * but avoids a Math.acos call on every comparison).
 * @param {number} lng
 * @param {number} lat
 * @param {number} minLng
 * @param {number} minLat
 * @param {number} maxLng
 * @param {number} maxLat
 * @param {number} cosLat
 * @param {number} sinLat
 */
function boxNegCosDist(lng, lat, minLng, minLat, maxLng, maxLat, cosLat, sinLat) {
    // query point is between minimum and maximum longitudes
    if (lng >= minLng && lng <= maxLng) {
        if (lat < minLat) return -Math.cos((minLat - lat) * rad); // south
        if (lat > maxLat) return -Math.cos((lat - maxLat) * rad); // north
        return -1; // inside the bbox
    }

    // query point is west or east of the bounding box;
    // calculate the extremum for great circle distance from query point to the closest longitude
    let westGap = minLng - lng; if (westGap < 0) westGap += 360;
    let eastGap = lng - maxLng; if (eastGap < 0) eastGap += 360;
    const closestLng = westGap <= eastGap ? minLng : maxLng;
    const cosLngDelta = Math.cos((closestLng - lng) * rad);

    // bigger d = closer; take the max of candidate cosines as the lower bound on distance
    const dMin = cosAngular(minLat, cosLat, sinLat, cosLngDelta);
    if (minLat === maxLat) return -dMin; // point item — skip second corner and extremum check
    let d = Math.max(dMin, cosAngular(maxLat, cosLat, sinLat, cosLngDelta));

    const extremumLat = Math.atan(sinLat / (cosLat * cosLngDelta)) / rad;
    if (extremumLat > minLat && extremumLat < maxLat) {
        d = Math.max(d, cosAngular(extremumLat, cosLat, sinLat, cosLngDelta));
    }

    return -d;
}

/**
 * Cosine of angular distance between query point and (any_lng_with_cosLngDelta, lat).
 * @param {number} lat
 * @param {number} cosLat
 * @param {number} sinLat
 * @param {number} cosLngDelta
 */
function cosAngular(lat, cosLat, sinLat, cosLngDelta) {
    const d = sinLat * Math.sin(lat * rad) + cosLat * Math.cos(lat * rad) * cosLngDelta;
    return d < 1 ? d : 1;
}

/**
 * Geographical distance between two points in kilometers using the spherical law of cosines.
 * @param {number} lng Longitude of the first point.
 * @param {number} lat Latitude of the first point.
 * @param {number} lng2 Longitude of the second point.
 * @param {number} lat2 Latitude of the second point.
 * @returns {number}
 */
export function distance(lng, lat, lng2, lat2) {
    const cosLat = Math.cos(lat * rad);
    const sinLat = Math.sin(lat * rad);
    const cosLngDelta = Math.cos((lng2 - lng) * rad);
    return earthRadius * Math.acos(cosAngular(lat2, cosLat, sinLat, cosLngDelta));
}
