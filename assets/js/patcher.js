/**
 * @file patcher.js
 * @brief Connects the download page's form to the BPS patcher.
 *
 * Flow: the player picks a ROM -> it is read and checksummed locally -> on
 * submit the release's patch is fetched from this site -> the patch is applied
 * in memory -> the result is offered as a download. Nothing is uploaded.
 *
 * All visible text comes from the JSON block `#patcher-strings`, which the
 * page fills from `_data/i18n/<lang>.yml`, so messages follow the page language.
 */
(function () {
  "use strict";

  /** @brief CRC-32 of a clean Pokémon Emerald (USA) ROM. */
  var CLEAN_EMERALD_CRC32 = 0x1f1c08fb;

  var form = document.getElementById("patcher");
  var stringsElement = document.getElementById("patcher-strings");
  if (!form || !stringsElement) {
    return; // No release published yet, so the page has no patcher.
  }

  var strings = JSON.parse(stringsElement.textContent);
  var romInput = document.getElementById("rom-input");
  var romStatus = document.getElementById("rom-status");
  var button = document.getElementById("patch-button");
  var buttonHint = document.getElementById("patch-button-hint");
  var patchStatus = document.getElementById("patch-status");
  var patchError = document.getElementById("patch-error");

  /** @brief Bytes of the ROM the player chose, or null. */
  var rom = null;
  /** @brief True while a patch is being fetched or applied. */
  var busy = false;

  /**
   * @brief Fills `%name%` placeholders in a translated string.
   * @param template String from `strings`.
   * @param values   Object mapping placeholder names to values.
   * @return The formatted string.
   */
  function format(template, values) {
    return String(template).replace(/%(\w+)%/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
    });
  }

  /**
   * @brief Enables or disables the patch button without removing it from the
   *        tab order, so screen-reader users can still find it and hear why
   *        it is unavailable.
   * @param enabled Whether the button can be used.
   */
  function setButtonEnabled(enabled) {
    button.setAttribute("aria-disabled", enabled ? "false" : "true");
    buttonHint.hidden = enabled;
  }

  /**
   * @brief Shows a progress or success message and clears any error.
   * @param message Text to announce (polite live region).
   */
  function showStatus(message) {
    patchError.textContent = "";
    patchStatus.textContent = message;
  }

  /**
   * @brief Shows an error (assertive alert region) and clears the status.
   * @param code BpsError code or a patcher error code from `strings.errors`.
   */
  function showError(code) {
    var message = strings.errors[code] || strings.errors.unknown;
    patchStatus.textContent = "";
    patchError.textContent = strings.error_prefix + " " + message;
  }

  /**
   * @brief Reads a File into a Uint8Array.
   * @param file File chosen in the input.
   * @return Promise resolving to the file's bytes.
   */
  function readFile(file) {
    if (file.arrayBuffer) {
      return file.arrayBuffer().then(function (buffer) {
        return new Uint8Array(buffer);
      });
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * @brief Hands a file to the browser as a download.
   * @param bytes    File contents.
   * @param filename Suggested file name.
   */
  function saveFile(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
  }

  /** @brief Validates and checksums the ROM when the player picks one. */
  function onRomChosen() {
    rom = null;
    romStatus.textContent = "";
    patchStatus.textContent = "";
    patchError.textContent = "";
    setButtonEnabled(false);

    var file = romInput.files && romInput.files[0];
    if (!file) {
      return;
    }

    romStatus.textContent = strings.reading;
    readFile(file).then(
      function (bytes) {
        var crc = SkyBlueCrc32.crc32(bytes);
        var info = format(strings.rom_info, {
          name: file.name,
          size: bytes.length.toLocaleString(document.documentElement.lang || undefined),
          crc: SkyBlueCrc32.toHex(crc),
        });
        var verdict = crc === CLEAN_EMERALD_CRC32 ? strings.rom_ok : strings.rom_unknown;
        romStatus.textContent = info + ". " + verdict;
        romStatus.classList.toggle("status--ok", crc === CLEAN_EMERALD_CRC32);
        romStatus.classList.toggle("status--warning", crc !== CLEAN_EMERALD_CRC32);
        rom = bytes;
        setButtonEnabled(true);
      },
      function () {
        romStatus.textContent = "";
        showError("read-failed");
      }
    );
  }

  /**
   * @brief Fetches the patch, applies it and downloads the result.
   * @param event Form submit event.
   */
  function onSubmit(event) {
    event.preventDefault();
    if (busy || !rom) {
      if (!rom) {
        romInput.focus();
      }
      return;
    }

    busy = true;
    button.setAttribute("aria-busy", "true");
    showStatus(strings.downloading);

    fetch(form.dataset.patchUrl)
      .then(function (response) {
        if (!response.ok) {
          throw Object.assign(new Error("HTTP " + response.status), { code: "fetch-failed" });
        }
        return response.arrayBuffer();
      }, function (error) {
        throw Object.assign(error, { code: "fetch-failed" });
      })
      .then(function (buffer) {
        showStatus(strings.patching);
        // Give the live region a moment to update before the (synchronous) patch runs.
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            try {
              resolve(SkyBlueBps.apply(rom, new Uint8Array(buffer)));
            } catch (error) {
              reject(error); // Errors thrown in a timer would otherwise escape the chain.
            }
          }, 50);
        });
      })
      .then(function (result) {
        var filename = "pokemon-sky-blue-" + form.dataset.version + ".gba";
        saveFile(result.data, filename);
        showStatus(format(strings.done, { filename: filename }));
      })
      .catch(function (error) {
        if (window.console) {
          console.error(error);
        }
        showError(error && error.code);
      })
      .then(function () {
        busy = false;
        button.removeAttribute("aria-busy");
      });
  }

  romInput.addEventListener("change", onRomChosen);
  form.addEventListener("submit", onSubmit);
  form.hidden = false; // Only shown once JavaScript has wired it up.
  setButtonEnabled(false);
})();
