import resolve from 'rollup-plugin-node-resolve';
import buble from 'rollup-plugin-buble';

export default {
    input: 'index.mjs',
    output: {
        file: 'index.js',
        name: 'geoflatbush',
        format: 'umd',
        indent: false
    },
    plugins: [resolve(), buble()]
};
