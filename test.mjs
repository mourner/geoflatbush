import test from 'tape';
import Flatbush from 'flatbush';
import cities from 'all-the-cities';
import {around, distance} from './index.mjs';

const index = new Flatbush(cities.length, 4);
for (const {lon, lat} of cities) index.add(lon, lat, lon, lat);
index.finish();

test('performs search according to maxResults', (t) => {
    const points = around(index, -119.7051, 34.4363, 5);
    t.same(points.map(i => cities[i].name).join(', '), 'Mission Canyon, Santa Barbara, Montecito, Summerland, Goleta');
    t.end();
});

test('performs search within maxDistance', (t) => {
    const points = around(index, 30.5, 50.5, Infinity, 20);
    t.same(points.map(i => cities[i].name).join(', '),
        'Kiev, Vyshhorod, Kotsyubyns’ke, Sofiyivska Borschagivka, Vyshneve, Kriukivschina, Irpin’, Hostomel’, Khotiv');
    t.end();
});

test('performs search using filter function', (t) => {
    const points = around(index, 30.5, 50.5, 10, Infinity, i => cities[i].population > 1000000);
    t.same(points.map(i => cities[i].name).join(', '),
        'Kiev, Dnipropetrovsk, Kharkiv, Minsk, Odessa, Donets’k, Warsaw, Bucharest, Moscow, Rostov-na-Donu');
    t.end();
});

test('performs exhaustive search in correct order', (t) => {
    const points = around(index, 30.5, 50.5).map(i => cities[i]);

    const c = {lon: 30.5, lat: 50.5};
    const sorted = cities
        .map(item => ({item, dist: distance(c.lon, c.lat, item.lon, item.lat)}))
        .sort((a, b) => a.dist - b.dist);

    for (let i = 0; i < sorted.length; i++) {
        const dist = distance(points[i].lon, points[i].lat, c.lon, c.lat);
        if (dist !== sorted[i].dist) {
            t.fail(`${points[i].name} vs ${sorted[i].item.name}`);
            break;
        }
    }
    t.pass('all points in correct order');

    t.end();
});

test('calculates great circle distance', (t) => {
    t.equal(10131.7396, Math.round(1e4 * distance(30.5, 50.5, -119.7, 34.4)) / 1e4);
    t.end();
});
