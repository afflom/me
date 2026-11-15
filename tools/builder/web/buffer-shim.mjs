/**
 * The one use prism-code's journey renderer makes of Node's Buffer, as a hex
 * string of bytes, for the browser. Node keeps its own Buffer.
 */
globalThis.Buffer ??= {
  from: (bytes) => ({
    toString: (encoding) => {
      if (encoding !== 'hex') throw new Error(`Buffer shim: only hex, not ${encoding}`);
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
  }),
};
