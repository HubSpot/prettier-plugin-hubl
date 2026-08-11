import path from "path";
import { fileURLToPath } from "url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
global.run_spec(path.join(testDirectory, "./"));
global.run_spec(path.join(testDirectory, "./options/single-attribute-per-line"), {
  singleAttributePerLine: true,
});
global.run_spec(path.join(testDirectory, "./options/wide-print-width"), {
  printWidth: 140,
  singleAttributePerLine: false,
});
