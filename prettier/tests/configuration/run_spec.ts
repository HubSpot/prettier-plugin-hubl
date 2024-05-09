// source: https://github.com/prettier/prettier/blob/ee2839bacbf6a52d004fa2f0373b732f6f191ccc/tests_config/run_spec.js
"use strict";

import fs from "fs";
import path from "path";
import prettier, { ParserOptions } from "prettier";
import { expect, it, describe } from "@jest/globals";

type TestObject = {
  fileName: string;
  dirName: string;
  source: string;
  input: string;
  mergedOptions: ParserOptions;
};

const RAW = Symbol.for("raw");
expect.addSnapshotSerializer({
  print(val: unknown) {
    return (val as Record<symbol, string>)[RAW];
  },
  test(val: Record<symbol, string>) {
    return (
      val &&
      Object.prototype.hasOwnProperty.call(val, RAW) &&
      typeof val[RAW] === "string"
    );
  },
});

function createTestObject(
  dirName: string,
  fileName: string,
  options: ParserOptions,
): TestObject | undefined {
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
  const source = fs
    .readFileSync(filePath, "utf-8")
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
    .filter((testObj) => testObj !== undefined) as TestObject[];

  testObjects.forEach(async (testObj) => {
    const { fileName, source, input, mergedOptions } = testObj;
    it(`formats ${fileName} correctly`, async () => {
      const output = await prettyprint(input, mergedOptions);
      const snapshot = raw(
        source + "~".repeat(mergedOptions.printWidth) + "\n" + output,
      );
      expect(snapshot).toMatchSnapshot();
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
        path.resolve(path.join(__dirname, "../.."), "dist/src/index.js"),
      ],
      printWidth: 80,
    },
    parserConfig,
  );
}
