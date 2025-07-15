
const earthRadius = 6371;
const earthCircumference = 40007;
const rad = Math.PI / 180;

export function around(index, lng, lat, maxResults = Infinity, maxDistance = Infinity, filterFn) {
    const result = [];

    const cosLat = Math.cos(lat * rad);
    const sinLat = Math.sin(lat * rad);

    // a distance-sorted priority queue that will contain both points and tree nodes
    const q = index._queue;

    // index of the top tree node (the whole Earth)
    let nodeIndex = index._boxes.length - 4;

    /* eslint-disable no-labels */
    outer: while (nodeIndex !== undefined) {
        // find the end index of the node
        const end = Math.min(nodeIndex + index.nodeSize * 4, upperBound(nodeIndex, index._levelBounds));

        // add child nodes to the queue
        for (let pos = nodeIndex; pos < end; pos += 4) {
            const childIndex = index._indices[pos >> 2] | 0;

            const minLng = index._boxes[pos];
            const minLat = index._boxes[pos + 1];
            const maxLng = index._boxes[pos + 2];
            const maxLat = index._boxes[pos + 3];

            const dist = boxDist(lng, lat, minLng, minLat, maxLng, maxLat, cosLat, sinLat);

            if (nodeIndex < index.numItems * 4) { // leaf node
                // put a negative index if it's an item rather than a node, to recognize later
                if (!filterFn || filterFn(childIndex)) q.push(-childIndex - 1, dist);
            } else {
                q.push(childIndex, dist);
            }
        }

        while (q.length && q.peek() < 0) {
            const dist = q.peekValue();
            if (dist > maxDistance) break outer;
            result.push(-q.pop() - 1);
            if (result.length === maxResults) break outer;
        }

        nodeIndex = q.pop();
    }

    q.clear();
    return result;
}

// binary search for the first value in the array bigger than the given
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

// lower bound for distance from a location to points inside a bounding box
function boxDist(lng, lat, minLng, minLat, maxLng, maxLat, cosLat, sinLat) {
    if (minLng === maxLng && minLat === maxLat) {
        return greatCircleDist(lng, lat, minLng, minLat, cosLat, sinLat);
    }

    // query point is between minimum and maximum longitudes
    if (lng >= minLng && lng <= maxLng) {
        if (lat <= minLat) return earthCircumference * (minLat - lat) / 360; // south
        if (lat >= maxLat) return earthCircumference * (lat - maxLat) / 360; // north
        return 0; // inside the bbox
    }

    // query point is west or east of the bounding box;
    // calculate the extremum for great circle distance from query point to the closest longitude
    const closestLng = (minLng - lng + 360) % 360 <= (lng - maxLng + 360) % 360 ? minLng : maxLng;
    const cosLngDelta = Math.cos((closestLng - lng) * rad);
    const extremumLat = Math.atan(sinLat / (cosLat * cosLngDelta)) / rad;

    // calculate distances to lower and higher bbox corners and extremum (if it's within this range);
    // one of the three distances will be the lower bound of great circle distance to bbox
    let d = Math.max(
        greatCircleDistPart(minLat, cosLat, sinLat, cosLngDelta),
        greatCircleDistPart(maxLat, cosLat, sinLat, cosLngDelta));

    if (extremumLat > minLat && extremumLat < maxLat) {
        d = Math.max(d, greatCircleDistPart(extremumLat, cosLat, sinLat, cosLngDelta));
    }

    return earthRadius * Math.acos(d);
}

// distance using spherical law of cosines; should be precise enough for our needs
function greatCircleDist(lng, lat, lng2, lat2, cosLat, sinLat) {
    const cosLngDelta = Math.cos((lng2 - lng) * rad);
    return earthRadius * Math.acos(greatCircleDistPart(lat2, cosLat, sinLat, cosLngDelta));
}

// partial greatCircleDist to reduce trigonometric calculations
function greatCircleDistPart(lat, cosLat, sinLat, cosLngDelta) {
    const d = sinLat * Math.sin(lat * rad) + cosLat * Math.cos(lat * rad) * cosLngDelta;
    return Math.min(d, 1);
}

export function distance(lng, lat, lng2, lat2) {
    return greatCircleDist(lng, lat, lng2, lat2, Math.cos(lat * rad), Math.sin(lat * rad));
}
