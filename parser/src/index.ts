/**
 * This parser is built upon the Nunjucks parser.
 * Please see NOTICE.md for license information
 */
import parser from "./parser";
import { Parser } from "./types/parser";
import Tags from "./Tags";
import { AST } from "prettier";

const parse = (text: string, parsers: object, options: object): AST => {
  //@ts-ignore
  const { parse } = parser.parser as Parser;
  // We call into parser, but we extend it by passing in our custom tags
  return parse(text, [new Tags()], { trimBlocks: false, lstripBlocks: false });
};

// It is required that we export the parse function for prettier to hook into it
export { parse };
