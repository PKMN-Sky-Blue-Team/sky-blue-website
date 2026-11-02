/**
 * @file bps.js
 * @brief Applies BPS patches (byuu's "beat" patch format).
 *
 * Format summary: "BPS1" magic, then varint source size, target size and
 * metadata length, the metadata, a stream of actions, and finally three
 * little-endian CRC-32s (source, target, patch). Each action is a varint whose
 * low two bits select the command and whose remaining bits store length - 1:
 *   0 SourceRead  copy from the source at the current output offset
 *   1 TargetRead  copy literal bytes from the patch
 *   2 SourceCopy  copy from a signed, relative offset in the source
 *   3 TargetCopy  copy from a signed, relative offset in the output so far
 *
 * Works as a plain browser script (exposes `window.SkyBlueBps`, after
 * crc32.js) and as a CommonJS module for the Node tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./crc32.js"));
  } else {
    root.SkyBlueBps = factory(root.SkyBlueCrc32);
  }
})(typeof self !== "undefined" ? self : this, function (Crc32) {
  "use strict";

  /** @brief Size of the trailing checksum block, in bytes. */
  var FOOTER_SIZE = 12;

  /**
   * @brief Error thrown when a patch cannot be applied.
   * @param code Machine-readable reason, one of: "invalid-patch",
   *             "patch-checksum", "source-size", "source-checksum",
   *             "corrupt-patch", "target-checksum". The patcher UI maps these
   *             to translated messages.
   * @param message Developer-facing English description.
   */
  function BpsError(code, message) {
    var error = new Error(message);
    error.name = "BpsError";
    error.code = code;
    return error;
  }

  /**
   * @brief Reads a little-endian unsigned 32-bit integer.
   * @param bytes  Source buffer.
   * @param offset Index of the least significant byte.
   * @return The integer value.
   */
  function readUint32(bytes, offset) {
    return (
      (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
      0
    );
  }

  /**
   * @brief Applies a BPS patch to a source file.
   * @param source Uint8Array holding the unmodified source file (the ROM).
   * @param patch  Uint8Array holding the BPS patch.
   * @return An object `{ data, metadata }`: `data` is a Uint8Array with the
   *         patched file and `metadata` is the patch's metadata string.
   * @throw BpsError if the patch is malformed or does not match the source.
   */
  function apply(source, patch) {
    if (
      patch.length < 4 + 3 + FOOTER_SIZE ||
      patch[0] !== 0x42 || // B
      patch[1] !== 0x50 || // P
      patch[2] !== 0x53 || // S
      patch[3] !== 0x31 // 1
    ) {
      throw BpsError("invalid-patch", "Missing BPS1 header");
    }

    var footer = patch.length - FOOTER_SIZE;
    var expectedSourceCrc = readUint32(patch, footer);
    var expectedTargetCrc = readUint32(patch, footer + 4);
    var expectedPatchCrc = readUint32(patch, footer + 8);

    if (Crc32.crc32(patch, 0, patch.length - 4) !== expectedPatchCrc) {
      throw BpsError("patch-checksum", "Patch checksum mismatch");
    }

    var offset = 4;

    /**
     * @brief Decodes the variable-length integer at `offset` and advances it.
     * @return The decoded value (safe up to 2^53).
     */
    function readVarint() {
      var value = 0;
      var shift = 1;
      for (;;) {
        if (offset >= footer) {
          throw BpsError("corrupt-patch", "Unexpected end of patch data");
        }
        var x = patch[offset++];
        value += (x & 0x7f) * shift;
        if (x & 0x80) {
          return value;
        }
        shift *= 128;
        value += shift;
      }
    }

    var sourceSize = readVarint();
    var targetSize = readVarint();
    var metadataSize = readVarint();
    if (offset + metadataSize > footer) {
      throw BpsError("corrupt-patch", "Metadata runs past the end of the patch");
    }
    var metadata = decodeUtf8(patch.subarray(offset, offset + metadataSize));
    offset += metadataSize;

    if (source.length !== sourceSize) {
      throw BpsError(
        "source-size",
        "Source is " + source.length + " bytes, expected " + sourceSize
      );
    }
    if (Crc32.crc32(source) !== expectedSourceCrc) {
      throw BpsError("source-checksum", "Source checksum mismatch");
    }

    var target = new Uint8Array(targetSize);
    var outputOffset = 0;
    var sourceRelative = 0;
    var targetRelative = 0;

    while (offset < footer) {
      var data = readVarint();
      var command = data % 4;
      var length = Math.floor(data / 4) + 1;

      if (outputOffset + length > targetSize) {
        throw BpsError("corrupt-patch", "Action writes past the end of the target");
      }

      switch (command) {
        case 0: // SourceRead
          if (outputOffset + length > source.length) {
            throw BpsError("corrupt-patch", "SourceRead past the end of the source");
          }
          target.set(source.subarray(outputOffset, outputOffset + length), outputOffset);
          outputOffset += length;
          break;

        case 1: // TargetRead
          if (offset + length > footer) {
            throw BpsError("corrupt-patch", "TargetRead past the end of the patch");
          }
          target.set(patch.subarray(offset, offset + length), outputOffset);
          offset += length;
          outputOffset += length;
          break;

        case 2: // SourceCopy
          sourceRelative += readSignedVarint();
          if (sourceRelative < 0 || sourceRelative + length > source.length) {
            throw BpsError("corrupt-patch", "SourceCopy outside the source");
          }
          target.set(source.subarray(sourceRelative, sourceRelative + length), outputOffset);
          sourceRelative += length;
          outputOffset += length;
          break;

        default: // TargetCopy — may overlap its own output, so copy bytewise.
          targetRelative += readSignedVarint();
          if (targetRelative < 0 || targetRelative >= outputOffset) {
            throw BpsError("corrupt-patch", "TargetCopy outside the written output");
          }
          for (var i = 0; i < length; i++) {
            target[outputOffset++] = target[targetRelative++];
          }
          break;
      }
    }

    if (outputOffset !== targetSize) {
      throw BpsError("corrupt-patch", "Patch did not fill the whole target");
    }
    if (Crc32.crc32(target) !== expectedTargetCrc) {
      throw BpsError("target-checksum", "Target checksum mismatch");
    }

    return { data: target, metadata: metadata };

    /**
     * @brief Decodes a relative offset: bit 0 is the sign, the rest the size.
     * @return The signed offset.
     */
    function readSignedVarint() {
      var raw = readVarint();
      var magnitude = Math.floor(raw / 2);
      return raw % 2 ? -magnitude : magnitude;
    }
  }

  /**
   * @brief Decodes UTF-8 bytes to a string, in browsers and in Node.
   * @param bytes Uint8Array of UTF-8 text.
   * @return The decoded string.
   */
  function decodeUtf8(bytes) {
    if (bytes.length === 0) {
      return "";
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  return { apply: apply, BpsError: BpsError };
});
