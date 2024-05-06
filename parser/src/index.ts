/**
 * This parser is built upon the Nunjucks parser.
 * Please see NOTICE.md for license information
 */
import { AST, ParserOptions } from "prettier";
import parser from "./parser";
import Tags from "./Tags";

const parse = (text: string, options: ParserOptions): AST => {
  const { parse } = parser.parser;
  // We call into parser, but we extend it by passing in our custom tags
  return parse(text, [new Tags()], { trimBlocks: false, lstripBlocks: false });
};

// It is required that we export the parse function for prettier to hook into it
export { parse };
