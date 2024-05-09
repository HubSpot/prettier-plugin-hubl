// source: https://github.com/prettier/prettier/blob/ee2839bacbf6a52d004fa2f0373b732f6f191ccc/tests_config/run_spec.js
"use strict";

import fs from "fs";
import path from "path";
import prettier from "prettier";
import { fileURLToPath } from "url";
import { expect, test } from "@jest/globals";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

const RAW = Symbol.for("raw");
expect.addSnapshotSerializer({
  print(val) {
    return val[RAW];
  },
  test(val) {
    return (
      val &&
      Object.prototype.hasOwnProperty.call(val, RAW) &&
      typeof val[RAW] === "string"
    );
  },
});

async function run_spec(dirname, options) {
  fs.readdirSync(dirname).forEach(async (filename) => {
    const filepath = `${dirname}${filename}`;
    if (
      path.extname(filename) !== ".snap" &&
      fs.lstatSync(filepath).isFile() &&
      filename[0] !== "." &&
      filename !== "run_tests.js"
    ) {
      let rangeStart = 0;
      let rangeEnd = Infinity;
      let cursorOffset;
      const source = read(filepath)
        .replace(/\r\n/g, "\n")
        .replace("<<<PRETTIER_RANGE_START>>>", (match, offset) => {
          rangeStart = offset;
          return "";
        })
        .replace("<<<PRETTIER_RANGE_END>>>", (match, offset) => {
          rangeEnd = offset;
          return "";
        });

      const input = source.replace("<|>", (match, offset) => {
        cursorOffset = offset;
        return "";
      });

      const mergedOptions = Object.assign(mergeDefaultOptions(options || {}), {
        filepath,
        rangeStart,
        rangeEnd,
        cursorOffset,
        parser: "hubl",
      });

      const output = prettyprint(input, mergedOptions);

      test(filename, async () => {
        expect(
          raw(
            source +
              "~".repeat(mergedOptions.printWidth) +
              "\n" +
              (await output),
          ),
        ).toMatchSnapshot();
      });
    }
  });
}

async function prettyprint(src, options) {
  const result = await prettier.formatWithCursor(src, options);
  if (options.cursorOffset >= 0) {
    result.formatted =
      result.formatted.slice(0, result.cursorOffset) +
      "<|>" +
      result.formatted.slice(result.cursorOffset);
  }
  return result.formatted;
}

global.run_spec = run_spec;

function read(filename) {
  return fs.readFileSync(filename, "utf8");
}

/**
 * Wraps a string in a marker object that is used by `./raw-serializer.js` to
 * directly print that string in a snapshot without escaping all double quotes.
 * Backticks will still be escaped.
 */
function raw(string) {
  if (typeof string !== "string") {
    throw new Error("Raw snapshots have to be strings.");
  }
  return { [Symbol.for("raw")]: string };
}

function mergeDefaultOptions(parserConfig) {
  return Object.assign(
    {
      plugins: [
        path.resolve(path.join(testDirectory, ".."), "dist/src/index.js"),
      ],
      printWidth: 80,
    },
    parserConfig,
  );
}
