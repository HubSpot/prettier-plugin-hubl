import type { Plugin } from "prettier";
import synchronizedPrettier from "@prettier/sync";
import { parse } from "hubl-parser";
import printers from "./printHubl.js";

const languages = [
  {
    name: "HubL",
    parsers: ["hubl"],
    extensions: [".hubl.html"],
    vscodeLanguageIds: ["html-hubl"],
  },
];

function locStart(node) {
  return node.colno;
}

function locEnd(node) {
  return node.colno;
}

const Token = {
  styleValue: (index: number) => `__STYLE_VALUE${index}__`,
  styleBlock: (index: number) => `/*styleblock${index}*/`,
  nestedScript: (index: number) => `_${index}`,
  npe: (index: number) => `npe${index}_`,
  comment: (index: number) => `<!--${index}-->`,
  placeholder: (index: number) => `<!--placeholder-${index}-->`,
  svgBlock: (index: number) => `<!--svgblock-${index}-->`,
  jsonBlock: (match: string) => `{% json_block %}${match}{% end_json_block %}`,
};

const SVG_ELEMENT_REGEX = /<svg\b[\s\S]*?<\/svg>/gim;
// Same as SVG_ELEMENT_REGEX, but also captures the whitespace on the opening
// `<svg>` tag's own line. Only used post-HTML-format (see wrapSvgWithPreserve)
// so the correctly-computed nesting indent (e.g. one level inside a parent
// <div>) is folded into the Preserve node's value instead of being lost.
const SVG_ELEMENT_WITH_LEADING_WHITESPACE_REGEX =
  /[ \t]*<svg\b[\s\S]*?<\/svg>/gim;

/**
 * Replaces entire `<svg>...</svg>` blocks with a placeholder before the HTML
 * formatting pass so Prettier's HTML formatter never reflows their contents
 * (notably long, multi-line `<path d="...">` data, which would otherwise be
 * re-wrapped differently on each run and break idempotency). The original
 * SVG is restored verbatim afterwards and wrapped in `{% preserve %}`.
 */
const preserveSvgElements = (input: string): string => {
  return input.replace(SVG_ELEMENT_REGEX, (match) => {
    const token = Token.svgBlock(tokenIndex++);
    tokenMap.set(token, match);
    return token;
  });
};

const isInsidePreserveBlock = (fullText: string, matchOffset: number) => {
  const before = fullText.slice(0, matchOffset);
  const lastPreserve = before.lastIndexOf("{% preserve");
  const lastEndPreserve = before.lastIndexOf("{% endpreserve");
  return lastPreserve !== -1 && lastPreserve > lastEndPreserve;
};

const wrapSvgWithPreserve = (input: string): string => {
  return input.replace(
    SVG_ELEMENT_WITH_LEADING_WHITESPACE_REGEX,
    (match, offset, fullText) => {
      if (isInsidePreserveBlock(fullText, offset)) {
        return match;
      }
      return `{% preserve %}${match}{% endpreserve %}`;
    },
  );
};

const tokenMap: Map<string, string> = new Map();
let tokenIndex = 0;

const lookupDuplicateNestedToken = (match) => {
  const tokens = tokenMap.entries();
  for (const token of tokens) {
    if (token[1] === match && token[0].startsWith("npe")) {
      return token[0];
    }
  }
};

const withLead = (regex: RegExp) =>
  new RegExp(/(:\s*)?/.source + `(${regex.source})`, "gms");

const tokenize = (input: string): string => {
  const COMMENT_REGEX = /{#.*?#}/gms;
  const HUBL_TAG_REGEX = /({%.+?%})/gs;
  const LINE_BREAK_REGEX = /[\r\n]+/gm;
  const VARIABLE_REGEX = /({{.+?}})/gs;
  const HTML_TAG_WITH_HUBL_TAG_REGEX = /<[^>]*?(?={%|{{).*?>/gms;
  const STYLE_BLOCK_WITH_HUBL_REGEX = /<style.[^>]*?(?={%|{{).*?style>/gms;
  const SCRIPT_BLOCK_WITH_HUBL_REGEX = /<script.[^>]*?(?={%|{{).*?script>/gms;
  const JSON_BLOCK_REGEX =
    /(?<={% widget_attribute.*is_json="?true"? %}|{% module_attribute.*is_json="?true"? %}).*?(?={%.*?end_module_attribute.*?%}|{%.*?end_widget_attribute.*?%})/gims;

  const HUBL_TAG_REGEX_WITH_LEAD = withLead(HUBL_TAG_REGEX);
  const COMMENT_REGEX_WITH_LEAD = withLead(COMMENT_REGEX);
  const VARIABLE_REGEX_WITH_LEAD = withLead(VARIABLE_REGEX);
  // Replace tags in style block
  const nestedStyleTags = input.match(STYLE_BLOCK_WITH_HUBL_REGEX);
  if (nestedStyleTags) {
    nestedStyleTags.forEach((tag) => {
      const processMatch = (_all, lead: string, match: string) => {
        // Match the lead (the ":  ") so that we can distinguish between a value and a block
        const token = lead
          ? Token.styleValue(tokenIndex++)
          : Token.styleBlock(tokenIndex++);
        tokenMap.set(token, match);
        return `${lead || ""}${token}`;
      };

      const newString = tag
        .replace(HUBL_TAG_REGEX_WITH_LEAD, processMatch)
        .replace(COMMENT_REGEX_WITH_LEAD, processMatch)
        .replace(VARIABLE_REGEX_WITH_LEAD, processMatch);
      input = input.replace(tag, newString);
    });
  }

  // Replace tags in script block
  const nestedScriptTags = input.match(SCRIPT_BLOCK_WITH_HUBL_REGEX);
  if (nestedScriptTags) {
    nestedScriptTags.forEach((tag) => {
      const processMatch = (match: string) => {
        const token = Token.nestedScript(tokenIndex++);
        tokenMap.set(token, match);
        return token;
      };
      const newString = tag
        .replace(HUBL_TAG_REGEX, processMatch)
        .replace(VARIABLE_REGEX, processMatch)
        .replace(COMMENT_REGEX, processMatch);
      input = input.replace(tag, newString);
    });
  }

  // Replace expressions inside of HTML tags first
  const nestedHtmlTags = input.match(HTML_TAG_WITH_HUBL_TAG_REGEX);
  if (nestedHtmlTags) {
    nestedHtmlTags.forEach((tag) => {
      const processMatch = (match: string) => {
        const token = Token.npe(tokenIndex++);
        tokenMap.set(token, match);
        return token;
      };

      const newString = tag
        .replace(HUBL_TAG_REGEX, processMatch)
        .replace(VARIABLE_REGEX, (match) => {
          // Variables are sometimes used as HTML tag names
          const maybeDuplicateTkn = lookupDuplicateNestedToken(match);
          return maybeDuplicateTkn ? maybeDuplicateTkn : processMatch(match);
        });
      input = input.replace(tag, newString);
    });
  }

  const comments = input.match(COMMENT_REGEX);
  if (comments) {
    comments.forEach((comment) => {
      const token = Token.comment(tokenIndex++);
      tokenMap.set(token, comment);
      input = input.replace(comment, token);
    });
  }

  const jsonBlocks = input.match(JSON_BLOCK_REGEX);
  if (jsonBlocks) {
    jsonBlocks.forEach((match) => {
      const placeholderToken = Token.placeholder(tokenIndex++);
      const jsonBlock = Token.jsonBlock(match);
      tokenMap.set(placeholderToken, jsonBlock);
      input = input.replace(match, placeholderToken);
    });
  }

  const matches = input.match(HUBL_TAG_REGEX);
  if (matches) {
    matches.forEach((match) => {
      const placeholderToken = Token.placeholder(tokenIndex++);
      tokenMap.set(placeholderToken, match.replace(LINE_BREAK_REGEX, " "));
      input = input.replace(match, placeholderToken);
    });
  }

  const expressionMatches = input.match(VARIABLE_REGEX);
  if (expressionMatches) {
    expressionMatches.forEach((match) => {
      const placeholderToken = Token.placeholder(tokenIndex++);
      tokenMap.set(placeholderToken, match);
      input = input.replace(match, placeholderToken);
    });
  }

  input = preserveSvgElements(input);

  tokenIndex = 0;
  return input;
};

const unTokenize = (input: string) => {
  tokenMap.forEach((value, key) => {
    input = input.replaceAll(key, value);
  });
  tokenMap.clear();
  return input;
};

const preserveFormatting = (input: string) => {
  const BEGIN_PRE_REGEX = /<pre.*?>/gms;
  const END_PRE_REGEX = /(?<!{% end_preserve %})<\/pre>/gms;

  return input
    .replace(BEGIN_PRE_REGEX, (match) => `${match}{% preserve %}`)
    .replace(END_PRE_REGEX, (match) => `{% endpreserve %}${match}`);
};

const parsers: Plugin["parsers"] = {
  hubl: {
    astFormat: "hubl-ast",
    parse,
    preprocess: (text: string) => {
      let updatedText: string = text.trim();
      // Swap HubL tags for placeholders
      updatedText = tokenize(updatedText);
      // Parse and format HTML
      updatedText = synchronizedPrettier.format(updatedText, {
        parser: "html",
        trailingComma: "es5",
      });
      updatedText = unTokenize(updatedText);
      updatedText = wrapSvgWithPreserve(updatedText);
      // Find <pre> tags and add {% preserve %} wrapper
      // to tell the HubL parser to preserve formatting
      return preserveFormatting(updatedText);
    },
    locStart,
    locEnd,
  },
};

const options = {};
const defaultOptions = {};

export { languages, printers, parsers, options, defaultOptions };
