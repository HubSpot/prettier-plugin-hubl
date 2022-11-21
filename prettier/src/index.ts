import { format } from "prettier";
import { parse } from "../../parser/dist/index";
import printers from "./printHubl";
import { tokenize, untokenize } from "./utils/tokenize";

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
      return untokenize(updatedText);
    },
  },
};

const options = {};

const defaultOptions = {};

export { languages, printers, parsers, options, defaultOptions };
