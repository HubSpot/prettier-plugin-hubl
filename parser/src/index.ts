/**
 * Parser Code - https://github.com/mozilla/nunjucks/blob/master/nunjucks/src/parser.js
 * API - https://mozilla.github.io/nunjucks/api.html
 *
 * Overview: nunjucks is the JS version of Jinja.  It has some differences, however
 * we install full Jinja compatibility using the `nunjucks.installJinjaCompat()` function.
 * For testing, we use the `testInput` function.  For actual release, we export the `parse` function.
 */
import nunjucks from "./parser";
import { Parser } from "./types/parser";
import Tags from "./Tags";
import installCompat from "./hubl-compat.js";

type AST = any; //TODO Type me

const parse = (text: string, parsers: object, options: object): AST => {
  // Nunjucks exposes nunjucks.installJinjaCompat(), but this is a modified version with HubL support
  //@ts-ignore
  installCompat(nunjucks);
  // Nunjucks' type doesn't expose the parser, so we need to do some casting
  //@ts-ignore
  const { parse } = nunjucks.parser as Parser;
  // We call into nunjucks' default parser, but we extend it by passing in our custom tags
  return parse(text, [new Tags()], { trimBlocks: false, lstripBlocks: false });
};

// It is required that we export the parse function for prettier to hook into it
export { parse };
