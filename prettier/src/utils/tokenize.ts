const tokenPlaceholderMap = new Map();
let tokenIndex = 0;

const getTokenByValue = (match, type) => {
  let tokens = tokenPlaceholderMap.entries();
  for (let token of tokens) {
    if (token[1].type === type && token[1].token === match) {
      return token[0];
    }
  }
};

export const tokenize = (input) => {
  const HUBL_COMMENT_REGEX = /{#.*?#}/gms;
  const HUBL_TAG_REGEX = /({%.+?%})/gs;
  const LINE_BREAK_REGEX = /[\r\n]+/gm;
  const HUBL_VARIABLE_REGEX = /({{.+?}})/gs;
  const HTML_TAG_WITH_HUBL_TAG_REGEX = /<[^>]*?(?={%|{{).*?>/gms;
  const STYLE_BLOCK_WITH_HUBL_REGEX = /<style.[^>]*?(?={%|{{).*?style>/gms;
  const JSON_BLOCK_REGEX =
    /(?<={% widget_attribute.*is_json="?true"? %}|{% module_attribute.*is_json="?true"? %}).*?(?={%.*?end_module_attribute.*?%}|{%.*?end_widget_attribute.*?%})/gims;

  const TOKEN_TYPES = {
    nestedHTML: "nestedHTML",
    nestedStyleTag: "nestedStyleTag",
    jsonBlock: "jsonBlock",
    hublComment: "hublComment",
    hublTag: "hublTag",
    hublVariable: "hublVariable",
  };

  const tokenTypes = {
    nestedHTML: {
      placeholder: "npe$t_",
    },
    nestedStyleTag: {
      placeholder: "/*styleblock$t*/",
    },
    jsonBlock: {
      placeholder: "<!--placeholder-$t-->",
      tokenReplacer: (match) => {
        return `{% json_block %}${match}{% end_json_block %}`;
      },
    },
    hublComment: { placeholder: "<!--$t-->" },
    hublTag: {
      placeholder: "<!--placeholder-$t-->",
      tokenReplacer: (match) => {
        return match.replace(LINE_BREAK_REGEX, " ");
      },
    },
    hublVariable: {
      placeholder: "<!--placeholder-$t-->",
    },
  };

  const createToken = (sourceString, re, type) => {
    const { tokenReplacer, placeholder } = tokenTypes[type];

    return sourceString.replace(re, (token) => {
      const existingToken = getTokenByValue(token, type);
      if (existingToken) {
        return existingToken;
      }

      tokenIndex++;
      const placeholderKey = placeholder.replace("$t", tokenIndex);
      const tokenValue = {
        token: !!tokenReplacer ? tokenReplacer(token) : token,
        type,
      };

      tokenPlaceholderMap.set(placeholderKey, tokenValue);

      return placeholderKey;
    });
  };

  // Create placeholders for tokens inside of <style> blocks
  const nestedStyleTags = input.match(STYLE_BLOCK_WITH_HUBL_REGEX);
  if (nestedStyleTags) {
    input.match(STYLE_BLOCK_WITH_HUBL_REGEX).forEach((tag) => {
      let newString = tag;

      newString = createToken(
        newString,
        HUBL_TAG_REGEX,
        TOKEN_TYPES.nestedStyleTag
      );
      newString = createToken(
        newString,
        HUBL_VARIABLE_REGEX,
        TOKEN_TYPES.nestedStyleTag
      );
      newString = createToken(
        newString,
        HUBL_COMMENT_REGEX,
        TOKEN_TYPES.nestedStyleTag
      );

      input = input.replace(tag, newString);
    });
  }

  // Create placeholders for tokens within an html tag
  const nestedHtmlTags = input.match(HTML_TAG_WITH_HUBL_TAG_REGEX);
  if (nestedHtmlTags) {
    nestedHtmlTags.forEach((tag) => {
      let newString = tag;

      newString = createToken(
        newString,
        HUBL_TAG_REGEX,
        TOKEN_TYPES.nestedHTML
      );
      newString = createToken(
        newString,
        HUBL_VARIABLE_REGEX,
        TOKEN_TYPES.nestedHTML
      );

      input = input.replace(tag, newString);
    });
  }

  input = createToken(input, HUBL_COMMENT_REGEX, TOKEN_TYPES.hublComment);
  input = createToken(input, JSON_BLOCK_REGEX, TOKEN_TYPES.jsonBlock);
  input = createToken(input, HUBL_TAG_REGEX, TOKEN_TYPES.hublTag);
  input = createToken(input, HUBL_VARIABLE_REGEX, TOKEN_TYPES.hublVariable);

  // Reset index for next document
  tokenIndex = 0;
  return input;
};
export const untokenize = (input) => {
  tokenPlaceholderMap.forEach(({ token: value }, key) => {
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

  // Clear this before the next document
  tokenPlaceholderMap.clear();
  return input;
};
