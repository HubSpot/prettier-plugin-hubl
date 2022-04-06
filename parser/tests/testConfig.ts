import "colors";
import { parse } from "../dist/index";
import fs from "fs";
import path from "path";

const simpleWorkingPath = "tests/simple/working";
const simpleBrokenPath = "tests/simple/broken";
const complexPath = "tests/complex";

type Spec = {
  folderPath: string;
  files: Array<string>;
};

const base = path.join(__dirname, "..");

const getFiles = (suffix: string) => {
  const folderPath = `${base}/${suffix}`;
  const files = fs.readdirSync(folderPath);
  return { folderPath, files };
};

const printAST = (n) => {
  console.log(JSON.stringify(n, null, 2));
  // if (!n) {
  //   return;
  // }

  // console.log(JSON.stringify(n));

  // if (!n.children) {
  //   return;
  // }
  // Array.from(n.children).forEach(printAST);
};

try {
  const args = process.argv.slice(2);
  let filesToTest: Array<Spec> = [];
  if (!args.length) {
    filesToTest.push(
      getFiles(simpleWorkingPath),
      getFiles(simpleBrokenPath),
      getFiles(complexPath)
    );
  } else {
    filesToTest = args
      .map((arg) => {
        switch (arg) {
          case "--simple-working":
            return getFiles(simpleWorkingPath);
          case "--simple-broken":
            return getFiles(simpleBrokenPath);
          case "--complex":
            return getFiles(complexPath);
          default:
            return { folderPath: base, files: [arg] };
        }
      })
      // Hack to ensure we don't accidentally treat flags as folders
      .filter((f) => f.files.every((file) => !file.startsWith("--")));
  }

  // Iterate through each folder and test all files in that folder, or in the case
  // of a single file, test that file
  filesToTest.forEach(({ folderPath, files }) => {
    if (!process.argv.slice(2).includes("--silent")) {
      console.log(`------ TESTING ${folderPath} ------`.cyan.bold);
    }

    files.forEach((file) => {
      try {
        // We define success as having no errors
        const output = parse(
          fs.readFileSync(`${folderPath}/${file}`, "utf-8"),
          {},
          {}
        );

        if (!process.argv.slice(2).includes("--silent")) {
          console.log(`[Pass]: `.green, file);
        }

        if (process.argv.slice(2).includes("--debug")) {
          printAST(output);
        }
      } catch (e: any) {
        if (!process.argv.slice(2).includes("--silent")) {
          console.error(`[Fail]:`.red, file);
        }

        if (process.argv.slice(2).includes("--debug")) {
          console.error(e.message.red);
        }
        if (e.code === "ENOENT") {
          console.log(
            `File path for testing a single should be the path to a test file from the CWD`
              .yellow
          );
        }
      }
    });
  });
} catch (err) {
  console.log(err);
}
