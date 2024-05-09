// source: https://github.com/prettier/prettier/blob/ee2839bacbf6a52d004fa2f0373b732f6f191ccc/tests_config/run_spec.js
"use strict";

import { describe, expect, it, xdescribe } from "@jest/globals";
import fs from "fs";
import path from "path";
import prettier, { ParserOptions } from "prettier";
import { fileURLToPath } from "url";
import { preprocess } from "../../src/index";

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

  xdescribe("Formatting tests", () => {
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
  });

  describe("Preprocessor Idempotence", () => {
    testObjects.forEach(async (testObj) => {
      const { fileName, input } = testObj;
      it(`preprocessor is idempotent for ${fileName}`, async () => {
        const firstRun = await preprocess(input);
        const secondRun = await preprocess(firstRun);
        expect(firstRun).toEqual(secondRun);
      });
    });
  });

  xdescribe("Idempotence tests", () => {
    testObjects.forEach(async (testObj) => {
      const { fileName, input, mergedOptions } = testObj;
      it(`is idempotent for ${fileName}`, async () => {
        const firstRun = await prettyprint(input, mergedOptions);
        const secondRun = await prettyprint(firstRun, mergedOptions);
        expect(firstRun).toEqual(secondRun);
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
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  return Object.assign(
    {
      plugins: [
        path.resolve(path.join(testDirectory, "../.."), "dist/src/index.js"),
      ],
      printWidth: 80,
    },
    parserConfig,
  );
}
