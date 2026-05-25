
/** @import Flatbush from 'flatbush' */

const earthRadius = 6371;
const rad = Math.PI / 180;

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
    const closestLng = (minLng - lng + 360) % 360 <= (lng - maxLng + 360) % 360 ? minLng : maxLng;
    const cosLngDelta = Math.cos((closestLng - lng) * rad);
    const extremumLat = Math.atan(sinLat / (cosLat * cosLngDelta)) / rad;

    // bigger d = closer; take the max of candidate cosines as the lower bound on distance
    const dMin = cosAngular(minLat, cosLat, sinLat, cosLngDelta);
    if (minLat === maxLat) return -dMin; // point item — skip second corner and extremum check
    let d = Math.max(dMin, cosAngular(maxLat, cosLat, sinLat, cosLngDelta));

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
