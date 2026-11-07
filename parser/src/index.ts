/**
 * This parser is built upon the Nunjucks parser.
 * Please see NOTICE.md for license information
 */
import { AST, ParserOptions } from "prettier";
import * as parser from "./parser/parser.js";
import Tags, { CustomTag } from "./Tags.js";

export interface HublParserOptions extends ParserOptions {
  hublCustomTags?: CustomTag[];
}

const parse = (text: string, options: HublParserOptions): AST => {
  const customTags: CustomTag[] = options?.hublCustomTags ?? [];
  // We call into parser, but we extend it by passing in our custom tags
  return parser.parse(text, [new Tags(customTags)], {
    trimBlocks: false,
    lstripBlocks: false,
  });
};

// It is required that we export the parse function for prettier to hook into it
export { parse };
