import path from "path";
import { fileURLToPath } from "url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
global.run_spec(path.join(testDirectory, "./"), {
  hublCustomTags: ["my_self_closing_tag", "my_block_tag:end_my_block_tag"],
});
