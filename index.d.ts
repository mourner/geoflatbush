/**
 * Search items in a given Flatbush index in order of geographical distance from the given point.
 * Assumes the index contains bbox values of the form [minLng, minLat, maxLng, maxLat].
 *
 * @param {Flatbush} index
 * @param {number} lng
 * @param {number} lat
 * @param {number} [maxResults=Infinity]
 * @param {number} [maxDistance=Infinity]
 * @param {(index: number) => boolean} [filterFn] An optional function for filtering the results.
 * @returns {number[]} An array of indices of items found.
 */
export function around(index: Flatbush, lng: number, lat: number, maxResults?: number, maxDistance?: number, filterFn?: (index: number) => boolean): number[];
/**
 * Geographical distance between two points in kilometers using the Haversine distance formula.
 * @param {number} lng
 * @param {number} lat
 * @param {number} lng2
 * @param {number} lat2
 * @returns {number}
 */
export function distance(lng: number, lat: number, lng2: number, lat2: number): number;
import type Flatbush from 'flatbush';
