// Used only by `vite build --mode cdn`: resolves `import Phaser from 'phaser'` to the global
// that a <script src=".../phaser.min.js"> tag defines, so the page can load Phaser from a CDN.
const Phaser = (globalThis as unknown as { Phaser: typeof import('phaser') }).Phaser;
export default Phaser;
