// source: https://github.com/prettier/prettier/blob/ee2839bacbf6a52d004fa2f0373b732f6f191ccc/tests_config/run_spec.js
"use strict";

import fs from "fs";
import path from "path";
import prettier from "prettier";
import { fileURLToPath } from "url";
import { expect, test } from "@jest/globals";
import { describe } from "node:test";

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

function createTestObject(dirName, fileName, options) {
  const filePath = path.join(dirName, fileName);
  const isValidTestFile =
    path.extname(fileName) !== ".snap" &&
    fs.lstatSync(filePath).isFile() &&
    fileName[0] !== "." &&
    fileName !== "run_tests.js";

  if (!isValidTestFile) return undefined;

  let rangeStart = 0;
  let rangeEnd = Infinity;
  let cursorOffset;
  const source = read(filePath)
    .replace(/\r\n/g, "\n")
    .replace("<<<PRETTIER_RANGE_START>>>", (_, offset) => {
      rangeStart = offset;
      return "";
    })
    .replace("<<<PRETTIER_RANGE_END>>>", (_, offset) => {
      rangeEnd = offset;
      return "";
    });

  const input = source.replace("<|>", (_, offset) => {
    cursorOffset = offset;
    return "";
  });

  const mergedOptions = Object.assign(mergeDefaultOptions(options || {}), {
    filePath,
    rangeStart,
    rangeEnd,
    cursorOffset,
    parser: "hubl",
  });

  return {
    fileName,
    dirName,
    source,
    input,
    mergedOptions,
  };
}

async function run_spec(dirName, options) {
  const testObjects = fs
    .readdirSync(dirName)
    .map((fileName) => createTestObject(dirName, fileName, options))
    .filter((testObj) => testObj !== undefined);

  describe("Formatting tests", () => {
    testObjects.forEach(async (testObj) => {
      const { fileName, source, input, mergedOptions } = testObj;
      const output = await prettyprint(input, mergedOptions);
      it(`formats ${fileName} correctly`, () => {
        expect(
          raw(source + "~".repeat(mergedOptions.printWidth) + "\n" + output),
        ).toMatchSnapshot();
      });
    });
  });

  xdescribe("Idempotence tests", () => {
    testObjects.forEach(async (testObj) => {
      const { input, mergedOptions, fileName } = testObj;
      const firstPass = await prettyprint(input, mergedOptions);
      const secondPass = await prettyprint(firstPass, mergedOptions);
      it(`is idempotent for ${fileName}`, () => {
        expect(firstPass).toEqual(secondPass);
      });
    });
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
