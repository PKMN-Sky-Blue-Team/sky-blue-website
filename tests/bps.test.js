/**
 * @file bps.test.js
 * @brief Unit tests for the in-browser BPS patcher. Run with: node --test tests/
 *
 * The tests build tiny BPS patches by hand, so no ROM or real patch is needed.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { crc32, toHex } = require("../assets/js/crc32.js");
const { apply } = require("../assets/js/bps.js");

/**
 * @brief Encodes an unsigned integer as a BPS varint.
 * @param value Non-negative integer.
 * @return Array of bytes.
 */
function varint(value) {
  const out = [];
  for (;;) {
    const x = value & 0x7f;
    value = Math.floor(value / 128);
    if (value === 0) {
      out.push(0x80 | x);
      return out;
    }
    out.push(x);
    value--;
  }
}

/**
 * @brief Encodes a signed relative offset (sign in bit 0).
 * @param value Integer offset.
 * @return Array of bytes.
 */
function signed(value) {
  return varint(Math.abs(value) * 2 + (value < 0 ? 1 : 0));
}

/**
 * @brief Little-endian 32-bit integer bytes.
 * @param value Unsigned integer.
 * @return Array of four bytes.
 */
function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/**
 * @brief Builds a complete BPS patch.
 * @param source   Uint8Array the patch applies to.
 * @param target   Uint8Array the patch should produce.
 * @param actions  Array of byte arrays (already-encoded actions).
 * @param metadata Optional metadata string.
 * @return Uint8Array containing the patch.
 */
function buildPatch(source, target, actions, metadata = "") {
  const meta = Buffer.from(metadata, "utf8");
  const body = [
    ...Buffer.from("BPS1"),
    ...varint(source.length),
    ...varint(target.length),
    ...varint(meta.length),
    ...meta,
    ...actions.flat(),
    ...u32(crc32(source)),
    ...u32(crc32(target)),
  ];
  const withoutPatchCrc = Uint8Array.from(body);
  return Uint8Array.from([...body, ...u32(crc32(withoutPatchCrc))]);
}

/** @brief Encodes an action header: command in the low 2 bits, length - 1 above. */
function action(command, length) {
  return varint((length - 1) * 4 + command);
}

const SOURCE = Uint8Array.from(Buffer.from("Pokemon Emerald!"));

test("crc32 matches the standard check value", () => {
  assert.equal(toHex(crc32(Buffer.from("123456789"))), "CBF43926");
});

test("varints round-trip through large values", () => {
  // A 16 MiB target size exercises multi-byte varints like a real GBA ROM.
  const target = new Uint8Array(16 * 1024 * 1024);
  const source = new Uint8Array(0);
  const patch = buildPatch(source, target, [
    [...action(1, 1), 0],
    [...action(3, target.length - 1), ...signed(0)],
  ]);
  assert.deepEqual(apply(source, patch).data, target);
});

test("applies SourceRead, TargetRead, SourceCopy and TargetCopy", () => {
  // Target: "Pokemon" + " Sky Blue" + " Emerald" + "!!!!"
  const target = Uint8Array.from(Buffer.from("Pokemon Sky Blue Emerald!!!!"));
  const patch = buildPatch(
    SOURCE,
    target,
    [
      action(0, 7), //                         "Pokemon"         (SourceRead)
      [...action(1, 9), ...Buffer.from(" Sky Blue")], //          (TargetRead)
      [...action(2, 8), ...signed(7)], //      " Emerald"        (SourceCopy from 7)
      [...action(2, 1), ...signed(0)], //      "!"               (SourceCopy, continues at 15)
      [...action(3, 3), ...signed(24)], //     "!!!" overlapping (TargetCopy from 24)
    ],
    "<metadata>Sky Blue</metadata>"
  );

  const result = apply(SOURCE, patch);
  assert.equal(Buffer.from(result.data).toString(), "Pokemon Sky Blue Emerald!!!!");
  assert.equal(result.metadata, "<metadata>Sky Blue</metadata>");
});

test("handles negative relative offsets", () => {
  const target = Uint8Array.from(Buffer.from("EmeraldPokemon"));
  const patch = buildPatch(SOURCE, target, [
    [...action(2, 7), ...signed(8)], // "Emerald" from 8; cursor now 15
    [...action(2, 7), ...signed(-15)], // "Pokemon" from 0
  ]);
  assert.equal(Buffer.from(apply(SOURCE, patch).data).toString(), "EmeraldPokemon");
});

/**
 * @brief Asserts that applying a patch throws a BpsError with a given code.
 * @param fn   Function that calls apply().
 * @param code Expected error code.
 */
function assertBpsError(fn, code) {
  assert.throws(fn, (error) => error.name === "BpsError" && error.code === code);
}

test("rejects data that is not a BPS patch", () => {
  assertBpsError(() => apply(SOURCE, Uint8Array.from(Buffer.from("PATCH-not-bps-at-all"))), "invalid-patch");
});

test("rejects a patch whose own checksum is wrong", () => {
  const patch = buildPatch(SOURCE, SOURCE, [action(0, SOURCE.length)]);
  patch[patch.length - 1] ^= 0xff;
  assertBpsError(() => apply(SOURCE, patch), "patch-checksum");
});

test("rejects a ROM of the wrong size", () => {
  const patch = buildPatch(SOURCE, SOURCE, [action(0, SOURCE.length)]);
  assertBpsError(() => apply(SOURCE.subarray(1), patch), "source-size");
});

test("rejects a modified ROM", () => {
  const patch = buildPatch(SOURCE, SOURCE, [action(0, SOURCE.length)]);
  const modified = Uint8Array.from(SOURCE);
  modified[0] ^= 1;
  assertBpsError(() => apply(modified, patch), "source-checksum");
});

test("rejects a patch whose output fails its checksum", () => {
  const wrongTarget = Uint8Array.from(SOURCE);
  wrongTarget[3] ^= 1;
  // Claims to produce wrongTarget but actually just copies the source.
  const patch = buildPatch(SOURCE, wrongTarget, [action(0, SOURCE.length)]);
  assertBpsError(() => apply(SOURCE, patch), "target-checksum");
});

test("rejects actions that write past the end of the target", () => {
  const patch = buildPatch(SOURCE, SOURCE.subarray(0, 4), [action(0, SOURCE.length)]);
  assertBpsError(() => apply(SOURCE, patch), "corrupt-patch");
});

test("rejects copies outside the source", () => {
  const patch = buildPatch(SOURCE, SOURCE.subarray(0, 4), [[...action(2, 4), ...signed(-1)]]);
  assertBpsError(() => apply(SOURCE, patch), "corrupt-patch");
});
