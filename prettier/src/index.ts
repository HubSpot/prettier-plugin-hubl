import { format } from "prettier";
import { parse } from "../../parser/dist/index";
import printers from "./printHubl";

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
  const JSON_BLOCK_REGEX =
    /(?<={% widget_attribute.*is_json="?true"? %}|{% module_attribute.*is_json="?true"? %}).*?(?={%.*?end_module_attribute.*?%}|{%.*?end_widget_attribute.*?%})/gims;

  const createToken = (sourceString, re, placeholder, fn?) => {
    return sourceString.replace(re, (match) => {
      const token = getToken(match);
      if (token) {
        return token;
      }

      tokenIndex++;
      const newPlaceholder = placeholder.replace("$t", tokenIndex);
      if (fn) {
        tokenMap.set(newPlaceholder, fn(match));
      } else {
        tokenMap.set(newPlaceholder, match);
      }

      return newPlaceholder;
    });
  };

  // Replace tags in style block
  const nestedStyleTags = input.match(STYLE_BLOCK_WITH_HUBL_REGEX);
  if (nestedStyleTags) {
    nestedStyleTags.forEach((tag) => {
      let newString = tag;

      newString = createToken(newString, HUBL_TAG_REGEX, "/*styleblock$t*/");
      newString = createToken(newString, VARIABLE_REGEX, "/*styleblock$t*/");
      newString = createToken(newString, COMMENT_REGEX, "/*styleblock$t*/");

      input = input.replace(tag, newString);
    });
  }

  // Replace expressions inside of HTML tags first
  const nestedHtmlTags = input.match(HTML_TAG_WITH_HUBL_TAG_REGEX);
  if (nestedHtmlTags) {
    nestedHtmlTags.forEach((tag) => {
      let newString = tag;

      newString = createToken(newString, HUBL_TAG_REGEX, "npe$t_");
      newString = createToken(newString, VARIABLE_REGEX, "npe$t_");

      input = input.replace(tag, newString);
    });
  }

  input = createToken(input, COMMENT_REGEX, `<!--$t-->`);

  input = createToken(
    input,
    JSON_BLOCK_REGEX,
    `<!--placeholder-$t-->`,
    (match) => {
      return `{% json_block %}${match}{% end_json_block %}`;
    }
  );

  // input = createToken(
  //   input,
  //   HUBL_TAG_REGEX,
  //   `<!--placeholder-$t-->`,
  //   (match) => {
  //     return match.replace(LINE_BREAK_REGEX, " ");
  //   }
  // );

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
    // Placeholders in styleblocks need special treatment
    if (key.startsWith("/*styleblock")) {
      // The CSS comment needs to be escaped
      const escapedKey = key.replace(/\//g, "\\/").replace(/\*/g, "\\*");
      const STYLEBLOCK_REGEX = new RegExp(
        `${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s;`,
        "gm"
      );
      // HTML formatter sometimes adds a space after the placeholder comment so we check for it and remove if it exists
      if (STYLEBLOCK_REGEX.test(input)) {
        input = input.replace(new RegExp(escapedKey + " ;", "g"), value + ";");
        return;
      } else {
        input = input.replace(new RegExp(escapedKey, "g"), value);
        return;
      }
    }
    input = input.replace(new RegExp(key, "g"), value);
  });
  tokenMap.clear();

  return input;
};

const preserveFormatting = (input) => {
  const BEGIN_PRE_REGEX = /<pre.*?>/gms;
  const END_PRE_REGEX = /(?<!{% end_preserve %})<\/pre>/gms;

  input = input.replace(BEGIN_PRE_REGEX, (match) => {
    return `${match}{% preserve %}`;
  });
  input = input.replace(END_PRE_REGEX, (match) => {
    return `{% endpreserve %}${match}`;
  });

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
      // Swap HubL tags for placeholders
      updatedText = tokenize(updatedText);
      // Parse and format HTML
      updatedText = format(updatedText, { parser: "html" });
      // Find <pre> tags and add {% preserve %} wrapper
      // to tell the HubL parser to preserve formatting
      updatedText = preserveFormatting(updatedText);
      // Swap back HubL tags and return
      return unTokenize(updatedText);
    },
  },
};

const options = {};

const defaultOptions = {};

export { languages, printers, parsers, options, defaultOptions };
