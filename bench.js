
import cities from 'all-the-cities';
import FlatBush from 'flatbush';
import {around, within} from './index.js';

const n = cities.length;
const REPS = 5; // repetitions per search benchmark

console.log(`${n} cities`);
console.log(`runs: ${REPS}`);

// Seeded PRNG (mulberry32) so queries are identical across process runs,
// making before/after comparisons of an optimization meaningful.
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const random = mulberry32(0x9e3779b9);

function makeRandomPoints(count) {
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push(-180 + 360 * random(), -60 + 140 * random());
    }
    return points;
}

const ms = t => `${t.toFixed(2)}ms`.padStart(9);

// min + mean±std over an array of timings (ms)
function stats(times) {
    const len = times.length;
    const min = Math.min(...times);
    const mean = times.reduce((a, b) => a + b, 0) / len;
    const std = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / len);
    return `min ${ms(min)}   mean ${ms(mean)} ± ${std.toFixed(2)}ms`;
}

function buildIndex() {
    const index = new FlatBush(n, 4);
    for (const {lon, lat} of cities) index.add(lon, lat, lon, lat);
    index.finish();
    return index;
}

const index = buildIndex();
console.log(`index size: ${index.data.byteLength.toLocaleString()} bytes`);

// accumulator to prevent dead-code elimination of search results
let sink = 0;

// run `fn` once as warmup, then time it REPS times
function bench(name, fn) {
    sink += fn();
    const times = [];
    for (let r = 0; r < REPS; r++) {
        const start = performance.now();
        sink += fn();
        times.push(performance.now() - start);
    }
    console.log(`${name.padEnd(34)}${stats(times)}`);
}

// query sets scaled so each test does roughly comparable total work (~100-200ms). The two
// within/around pairs below share one query set per radius (so the times are directly
// comparable), sized for the slower `around` member — the much faster `within` line is the point.
const center = [-119.7051, 34.4363];

bench('around 1000 closest (×1500)', () => {
    let s = 0;
    for (let i = 0; i < 1500; i++) s += around(index, center[0], center[1], 1000).length;
    return s;
});

bench(`around all ${n} (×6)`, () => {
    let s = 0;
    for (let i = 0; i < 6; i++) s += around(index, center[0], center[1]).length;
    return s;
});

const pts1 = makeRandomPoints(20000);
bench('around 1 closest (×20000)', () => {
    let s = 0;
    for (let i = 0; i < pts1.length; i += 2) s += around(index, pts1[i], pts1[i + 1], 1).length;
    return s;
});

// radius search vs. the equivalent maxDistance kNN query, over random points for the same result set
for (const [radius, points] of [[50, makeRandomPoints(30000)], [500, makeRandomPoints(3500)]]) {
    const calls = points.length / 2;

    bench(`within ${radius}km (×${calls})`, () => {
        let s = 0;
        for (let i = 0; i < points.length; i += 2) s += within(index, points[i], points[i + 1], radius).length;
        return s;
    });

    bench(`around within ${radius}km (×${calls})`, () => {
        let s = 0;
        for (let i = 0; i < points.length; i += 2) s += around(index, points[i], points[i + 1], Infinity, radius).length;
        return s;
    });
}

// clustering-style pattern: one radius query per item over the same index (e.g. DBSCAN),
// the workload that benefits most from `within` reusing its scratch stack across calls
const clusterPts = makeRandomPoints(350000);
bench(`within 10km clustering (×${clusterPts.length / 2})`, () => {
    let s = 0;
    for (let i = 0; i < clusterPts.length; i += 2) s += within(index, clusterPts[i], clusterPts[i + 1], 10).length;
    return s;
});

if (sink < 0) console.log(sink); // keep sink observable
