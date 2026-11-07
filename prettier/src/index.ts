import type { Plugin } from "prettier";
import synchronizedPrettier from "@prettier/sync";
import { parse as hublParse } from "hubl-parser";
import type { HublParserOptions } from "hubl-parser";
import { findConditionalPreserveRanges } from "./conditionalHtmlPreservation.js";
import printers from "./printHubl.js";

interface PrettierHublOptions {
  hublCustomTags?: string[];
}

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
  npe: (index: number) => `npe${index}_`,
  comment: (index: number) => `<!--${index}-->`,
  placeholder: (index: number) => `<!--placeholder-${index}-->`,
  svgBlock: (index: number) => `<!--svgblock-${index}-->`,
  scriptBlock: (index: number) => `<!--scriptblock-${index}-->`,
  conditionalBlock: (index: number) => `<!--conditionalblock-${index}-->`,
  jsonBlock: (match: string) => `{% json_block %}${match}{% end_json_block %}`,
};

// NOTE: nested `<svg>` elements (an `<svg>` inside another `<svg>`) are not
// supported. This regex is lazy, so it matches from the outer `<svg` to the
// *first* `</svg>` it finds (the inner one), leaving the outer closing tag
// dangling and causing the HTML formatting pass to throw. This is assumed to
// be a rare enough pattern in practice; a correct fix would need to track
// nesting depth instead of a single regex.
const SVG_ELEMENT_REGEX = /<svg\b[\s\S]*?<\/svg>/gim;
// Same as SVG_ELEMENT_REGEX, but also captures the whitespace on the opening
// `<svg>` tag's own line. Only used post-HTML-format (see wrapSvgWithPreserve)
// so the correctly-computed nesting indent (e.g. one level inside a parent
// <div>) is folded into the Preserve node's value instead of being lost.
const SVG_ELEMENT_WITH_LEADING_WHITESPACE_REGEX =
  /[ \t]*<svg\b[\s\S]*?<\/svg>/gim;

const SCRIPT_BLOCK_WITH_HUBL_REGEX =
  /(?<!['"])<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:{%|{{)[\s\S]*?<\/script>/gim;

const SCRIPT_BLOCK_WITH_LEADING_WHITESPACE_REGEX =
  /[ \t]*<script\b[^>]*>[\s\S]*?<\/script>/gim;

/**
 * Replaces entire `<script>...</script>` blocks that contain HubL with a
 * placeholder before the HTML formatting pass. Without this, Prettier's HTML
 * formatter re-indents JSON-LD around embedded `{% if %}` tags on every run,
 * producing non-idempotent output.
 */
const preserveScriptBlocksWithHubL = (input: string): string => {
  return input.replace(
    SCRIPT_BLOCK_WITH_HUBL_REGEX,
    (match, offset, fullText) => {
      if (isInsidePreserveBlock(fullText, offset)) {
        return match;
      }
      const token = Token.scriptBlock(tokenIndex++);
      tokenMap.set(token, match);
      return token;
    },
  );
};

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

/**
 * True when `matchOffset` falls inside a quoted string literal within an
 * unclosed `{% ... %}` HubL tag (e.g. module attribute values). SVG markup
 * there must not be wrapped in `{% preserve %}` — it is not real HTML.
 */
const isInsideHubLTagStringLiteral = (
  fullText: string,
  matchOffset: number,
): boolean => {
  const before = fullText.slice(0, matchOffset);
  const lastOpen = before.lastIndexOf("{%");
  const lastClose = before.lastIndexOf("%}");

  if (lastOpen === -1 || lastClose > lastOpen) {
    return false;
  }

  const tagContent = before.slice(lastOpen);
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 2; index < tagContent.length; index++) {
    const character = tagContent[index];
    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (character === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }
  }

  return inSingleQuote || inDoubleQuote;
};

const wrapSvgWithPreserve = (input: string): string => {
  return input.replace(
    SVG_ELEMENT_WITH_LEADING_WHITESPACE_REGEX,
    (match, offset, fullText) => {
      if (isInsidePreserveBlock(fullText, offset)) {
        return match;
      }
      if (isInsideHubLTagStringLiteral(fullText, offset)) {
        return match;
      }
      return `{% preserve %}${match}{% endpreserve %}`;
    },
  );
};

const wrapScriptBlocksWithPreserve = (input: string): string => {
  return input.replace(
    SCRIPT_BLOCK_WITH_LEADING_WHITESPACE_REGEX,
    (match, offset, fullText) => {
      if (!match.includes("{%") && !match.includes("{{")) {
        return match;
      }
      if (isInsidePreserveBlock(fullText, offset)) {
        return match;
      }
      if (isInsideHubLTagStringLiteral(fullText, offset)) {
        return match;
      }
      return `{% preserve %}${match}{% endpreserve %}`;
    },
  );
};

const tokenMap: Map<string, string> = new Map();
const conditionalBlockTokens: Set<string> = new Set();
const perLinePreserveTokens: Set<string> = new Set();
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

const applyConditionalPreserveTokens = (input: string): string => {
  const preserveRanges = findConditionalPreserveRanges(input, (offset) =>
    isInsidePreserveBlock(input, offset),
  ).sort((left, right) => right.start - left.start);

  let output = input;
  for (const range of preserveRanges) {
    const segment = output.slice(range.start, range.end);
    const token = Token.conditionalBlock(tokenIndex++);
    tokenMap.set(token, segment);
    conditionalBlockTokens.add(token);
    output = output.slice(0, range.start) + token + output.slice(range.end);
  }

  return output;
};

/**
 * Scans `input` character by character for `{%...%}` HubL block tags,
 * correctly tracking single- and double-quote string literal state so that
 * a `%}` sequence inside a string (e.g. `split('{% raw %}')`) is never
 * mistaken for the tag's closing delimiter. Each found tag is replaced with a
 * placeholder token and stored in `tokenMap`.
 */
const tokenizeHublBlockTags = (input: string): string => {
  let result = "";
  let i = 0;

  while (i < input.length) {
    if (input[i] === "{" && input[i + 1] === "%") {
      const tagStart = i;
      i += 2;

      let inSingleQuote = false;
      let inDoubleQuote = false;
      let foundEnd = false;

      while (i < input.length) {
        const char = input[i];

        if (char === "\\" && (inSingleQuote || inDoubleQuote)) {
          i += 2;
          continue;
        }

        if (char === "'" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
          i++;
          continue;
        }

        if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
          i++;
          continue;
        }

        if (
          !inSingleQuote &&
          !inDoubleQuote &&
          char === "%" &&
          input[i + 1] === "}"
        ) {
          i += 2;
          const tag = input.slice(tagStart, i);
          const token = Token.placeholder(tokenIndex++);
          // Store the tag verbatim.  Collapsing its newlines here is invisible
          // while the HubL printer reformats the tag, but a tag inside a region
          // that later gets `{% preserve %}`-wrapped is emitted as-is — so the
          // collapsed form would be frozen into the output on one pass and
          // differ from the source on the next.
          tokenMap.set(token, tag);
          result += token;
          foundEnd = true;
          break;
        }

        i++;
      }

      if (!foundEnd) {
        result += input.slice(tagStart, i);
      }
    } else {
      result += input[i];
      i++;
    }
  }

  return result;
};

const tokenize = (input: string): string => {
  // Token keys must stay unique for the whole preprocess pass, so the counter
  // is reset on entry and never on exit: `protectMultiLineTagsWithHublPlaceholders`
  // keeps minting `<!--conditionalblock-N-->` keys after `tokenize()` finishes,
  // and restarting the numbering would collide with keys already in `tokenMap`.
  // `tokenMap.set` overwrites silently, so a collision makes both occurrences
  // expand to the same value and drops markup from the output.
  tokenIndex = 0;
  input = applyConditionalPreserveTokens(input);
  input = preserveScriptBlocksWithHubL(input);

  const COMMENT_REGEX = /{#.*?#}/gms;
  const HUBL_TAG_REGEX = /({%.+?%})/gs;
  const LINE_BREAK_REGEX = /[\r\n]+/gm;
  const VARIABLE_REGEX = /({{.+?}})/gs;
  // Matches an HTML opening tag that contains at least one HubL expression.
  // The alternation after the lookahead correctly skips `>` characters that
  // appear inside `{%...%}` or `{{...}}` blocks (e.g. `'>']` in a condition),
  // so the regex captures the complete tag rather than stopping early.
  // The `(?<!['"])` negative lookbehind before `<` prevents matching a `<`
  // that is preceded by a quote, which would be inside a HubL string literal
  // (e.g. `str|split('<img')` or `str|split("<img")`). Without it, the regex
  // mistakes the string-literal `<` for an HTML tag opener, consuming all
  // subsequent HubL blocks until the next literal `>` and tokenising them as
  // `npe` tokens instead of `placeholder` tokens. The positive lookahead
  // `(?=[a-zA-Z/!{])` further restricts matching to real HTML tag names (and
  // HubL-as-tag-name patterns like `<{{ expr }}>` and `<{% tag %}>`) while
  // excluding operators like `<=`.
  // Each alternative consumes one whole unit — a quoted attribute value, a
  // HubL block, a HubL expression, or a single ordinary character — so the
  // first `>` that is not inside one of those units ends the match.  Every
  // alternative must stay a complete unit: an alternation that lets `{{ … }}`
  // span newlines can backtrack over the tag's own `>` and run on to a `>`
  // much later in the file.  Over-matching also breaks idempotency, because
  // HubL inside a matched tag becomes a short `npe\d+_` token while HubL
  // outside it becomes a 22-character `<!--placeholder-N-->`, and the HTML
  // formatter measures those widths when choosing where to wrap.
  const HTML_TAG_WITH_HUBL_TAG_REGEX =
    /(?<!['"])<(?=[a-zA-Z/!{])(?:"[^"]*"|'[^']*'|{%[\s\S]*?%}|{{[\s\S]*?}}|[^>"'])*>/gms;
  const STYLE_BLOCK_WITH_HUBL_REGEX = /<style.[^>]*?(?={%|{{).*?style>/gms;
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

  // Replace expressions inside of HTML tags first.
  //
  // The regex matches every tag, so keep only those that actually contain
  // HubL, and drop any match that spans more than one tag.  A tag whose
  // closing `>` is supplied by a HubL variable (`<h2{% if c %} {% endif %}{{ v }}`)
  // has no `>` of its own, so the scan continues to an unrelated `>` further
  // down.  Those are left for the line-folding pass below, which handles them
  // without pulling neighbouring elements into the token.
  const containsAnotherTag = (tag: string): boolean =>
    tag
      .replace(/{%[\s\S]*?%}/g, "")
      .replace(/{{[\s\S]*?}}/g, "")
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .slice(1)
      .includes("<");

  const nestedHtmlTags = input
    .match(HTML_TAG_WITH_HUBL_TAG_REGEX)
    ?.filter((tag) => /{%|{{/.test(tag) && !containsAnotherTag(tag));
  if (nestedHtmlTags) {
    nestedHtmlTags.forEach((tag) => {
      /**
       * Returns true when the character at `offset` in `tagStr` is immediately
       * after the HTML element name (i.e. every character between the preceding
       * `<` and `offset` is a valid tag-name character). In that case the npe
       * token must be prefixed with a space so the HTML parser does not merge
       * the token into the element name (e.g. `<mainnpe0_>` → `<main npe0_>`).
       */
      const isImmediatelyAfterTagName = (
        tagStr: string,
        offset: number,
      ): boolean => {
        let pos = offset - 1;
        while (pos >= 0 && /[a-zA-Z\d-]/.test(tagStr[pos])) {
          pos--;
        }
        return pos >= 0 && tagStr[pos] === "<";
      };

      const processMatch = (match: string, ...args: unknown[]) => {
        const token = Token.npe(tokenIndex++);
        tokenMap.set(token, match);
        const offset = args[args.length - 2] as number | undefined;
        if (offset !== undefined && isImmediatelyAfterTagName(tag, offset)) {
          return ` ${token}`;
        }
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

  input = tokenizeHublBlockTags(input);

  const expressionMatches = input.match(VARIABLE_REGEX);
  if (expressionMatches) {
    expressionMatches.forEach((match) => {
      const placeholderToken = Token.placeholder(tokenIndex++);
      tokenMap.set(placeholderToken, match);
      input = input.replace(match, placeholderToken);
    });
  }

  input = preserveSvgElements(input);

  // Ensure tokens that ended up immediately after an HTML tag name are
  // separated from it by a space. This can happen when the HubL expression
  // inside a tag attribute contains a literal `>` character (e.g.
  // `<h2{% if x not in [' ', '>'] %}`), which causes the HTML-tag regex to
  // stop early and fall through to the later HUBL_TAG_REGEX pass that emits
  // HTML-comment-style tokens (`<!--placeholder-N-->`). Without the space,
  // parse5 sees `<h2<!--placeholder-N-->` as an unterminated opening tag.
  input = input.replace(
    /(<[a-zA-Z][a-zA-Z0-9-]*)(npe\d+_|<!--[a-z-]*\d+-->)/g,
    "$1 $2",
  );

  // Fold lines that look like `<tagname ... token` (no literal `>`) into a
  // single NPE token. These patterns arise when a HubL variable supplies the
  // closing `>` of an HTML tag, e.g.:
  //   `<h2{% if cond %} {% endif %}{{ segment }}`
  //   `<h2 id="section-{{ loop.index }}"{% if cond %} {% endif %}{{ segment }}`
  // After the earlier tokenisation passes these become lines starting with `<h2`
  // that contain NPE/placeholder tokens but have no literal `>`. parse5 would
  // see an unclosed `<h2` start tag and fail. By collapsing the whole line into
  // an NPE token we present parse5 with safe inline content and avoid the
  // HTML-formatting catch-block fallback for the entire file.
  // The pattern allows arbitrary non-`>`, non-newline characters (e.g. regular
  // HTML attribute text like `id="..."`) mixed with NPE/placeholder tokens, as
  // long as the line ends with a token (confirming the `>` is elsewhere) and
  // contains no literal closing `>`.
  input = input.replace(
    /^([ \t]*)(<[a-zA-Z][a-zA-Z0-9-]*(?:[^>\n]|npe\d+_|<!--[a-z-]*\d+-->)*(?:npe\d+_|<!--[a-z-]*\d+-->))$/gm,
    (_match, leadingWhitespace, tagContent) => {
      const npeToken = Token.npe(tokenIndex++);
      tokenMap.set(npeToken, tagContent.trimEnd());
      return leadingWhitespace + npeToken;
    },
  );

  // Fold complete single-line tags where the tag name itself is an NPE token
  // (e.g. `< npeJ_ class="npeC_">` from `<{{ tag }} class="{{ className }}">`).
  // `isImmediatelyAfterTagName` adds a space before the first npe token, making
  // the `<` followed by a non-letter.  Parse5 rejects `< ` as a tag opener and
  // treats the entire line as text, so the element's content is never assigned
  // as a DOM child — leading to growing indentation on each formatting pass.
  // Collapsing the whole tag into a single opaque NPE token makes it a stable
  // text node that the HTML formatter normalises to a consistent indentation.
  input = input.replace(
    /^([ \t]*)(<[ \t]+(npe\d+_|<!--[a-z-]*\d+-->)[^>\n]*>)$/gm,
    (_match, leadingWhitespace, tagContent) => {
      const npeToken = Token.npe(tokenIndex++);
      tokenMap.set(npeToken, tagContent.trimEnd());
      return leadingWhitespace + npeToken;
    },
  );

  return input;
};

/**
 * Scans for multi-line HTML tag openings that contain HubL placeholder tokens
 * (`<!--placeholder-N-->`) between their attributes — either as standalone
 * lines (e.g. `{% if %}` on its own line) or inline alongside attribute content
 * (e.g. `{% if x %}data-attr="..."{% endif %}` all on one line) — and wraps
 * the entire element in a single opaque token so the HTML formatter never sees
 * the HubL-bearing attributes.
 *
 * Without this protection, the HubL placeholders inside a tag opening confuse
 * parse5, which closes the tag early and restructures the DOM.  Every format
 * pass then shifts indentation by 2–4 spaces.
 *
 * Void elements (`<input>`, `<img>`, etc.) are handled specially: only the
 * opening tag itself is wrapped (there is no matching closing tag to find).
 */
/**
 * Joins the lines of a bundled element, removing `indentLen` columns of
 * leading whitespace from every line after the first.
 *
 * The stored value must be *relative*, not absolute. The token it replaces is
 * re-indented by the HTML formatter and the HubL printer on each pass, so a
 * value that hard-codes the original absolute columns would drift: the first
 * line follows the new indentation while the inner lines stay frozen, adding
 * 2 spaces of apparent nesting on every run.
 */
const dedentElementLines = (
  elementLines: string[],
  indentLen: number,
): string => {
  const dedented = elementLines.map((line, index) => {
    if (index === 0) return line;
    let stripped = 0;
    while (
      stripped < indentLen &&
      stripped < line.length &&
      (line[stripped] === " " || line[stripped] === "\t")
    ) {
      stripped++;
    }
    return line.slice(stripped);
  });
  return dedented.join("\n").trim();
};

const protectMultiLineTagsWithHublPlaceholders = (input: string): string => {
  const PLACEHOLDER_TOKEN_RE = /<!--(?:placeholder|comment)-\d+-->|npe\d+_/;
  const PLACEHOLDER_LINE_RE =
    /^[ \t]*(?:<!--(?:placeholder|comment)-\d+-->|npe\d+_)[ \t]*$/;
  const TAG_OPEN_RE = /^([ \t]*)(<([a-zA-Z][a-zA-Z0-9-]*))(?:\s[^>\n]*)?$/;
  const CLOSING_GT_RE = /^[ \t]*\/?>[ \t]*$/;

  const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  /**
   * Returns true when `line` contains a placeholder token that is NOT inside a
   * quoted attribute value.  Strips `"…"` and `'…'` spans first, then tests
   * for the placeholder pattern on the remainder.
   */
  const hasUnquotedPlaceholder = (line: string): boolean => {
    const stripped = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    return PLACEHOLDER_TOKEN_RE.test(stripped);
  };

  const lines = input.split("\n");
  let i = 0;
  const result: string[] = [];

  while (i < lines.length) {
    // ── Case A: standalone NPE token representing an unclosed tag opening ────
    //
    // `tokenize()` folds lines like `<a href="..." {% if %}…{% endif %}` (which
    // end with a placeholder, no literal `>`) into a single `npeK_` token.
    // The continuation lines (`>content</a` and `>`) are left as siblings.
    // Parse5 cannot reconstruct the element from these fragments, so we bundle
    // the NPE token together with its continuation `>…` lines into one opaque
    // conditionalBlock token.
    const NPE_STANDALONE_RE = /^([ \t]*)(npe\d+_)[ \t]*$/;
    const npeStandaloneMatch = lines[i].match(NPE_STANDALONE_RE);
    if (npeStandaloneMatch) {
      const indent = npeStandaloneMatch[1];
      const npeToken = npeStandaloneMatch[2];
      const tokenValue = tokenMap.get(npeToken) ?? "";
      const npeTagMatch = tokenValue.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
      if (npeTagMatch && !tokenValue.includes(">")) {
        // Collect every `>…` line that follows (all are continuations of the same element).
        const elementLines: string[] = [lines[i]];
        let j = i + 1;
        while (j < lines.length && /^[ \t]*\/?>/.test(lines[j])) {
          elementLines.push(lines[j]);
          j++;
        }
        if (elementLines.length > 1) {
          const fullElement = elementLines.join("\n");
          const token = Token.conditionalBlock(tokenIndex++);
          tokenMap.set(token, fullElement.trim());
          conditionalBlockTokens.add(token);
          result.push(indent + token);
          i = j;
          continue;
        }
      }
    }

    // ── Case B: complete opening tag whose tag name is an NPE token ──────────
    //
    // `tokenize()` replaces `{{ tag }}` with `npe0_` *as the tag name*.  The
    // result – `<npe0_ class="npe1_">` – looks like a valid custom element to
    // parse5, so the HTML formatter accepts the opening tag.  But the
    // *closing* tag `</{{ tag }}>` is tokenised differently (the expression
    // inside `</…>` gets a plain `<!--placeholder-N-->` token), producing
    // `></<!--placeholder-10-->` + a bare `>` on the following line.
    // parse5 rejects `</<!--placeholder-10-->` as an invalid closing-tag name,
    // throws, and the catch path preserves the original indentation.  Every
    // subsequent format pass then adds 2 more spaces.
    //
    // So the entire element – from `<npe0_ …>` through the lone `>` that
    // closes `</{{ tag }}>` – is bundled into one opaque conditionalBlock token.
    // The token sits on a single line, gets wrapped in `<template>`, and is
    // normalised to column 0 by the HTML formatter.  Restoring it via
    // `{% preserve %}` makes the HubL printer output it verbatim so the
    // internal relative indentation is preserved.
    const NPE_OPEN_TAG_RE = /^([ \t]*)<(npe\d+_)[\s>]/;
    const npeOpenTagMatch = lines[i].match(NPE_OPEN_TAG_RE);
    if (npeOpenTagMatch && lines[i].includes(">")) {
      const indent = npeOpenTagMatch[1];
      const indentLen = indent.length;
      const elementLines: string[] = [lines[i]];
      let j = i + 1;
      let foundClose = false;

      while (j < lines.length) {
        const candidate = lines[j];
        elementLines.push(candidate);
        const leadingLen = candidate.match(/^([ \t]*)/)?.[1].length ?? 0;
        // A standalone `>` at the same or lesser indentation as the opening
        // closes the outer element (it terminates the split `</{{ tag }}>` line).
        if (/^[ \t]*>[ \t]*$/.test(candidate) && leadingLen <= indentLen) {
          j++;
          foundClose = true;
          break;
        }
        j++;
      }

      if (foundClose && elementLines.length > 1) {
        const token = Token.conditionalBlock(tokenIndex++);
        tokenMap.set(token, dedentElementLines(elementLines, indentLen));
        perLinePreserveTokens.add(token);
        result.push(indent + token);
        i = j;
        continue;
      }
    }

    const tagMatch = lines[i].match(TAG_OPEN_RE);

    if (tagMatch && !lines[i].includes(">")) {
      const indent = tagMatch[1];
      const tagName = tagMatch[3];
      const openingLines: string[] = [lines[i]];
      let j = i + 1;
      let hasPlaceholder = false;
      let tagOpeningClosed = false;
      let isInlineClose = false;

      // Collect lines up to the closing `>` of the opening tag.
      while (j < lines.length) {
        const candidate = lines[j];
        openingLines.push(candidate);

        // A line that starts with `>` (possibly preceded by whitespace) closes
        // the opening tag — e.g. `    >content</span` or `    />`.
        // Anything following that `>` is element content, not an attribute,
        // so we must NOT check it for placeholders as attribute content.
        if (/^[ \t]*\/?>/.test(candidate)) {
          tagOpeningClosed = true;

          // If the content line has a placeholder (e.g. `>{{ content }}</a`),
          // flag it so the element gets protected.
          if (PLACEHOLDER_TOKEN_RE.test(candidate)) {
            hasPlaceholder = true;
          }

          // Detect the inline-close pattern `>content</tagname`.  When present
          // the element ends here (no need to search for a separate `</tag>`).
          // Also collect the optional standalone `>` line that closes `</tag`.
          const INLINE_CLOSE_RE = new RegExp(`</${tagName}\\b`, "i");
          if (INLINE_CLOSE_RE.test(candidate)) {
            isInlineClose = true;
            j++;
            // Collect the closing `>` that terminates the inline `</tagname`
            if (j < lines.length && /^[ \t]*>[ \t]*$/.test(lines[j])) {
              openingLines.push(lines[j]);
              j++;
            }
          } else {
            j++;
          }
          break;
        }

        if (
          PLACEHOLDER_LINE_RE.test(candidate) ||
          hasUnquotedPlaceholder(candidate)
        ) {
          hasPlaceholder = true;
        }

        if (CLOSING_GT_RE.test(candidate)) {
          tagOpeningClosed = true;
          j++;
          break;
        }

        // A new complete HTML opening tag means the original tag closed
        // without a `>` on its own line – stop collecting.
        if (
          /^[ \t]*<[a-zA-Z]/.test(candidate) &&
          candidate.includes(">") &&
          !candidate.trimStart().startsWith("</")
        ) {
          break;
        }

        j++;
      }

      if (tagOpeningClosed && hasPlaceholder) {
        let elementLines: string[];

        if (VOID_ELEMENTS.has(tagName.toLowerCase()) || isInlineClose) {
          // Void elements and inline-close elements are already fully collected
          // in openingLines — no separate closing tag exists.
          elementLines = openingLines;
        } else {
          // Collect the rest of the element's children + the matching
          // `</tagname>`.  Prettier splits a closing tag across two lines when
          // it wraps a long element (`…</span` followed by a lone `>`), so that
          // form has to be recognised as well as `</tagname>` on its own line.
          const splitClosingTagRe = new RegExp(`</${tagName}[ \\t]*$`, "i");
          // Nested elements of the same name must be counted, otherwise the
          // first `</tagname>` encountered is mistaken for the outer element's
          // close.  Bundling would then stop in the middle of an enclosing
          // `{% if %}`, capturing the opening tag but not its `{% endif %}`,
          // which the HubL parser reports as "unknown block tag: endif".
          const tagScanRe = new RegExp(`</?${tagName}\\b`, "gi");
          elementLines = [...openingLines];
          let foundClosingTag = false;
          let depth = 1;

          while (j < lines.length) {
            const line = lines[j];
            elementLines.push(line);

            let closesOuterElement = false;
            tagScanRe.lastIndex = 0;
            let scan: RegExpExecArray | null;
            while ((scan = tagScanRe.exec(line)) !== null) {
              if (scan[0].startsWith("</")) {
                depth--;
                if (depth === 0) {
                  closesOuterElement = true;
                  break;
                }
              } else {
                // `<tagname … />` opens and closes at once, so it adds no depth.
                const rest = line.slice(scan.index);
                const gtOffset = rest.indexOf(">");
                if (!(gtOffset > 0 && rest[gtOffset - 1] === "/")) {
                  depth++;
                }
              }
            }

            if (closesOuterElement) {
              j++;
              // Prettier splits a long closing tag into `</tagname` plus a lone
              // `>` on the next line; consume that continuation too.
              if (
                splitClosingTagRe.test(line) &&
                j < lines.length &&
                /^[ \t]*>[ \t]*$/.test(lines[j])
              ) {
                elementLines.push(lines[j]);
                j++;
              }
              foundClosingTag = true;
              break;
            }
            j++;
          }

          // Bail out rather than bundling an element whose closing tag was
          // never found: the loop above has consumed every remaining line, so
          // creating a token here would swallow unrelated HubL — `{% endif %}`,
          // `{% endcall %}`, whole macros — into one opaque `{% preserve %}`
          // block.  The HubL parser then reports the enclosing `{% if %}` as
          // unterminated ("expected elif, else, or endif, got end of file").
          if (!foundClosingTag) {
            result.push(lines[i]);
            i++;
            continue;
          }
        }

        const fullElement = elementLines.join("\n");
        const token = Token.conditionalBlock(tokenIndex++);
        tokenMap.set(token, fullElement.trim());
        conditionalBlockTokens.add(token);
        result.push(indent + token);
        i = j;
      } else {
        result.push(lines[i]);
        i++;
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join("\n");
};

/**
 * Expands a single token to the text that should replace it, applying the
 * `{% preserve %}` wrapping strategy recorded for that token.
 *
 * `perLinePreserveTokens` wrap each line separately so that the HubL printer
 * emits one Preserve node per line with a hardline between them. Each line
 * then inherits the enclosing block's indentation instead of only the first
 * line moving while the rest stay frozen at their stored columns.
 */
const expandToken = (key: string, value: string): string => {
  if (perLinePreserveTokens.has(key)) {
    return value
      .split("\n")
      .map((line) => `{% preserve %}${line}{% endpreserve %}`)
      .join("\n");
  }
  if (conditionalBlockTokens.has(key)) {
    return `{% preserve %}${value}{% endpreserve %}`;
  }
  return value;
};

const unTokenize = (input: string) => {
  // Container tokens (`<!--conditionalblock-N-->`) hold values that still
  // contain the `npe\d+_` / `<!--placeholder-N-->` tokens captured earlier by
  // `tokenize()`.  Highest index first expands containers before the leaf
  // tokens nested inside them, which holds because token indices increase
  // monotonically across the whole pass.  Repeat until nothing changes so a
  // container revealed by another container is still resolved; without this a
  // raw token such as `npe12_` can survive into the formatted output.
  const entries = Array.from(tokenMap.entries()).reverse();
  // Each pass resolves one more level of container nesting and the loop exits
  // as soon as a pass changes nothing, so real templates finish in one or two.
  // The cap is an arbitrary guard against a pathological chain rather than a
  // measured limit. Raise it if a template ever nests containers more deeply;
  // the symptom is a raw `npe\d+_` or `<!--placeholder-N-->` in the output.
  const MAX_PASSES = 10;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let replacedAny = false;
    for (const [key, value] of entries) {
      if (!input.includes(key)) continue;
      // A value containing its own key would be re-expanded on every pass and
      // grow without bound.
      if (value.includes(key)) continue;
      const restoredValue = expandToken(key, value);
      input = input.replaceAll(key, () => restoredValue);
      replacedAny = true;
    }
    if (!replacedAny) break;
  }
  tokenMap.clear();
  conditionalBlockTokens.clear();
  perLinePreserveTokens.clear();
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
    parse(text, options) {
      const rawTags: string[] =
        (options as PrettierHublOptions)?.hublCustomTags ?? [];
      const customTags = rawTags.map((entry) => {
        const separatorIndex = entry.indexOf(":");
        if (separatorIndex !== -1) {
          return {
            name: entry.slice(0, separatorIndex),
            endTag: entry.slice(separatorIndex + 1),
          };
        }
        return { name: entry };
      });
      return hublParse(text, {
        ...(options as HublParserOptions),
        hublCustomTags: customTags,
      });
    },
    preprocess: (text: string) => {
      const originalText: string = text.trim();
      let updatedText: string = originalText;
      // Swap HubL tags for placeholders
      updatedText = tokenize(updatedText);
      // Before wrapping standalone placeholders in <template> blocks, detect
      // multi-line HTML tag openings that contain HubL placeholder tokens
      // between their attributes (e.g. `<main\n  class="..."\n
      // <!--placeholder-N-->\n  data-monitor="..."\n>`).  parse5 cannot
      // handle an element node inside a tag opening, so wrapping those
      // placeholders in <template data-hubl-block> and then running the HTML
      // formatter produces invalid restructured DOM and non-idempotent
      // indentation changes.  Replace the entire tag opening — from `<tag`
      // through the closing `>` — with a single NPE token so the HTML
      // formatter sees valid, opaque content.
      updatedText = protectMultiLineTagsWithHublPlaceholders(updatedText);
      // Wrap each line that contains only a HubL placeholder/token (no
      // surrounding HTML) in a block-level template element. Without this, the
      // HTML formatter treats consecutive HTML comment/text nodes as inline
      // content and collapses them onto a single line, reducing the whitespace
      // between them to a single space. That whitespace ends up as a
      // `TemplateData` node in the HubL AST, so the HubL printer then outputs
      // adjacent statements on the same line. The template wrapper forces
      // block-level separation.
      //
      // Also wraps standalone `npe\d+_` tokens (complete HTML tags whose name
      // is a HubL expression, e.g. `<{{ tag }} class="...">`) and standalone
      // `<!--conditionalblock-N-->` tokens (bundled multi-line tag openings
      // created by `protectMultiLineTagsWithHublPlaceholders`). Without block
      // wrapping these tokens are treated as inline text/comments, so they
      // get collapsed onto the same line as adjacent tokens and the HTML
      // formatter receives an unterminated tag, falls into the catch branch,
      // and indentation grows by 2 spaces on each subsequent pass.
      //
      // NOTE: We use <template> (not <script>) because Prettier's HTML
      // formatter treats <script> content as JavaScript and appends semicolons
      // to bare identifiers like `npe0_` → `npe0_;`. That breaks the token
      // lookup during unwrapping. <template> content is left verbatim.
      updatedText = updatedText.replace(
        /^([ \t]*)(<!--(?:placeholder|comment|conditionalblock)-\d+-->|npe\d+_)[ \t]*$/gm,
        "$1<template data-hubl-block>$2</template>",
      );
      // Parse and format HTML.
      // Some templates build HTML dynamically (e.g.
      // `<h2{{ variable }}>` where the variable contains the closing `>`), which
      // parse5 cannot parse. In those cases we abandon the HTML formatting pass
      // and return the original source so the HubL printer can still format
      // HubL syntax correctly without throwing an error to the user.
      try {
        updatedText = synchronizedPrettier.format(updatedText, {
          parser: "html",
          trailingComma: "es5",
        });
      } catch {
        // Known inputs that land here, all of them rejected by parse5:
        //
        //   - the element's `>` comes from HubL, e.g. `<h2{{ attrs }}>`, so
        //     parse5 receives the unterminated `<h2 <!--placeholder-0-->`
        //   - HubL sits in tag-name position, e.g. `<{{ tag }} class="x">`
        //     (fixture: hubl-in-tag-name-position.html)
        //   - an element is opened and closed by different tag names, e.g.
        //     `<footer>` … `</div>` split across `{% if %}` branches
        //
        // The recovery is deliberately heavy because the HubL printer now has
        // to produce correctly indented output from text the HTML formatter
        // never touched. Everything below exists to get the input back to a
        // zero-indent baseline: the wrappers added for the attempt are
        // removed, standalone placeholder lines and the raw HTML content are
        // de-indented to column 0, and stored SVG token values are flattened.
        // Leaving source indentation in place anywhere (e.g. 10 spaces because
        // the HTML lives inside an `{% if %}`) means the printer's `indent()`
        // adds 2 more spaces on top of it every pass — the growth that makes
        // `prettier --check` fail right after `prettier --write` succeeded.
        updatedText = updatedText.replace(
          /<template data-hubl-block>(<!--(?:placeholder|comment|conditionalblock)-\d+-->|npe\d+_)<\/template>/g,
          "$1",
        );
        updatedText = updatedText.replace(
          /^[ \t]*(<!--(?:placeholder|comment|svgblock|conditionalblock)-\d+-->(?:[ \t]*<!--(?:placeholder|comment|svgblock|conditionalblock)-\d+-->)*)[ \t]*$/gm,
          "$1",
        );
        {
          const ONLY_TOKEN_LINE_RE =
            /^(?:<!--(?:placeholder|comment|conditionalblock|svgblock)-\d+-->|npe\d+_)$/;
          const catchLines = updatedText.split("\n");
          const contentIndents: number[] = [];
          for (const line of catchLines) {
            if (line.trim().length === 0) continue;
            if (ONLY_TOKEN_LINE_RE.test(line.trim())) continue;
            contentIndents.push(/^([ \t]*)/.exec(line)?.[1].length ?? 0);
          }
          if (contentIndents.length > 0) {
            const minIndent = Math.min(...contentIndents);
            if (minIndent > 0) {
              updatedText = catchLines
                .map((line) => {
                  if (line.trim().length === 0) return line;
                  if (ONLY_TOKEN_LINE_RE.test(line.trim())) return line;
                  return line.slice(minIndent);
                })
                .join("\n");
            }
          }
        }
        // Also normalize the stored SVG token values to 0 leading indent.
        // The SVG tokens are excluded from the content-line stripping above
        // (they're tokens, not lines), so their stored values still carry the
        // original source indentation. If left as-is, wrapSvgWithPreserve
        // would embed that indentation in the Preserve node's value, and
        // printSvgPreserveContent would then use it as the base indent for
        // every subsequent pass, causing 2-space growth per run.
        for (const [token, value] of tokenMap.entries()) {
          if (!token.startsWith("<!--svgblock-")) continue;
          const svgLines = value.split("\n");
          const nonEmptySvgLineIndents = svgLines
            .filter((l) => l.trim().length > 0)
            .map((l) => /^([ \t]*)/.exec(l)?.[1].length ?? 0);
          const minSvgIndent =
            nonEmptySvgLineIndents.length > 0
              ? Math.min(...nonEmptySvgLineIndents)
              : 0;
          if (minSvgIndent > 0) {
            tokenMap.set(
              token,
              svgLines
                .map((l) => (l.trim().length > 0 ? l.slice(minSvgIndent) : l))
                .join("\n"),
            );
          }
        }
        updatedText = unTokenize(updatedText);
        updatedText = wrapSvgWithPreserve(updatedText);
        updatedText = wrapScriptBlocksWithPreserve(updatedText);
        return preserveFormatting(updatedText);
      }
      // Remove the block-level wrappers added before HTML formatting.
      updatedText = updatedText.replace(
        /<template data-hubl-block>(<!--(?:placeholder|comment|conditionalblock)-\d+-->|npe\d+_)<\/template>/g,
        "$1",
      );
      // Move a HubL token off the closing line of a multi-line tag.
      //
      // When a block tag is written inline with an element
      // (`{% if c %}<img …>{% endif %}`) and the HTML formatter then breaks
      // that element across lines, the trailing token is left glued to the
      // closing `/>`.  The HubL printer emits the restored `{% endif %}` at
      // column 0 in that position, whereas the next pass — which now sees the
      // tag on its own line — indents it to match the element.  Splitting it
      // here makes the first pass agree with every later one.
      updatedText = updatedText.replace(
        /^([ \t]*)(\/?>)(<!--(?:placeholder|comment)-\d+-->)[ \t]*$/gm,
        (match, indent: string, closer: string, token: string) => {
          const value = tokenMap.get(token);
          // Only block tags move.  A trailing `{{ … }}` expression is element
          // content — on a split closing tag (`</span` followed by `>`) it
          // belongs on the `>` line, and moving it would just be undone by the
          // next pass.
          if (!value || !/^{%[\s\S]*%}$/.test(value.trim())) return match;
          return `${indent}${closer}\n${indent}${token}`;
        },
      );
      updatedText = unTokenize(updatedText);
      updatedText = wrapSvgWithPreserve(updatedText);
      updatedText = wrapScriptBlocksWithPreserve(updatedText);
      // Find <pre> tags and add {% preserve %} wrapper
      // to tell the HubL parser to preserve formatting
      return preserveFormatting(updatedText);
    },
    locStart,
    locEnd,
  },
};

const options = {
  hublCustomTags: {
    type: "string" as const,
    array: true,
    default: [{ value: [] }],
    category: "HubL",
    description:
      'Additional HubL tag names to recognise. Use a plain string for self-closing tags (e.g. "my_tag") or "start:end" for block-scoped tags (e.g. "my_block:end_my_block").',
  },
};
const defaultOptions = {};

export { languages, printers, parsers, options, defaultOptions };
