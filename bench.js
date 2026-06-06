
import cities from 'all-the-cities';
import FlatBush from 'flatbush';
import {around, within} from './index.js';

const n = cities.length;
const k = 100000;

const randomPoints = [];
for (let i = 0; i < k; i++) randomPoints.push({
    lon: -180 + 360 * Math.random(),
    lat: -60 + 140 * Math.random()
});

console.time(`index ${n} points`);
const index = new FlatBush(cities.length, 4);
for (const {lon, lat} of cities) index.add(lon, lat, lon, lat);
index.finish();
console.timeEnd(`index ${n} points`);

console.time('query 1000 closest');
around(index, -119.7051, 34.4363, 1000);
console.timeEnd('query 1000 closest');

console.time('query 50000 closest');
around(index, -119.7051, 34.4363, 50000);
console.timeEnd('query 50000 closest');

console.time(`query all ${n}`);
around(index, -119.7051, 34.4363);
console.timeEnd(`query all ${n}`);

console.time('2 closest for every point');
for (const c of cities) around(index, c.lon, c.lat, 2);
console.timeEnd('2 closest for every point');

console.time(`${k} random queries of 1 closest`);
for (let i = 0; i < k; i++) around(index, randomPoints[i].lon, randomPoints[i].lat, 1);
console.timeEnd(`${k} random queries of 1 closest`);

// radius search vs. the equivalent maxDistance kNN query, for the same result set
for (const radius of [100, 1000]) {
    const n2 = within(index, -119.7051, 34.4363, radius).length;

    console.time(`within ${radius}km (${n2} results)`);
    within(index, -119.7051, 34.4363, radius);
    console.timeEnd(`within ${radius}km (${n2} results)`);

    console.time(`around within ${radius}km (${n2} results)`);
    around(index, -119.7051, 34.4363, Infinity, radius);
    console.timeEnd(`around within ${radius}km (${n2} results)`);
}

console.time(`${k} random within 50km queries`);
for (let i = 0; i < k; i++) within(index, randomPoints[i].lon, randomPoints[i].lat, 50);
console.timeEnd(`${k} random within 50km queries`);

console.time(`${k} random around within 50km queries`);
for (let i = 0; i < k; i++) around(index, randomPoints[i].lon, randomPoints[i].lat, Infinity, 50);
console.timeEnd(`${k} random around within 50km queries`);

console.time(`${k} random within 500km queries`);
for (let i = 0; i < k; i++) within(index, randomPoints[i].lon, randomPoints[i].lat, 500);
console.timeEnd(`${k} random within 500km queries`);

console.time(`${k} random around within 500km queries`);
for (let i = 0; i < k; i++) around(index, randomPoints[i].lon, randomPoints[i].lat, Infinity, 500);
console.timeEnd(`${k} random around within 500km queries`);
