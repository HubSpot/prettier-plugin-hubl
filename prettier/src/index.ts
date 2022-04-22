import { format } from "prettier";
import { parse } from "../../parser/dist/index";
import printers from "./printHubl";

const languages = [
  {
    name: "HubL",
    parsers: ["hubl"],
    extensions: [".hubl.html"],
  },
];

function locStart(node) {
  return node.colno;
}

function locEnd(node) {
  return node.colno;
}

let tokenMap = new Map();
let tokenIndex = 0;

const getToken = (match) => {
  let tokens = tokenMap.entries();
  for (let token of tokens) {
    if (token[1] === match) {
      return token[0];
    }
  }
};

const tokenize = (input) => {
  const COMMENT_REGEX = /{#.*?#}/gms;
  const HUBL_TAG_REGEX = /({%.+?%})/gs;
  const LINE_BREAK_REGEX = /[\r\n]+/gm;
  const VARIABLE_REGEX = /({{.+?}})/gs;
  const HTML_TAG_WITH_HUBL_TAG_REGEX = /<[^>]*?(?={%|{{).*?>/gms;
  const STYLE_BLOCK_WITH_HUBL_REGEX = /<style.[^>]*?(?={%|{{).*?style>/gms;

  // Replace tags in style block
  const nestedStyleTags = input.match(STYLE_BLOCK_WITH_HUBL_REGEX);
  if (nestedStyleTags) {
    nestedStyleTags.forEach((tag) => {
      let newString;
      newString = tag.replace(HUBL_TAG_REGEX, (match) => {
        tokenIndex++;
        tokenMap.set(`/*styleblock${tokenIndex}*/`, match);
        return `/*styleblock${tokenIndex}*/`;
      });
      newString = newString.replace(VARIABLE_REGEX, (match) => {
        tokenIndex++;
        tokenMap.set(`/*styleblock${tokenIndex}*/`, match);
        return `/*styleblock${tokenIndex}*/`;
      });
      newString = newString.replace(COMMENT_REGEX, (match) => {
        tokenIndex++;
        tokenMap.set(`/*styleblock${tokenIndex}*/`, match);
        return `/*styleblock${tokenIndex}*/`;
      });
      input = input.replace(tag, newString);
    });
  }

  // Replace expressions inside of HTML tags first
  const nestedHtmlTags = input.match(HTML_TAG_WITH_HUBL_TAG_REGEX);
  if (nestedHtmlTags) {
    nestedHtmlTags.forEach((tag) => {
      let newString;
      newString = tag.replace(HUBL_TAG_REGEX, (match) => {
        tokenIndex++;
        tokenMap.set(`npe${tokenIndex}_`, match);
        return `npe${tokenIndex}_`;
      });
      newString = newString.replace(VARIABLE_REGEX, (match) => {
        // Variables are sometimes used as HTML tag names
        const token = getToken(match);
        if (token) {
          return token;
        }

        tokenIndex++;
        tokenMap.set(`npe${tokenIndex}_`, match);
        return `npe${tokenIndex}_`;
      });
      input = input.replace(tag, newString);
    });
  }

  const comments = input.match(COMMENT_REGEX);
  if (comments) {
    comments.forEach((comment) => {
      tokenIndex++;
      tokenMap.set(`<!--${tokenIndex}-->`, comment);
      input = input.replace(comment, `<!--${tokenIndex}-->`);
    });
  }

  const matches = input.match(HUBL_TAG_REGEX);
  if (matches) {
    matches.forEach((match) => {
      tokenIndex++;
      tokenMap.set(
        `<!--placeholder-${tokenIndex}-->`,
        match.replace(LINE_BREAK_REGEX, " ")
      );
      input = input.replace(match, `<!--placeholder-${tokenIndex}-->`);
    });
  }

  const expressionMatches = input.match(VARIABLE_REGEX);
  if (expressionMatches) {
    expressionMatches.forEach((match) => {
      tokenIndex++;
      tokenMap.set(`<!--placeholder-${tokenIndex}-->`, match);
      input = input.replace(match, `<!--placeholder-${tokenIndex}-->`);
    });
  }
  tokenIndex = 0;
  return input;
};
const unTokenize = (input) => {
  tokenMap.forEach((value, key) => {
    // HTML formatter sometimes adds a space after the placeholder comment so we check for it and remove if it exists
    if (key.startsWith("/*styleblock")) {
      const STYLEBLOCK_WITH_SPACE_PATTERN = `${key.replace(
        /[-\/\\^$*+?.()|[\]{}]/g,
        "\\$&"
      )}\\s;`;
      const STYLEBLOCK_REGEX = new RegExp(STYLEBLOCK_WITH_SPACE_PATTERN, "gm");
      if (STYLEBLOCK_REGEX.test(input)) {
        input = input.replace(key + " ;", value + ";");
        return;
      }
    }
    input = input.replaceAll(key, value);
  });
  const COMMENT_START_REGEX = /{#/gm;
  const COMMENT_END_REGEX = /#}/gm;
  input = input.replace(COMMENT_START_REGEX, "{% comment %}<!--");
  input = input.replace(COMMENT_END_REGEX, "-->{% end_comment %}");
  return input;
};

const parsers = {
  hubl: {
    astFormat: "hubl-ast",
    parse,
    locStart,
    locEnd,
    preprocess: (text) => {
      let updatedText = text.trim();

      // Nunjucks will strip comments, so this is a hack to keep them and the
      // printer will transform them back to comments

      updatedText = tokenize(updatedText);
      // Parse and format HTML first
      const formattedText = format(updatedText, { parser: "html" });
      return unTokenize(formattedText);
    },
  },
};

const options = {};

const defaultOptions = {};

export { languages, printers, parsers, options, defaultOptions };
