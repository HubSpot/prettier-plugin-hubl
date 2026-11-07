import path from "path";
import { fileURLToPath } from "url";

// These fixtures only reproduce with `singleAttributePerLine`, which makes the
// HTML formatter break every attribute onto its own line and split closing tags
// across lines. That layout is what the multi-line tag protection has to cope
// with, and it is the configuration real HubSpot projects use.
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
global.run_spec(path.join(testDirectory, "./"), {
  singleAttributePerLine: true,
  printWidth: 120,
});
