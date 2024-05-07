import path from "path";
import { fileURLToPath } from "url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
global.run_spec(path.join(testDirectory, "./"));
