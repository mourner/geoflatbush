import test from 'node:test';
import assert from 'node:assert/strict';
import Flatbush from 'flatbush';
import cities from 'all-the-cities';
import {around, within, distance} from './index.js';

const index = new Flatbush(cities.length, 4);
for (const {lon, lat} of cities) index.add(lon, lat, lon, lat);
index.finish();

test('performs search according to maxResults', () => {
    const points = around(index, -119.7051, 34.4363, 5);
    assert.deepEqual(points.map(i => cities[i].name).join(', '), 'Mission Canyon, Santa Barbara, Montecito, Summerland, Goleta');
});

test('performs search within maxDistance', () => {
    const points = around(index, 30.5, 50.5, Infinity, 20);
    assert.deepEqual(points.map(i => cities[i].name).join(', '),
        'Kiev, Vyshhorod, Kotsyubyns’ke, Sofiyivska Borschagivka, Vyshneve, Kriukivschina, Irpin’, Hostomel’, Khotiv');
});

test('performs search using filter function', () => {
    const points = around(index, 30.5, 50.5, 10, Infinity, i => cities[i].population > 1000000);
    assert.deepEqual(points.map(i => cities[i].name).join(', '),
        'Kiev, Dnipropetrovsk, Kharkiv, Minsk, Odessa, Donets’k, Warsaw, Bucharest, Moscow, Rostov-na-Donu');
});

test('performs radius search', () => {
    const points = within(index, 30.5, 50.5, 20);
    const names = points.map(i => cities[i].name).sort();
    // same set as the equivalent maxDistance `around` query, order-independent
    const expected = around(index, 30.5, 50.5, Infinity, 20).map(i => cities[i].name).sort();
    assert.deepEqual(names, expected);
});

test('radius search matches a brute-force scan', () => {
    const radius = 50;
    const points = within(index, 30.5, 50.5, radius).sort((a, b) => a - b);
    const expected = cities
        .map((_, i) => i)
        .filter(i => distance(cities[i].lon, cities[i].lat, 30.5, 50.5) <= radius)
        .sort((a, b) => a - b);
    assert.deepEqual(points, expected);
});

test('radius search using filter function', () => {
    const points = within(index, 30.5, 50.5, 500, i => cities[i].population > 1000000);
    const names = points.map(i => cities[i].name).sort();
    assert.deepEqual(names, ['Dnipropetrovsk', 'Kharkiv', 'Kiev', 'Minsk', 'Odessa']);
});

test('performs exhaustive search in correct order', () => {
    const points = around(index, 30.5, 50.5).map(i => cities[i]);

    const lon = 30.5;
    const lat = 50.5;
    const expectedDistances = cities.map(p => distance(p.lon, p.lat, lon, lat)).sort((a, b) => a - b);
    const actualDistances = points.map(p => distance(p.lon, p.lat, lon, lat));

    assert.deepEqual(expectedDistances, actualDistances);
});

test('calculates great circle distance', () => {
    assert.equal(10131.7396, Math.round(1e4 * distance(30.5, 50.5, -119.7, 34.4)) / 1e4);
});
