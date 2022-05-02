/**
 * Parser Code - https://github.com/mozilla/nunjucks/blob/master/nunjucks/src/parser.js
 * API - https://mozilla.github.io/nunjucks/api.html
 *
 * Overview: nunjucks is the JS version of Jinja.  It has some differences, however
 * we install full Jinja compatibility using the `nunjucks.installJinjaCompat()` function.
 * For testing, we use the `testInput` function.  For actual release, we export the `parse` function.
 */
import parser from "./parser";
import { Parser } from "./types/parser";
import Tags from "./Tags";

type AST = any; //TODO Type me

const parse = (text: string, parsers: object, options: object): AST => {
  //@ts-ignore
  const { parse } = parser.parser as Parser;
  // We call into nunjucks' default parser, but we extend it by passing in our custom tags
  return parse(text, [new Tags()], { trimBlocks: false, lstripBlocks: false });
};

// It is required that we export the parse function for prettier to hook into it
export { parse };
