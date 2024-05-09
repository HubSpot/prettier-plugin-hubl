/**
 * This parser is built upon the Nunjucks parser.
 * Please see NOTICE.md for license information
 */
import { AST, ParserOptions } from "prettier";
import * as parser from "./parser/parser.js";
import Tags from "./Tags.js";

const parse = (text: string, _options: ParserOptions): AST => {
  // We call into parser, but we extend it by passing in our custom tags
  return parser.parse(text, [new Tags()], {
    trimBlocks: false,
    lstripBlocks: false,
  });
};

// It is required that we export the parse function for prettier to hook into it
export { parse };
