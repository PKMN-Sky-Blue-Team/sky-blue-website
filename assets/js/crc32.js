/**
 * @file crc32.js
 * @brief CRC-32 (IEEE 802.3, the zlib/PNG polynomial) checksums.
 *
 * Works as a plain browser script (exposes `window.SkyBlueCrc32`) and as a
 * CommonJS module for the Node tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SkyBlueCrc32 = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** @brief Lookup table for the reflected polynomial 0xEDB88320. */
  var TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  /**
   * @brief Computes the CRC-32 of a byte range.
   * @param bytes Uint8Array to checksum.
   * @param start Index of the first byte (default 0).
   * @param end   Index one past the last byte (default bytes.length).
   * @return The checksum as an unsigned 32-bit integer.
   */
  function crc32(bytes, start, end) {
    var from = start || 0;
    var to = end === undefined ? bytes.length : end;
    var crc = 0xffffffff;
    for (var i = from; i < to; i++) {
      crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * @brief Formats a checksum the way ROM databases print it.
   * @param value Unsigned 32-bit checksum.
   * @return Eight upper-case hexadecimal digits, e.g. "1F1C08FB".
   */
  function toHex(value) {
    return ("00000000" + value.toString(16).toUpperCase()).slice(-8);
  }

  return { crc32: crc32, toHex: toHex };
});
