/** Vitest's `?raw` import, used by icons.test.ts to compare a component with its design file. */
declare module '*?raw' {
  const source: string
  export default source
}
