/**
 * Detects `{% if %}/{% else %}` blocks whose branches leave HTML tags
 * unbalanced. The HTML formatter flattens both branches into one sequential
 * view, which corrupts tag nesting for anything that follows — so callers
 * replace the affected spans with opaque tokens before formatting.
 */

/** A half-open character offset range `[start, end)` into the source text. */
export interface TextRange {
  start: number;
  end: number;
}

/** HTML void elements (no closing tag) — excluded from tag-balance counting. */
const VOID_HTML_ELEMENTS = new Set([
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
  "source",
  "track",
  "wbr",
]);

/**
 * Matches HubL control-flow block tags (`{% if %}`, `{% else %}`, `{% endif %}`, etc.).
 * Used by `findIfElseBlocks` to locate if/else pairs; only `if`/`else`/`endif` are
 * handled in the stack walk today (`elif` is matched but not yet supported).
 */
const HUBL_CONTROL_TAG_REGEX = /\{%-?\s*(if|elif|else|endif)\b[^%]*?-?%\}/g;

/** HubL block tags (`{% ... %}`) — stripped before HTML tag-balance counting. */
const HUBL_BLOCK_TAG_REGEX = /\{%.+?%\}/gs;

/** HubL variables (`{{ ... }}`) — stripped before HTML tag-balance counting. */
const HUBL_VARIABLE_REGEX = /\{\{.+?\}\}/gs;

/** HubL comments (`{# ... #}`) — stripped before HTML tag-balance counting. */
const HUBL_COMMENT_REGEX = /\{#.*?#\}/gs;

/**
 * Matches opening/closing HTML tags and captures the tag name.
 * Reset `lastIndex` before each `exec` loop when reusing this regex.
 */
const HTML_TAG_REGEX = /<\/?([a-zA-Z][\w-]*)[^>]*>/g;

/** True when a tag literal ends with `/>` (e.g. SVG `<circle />`). */
const SELF_CLOSING_HTML_TAG_REGEX = /\/>\s*$/;

/** `{% if %}` / `{% endif %}` at the start of a forward-scan slice. */
const HUBL_IF_ENDIF_AT_START_REGEX = /^\{%-?\s*(if|endif)\b[^%]*?-?%\}/;

/** Character offsets delimiting a single `{% if %}...{% else %}...{% endif %}`. */
interface IfElseBlock {
  start: number;
  afterIf: number;
  elseStart: number;
  afterElse: number;
  beforeEndif: number;
  end: number;
}

const isSelfClosingHtmlTag = (tag: string): boolean => {
  return SELF_CLOSING_HTML_TAG_REGEX.test(tag);
};

/** Removes HubL syntax so only literal HTML remains for tag-balance counting. */
const stripHubL = (fragment: string): string =>
  fragment
    .replace(HUBL_BLOCK_TAG_REGEX, "")
    .replace(HUBL_VARIABLE_REGEX, "")
    .replace(HUBL_COMMENT_REGEX, "");

/**
 * Net open HTML tag count in `fragment`, ignoring HubL and void/self-closing
 * elements. Positive means more opens than closes.
 */
const getHtmlTagBalance = (fragment: string): number => {
  const withoutHubL = stripHubL(fragment);

  let balance = 0;
  HTML_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HTML_TAG_REGEX.exec(withoutHubL)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    if (VOID_HTML_ELEMENTS.has(tagName)) {
      continue;
    }

    if (isSelfClosingHtmlTag(fullTag)) {
      continue;
    }

    if (fullTag.startsWith("</")) {
      balance--;
      continue;
    }

    balance++;
  }

  return balance;
};

/** Collects top-level `{% if %}...{% else %}...{% endif %}` blocks via a stack walk. */
const findIfElseBlocks = (text: string): IfElseBlock[] => {
  const blocks: IfElseBlock[] = [];
  const stack: Array<{
    start: number;
    afterIf: number;
    elseStart: number | null;
    afterElse: number | null;
  }> = [];

  HUBL_CONTROL_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HUBL_CONTROL_TAG_REGEX.exec(text)) !== null) {
    const tagType = match[1];
    const tagStart = match.index;
    const tagEnd = tagStart + match[0].length;

    if (tagType === "if") {
      stack.push({
        start: tagStart,
        afterIf: tagEnd,
        elseStart: null,
        afterElse: null,
      });
      continue;
    }

    if (tagType === "else" && stack.length > 0) {
      const current = stack[stack.length - 1];
      if (current.elseStart === null) {
        current.elseStart = tagStart;
        current.afterElse = tagEnd;
      }
      continue;
    }

    if (tagType === "endif" && stack.length > 0) {
      const current = stack.pop();
      if (
        !current ||
        current.elseStart === null ||
        current.afterElse === null
      ) {
        continue;
      }

      blocks.push({
        start: current.start,
        afterIf: current.afterIf,
        elseStart: current.elseStart,
        afterElse: current.afterElse,
        beforeEndif: tagStart,
        end: tagEnd,
      });
    }
  }

  return blocks;
};

/**
 * Walks HTML tags before `ifStart` and returns the offset of the outermost
 * still-unclosed open tag. Falls back to `ifStart` when the stack is empty.
 */
const findOuterUnclosedOpenStart = (text: string, ifStart: number): number => {
  const stack: number[] = [];
  const before = text.slice(0, ifStart);
  HTML_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HTML_TAG_REGEX.exec(before)) !== null) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();

    if (VOID_HTML_ELEMENTS.has(tagName) || isSelfClosingHtmlTag(tag)) {
      continue;
    }

    if (tag.startsWith("</")) {
      stack.pop();
      continue;
    }

    stack.push(match.index);
  }

  return stack[0] ?? ifStart;
};

/**
 * Fallback when forward scanning cannot resync tag balance: walk to the
 * matching close of the root tag opened at `openStart`.
 */
const findContainerCloseEnd = (text: string, openStart: number): number => {
  const openMatch = text.slice(openStart).match(/^<([a-zA-Z][\w-]*)[^>]*>/);
  if (!openMatch) {
    return openStart;
  }

  const rootTag = openMatch[1].toLowerCase();
  let depth = 1;
  let index = openStart + openMatch[0].length;

  while (index < text.length) {
    const remaining = text.slice(index);

    if (/^\s+/.test(remaining)) {
      index += remaining.match(/^\s+/)![0].length;
      continue;
    }

    if (remaining.startsWith("{#")) {
      const commentEnd = remaining.indexOf("#}");
      index += commentEnd === -1 ? 2 : commentEnd + 2;
      continue;
    }

    if (remaining.startsWith("{%")) {
      const tagEnd = remaining.indexOf("%}");
      index += tagEnd === -1 ? 2 : tagEnd + 2;
      continue;
    }

    if (remaining.startsWith("{{")) {
      const expressionEnd = remaining.indexOf("}}");
      index += expressionEnd === -1 ? 2 : expressionEnd + 2;
      continue;
    }

    const tagMatch = remaining.match(/^<\/?([a-zA-Z][\w-]*)[^>]*>/);
    if (!tagMatch) {
      index++;
      continue;
    }

    const tag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();

    if (
      !VOID_HTML_ELEMENTS.has(tagName) &&
      !(tag.startsWith("<") && !tag.startsWith("</") && isSelfClosingHtmlTag(tag))
    ) {
      if (tag.startsWith("</") && tagName === rootTag) {
        depth--;
        if (depth === 0) {
          return index + tag.length;
        }
      } else if (!tag.startsWith("</") && tagName === rootTag) {
        depth++;
      }
    }

    index += tag.length;
  }

  return text.length;
};

/**
 * Scans forward after a divergent if/else block until HTML tag balance
 * resyncs. `ifDepth` ensures a later unrelated `{% if %}` whose body
 * happens to bring balance to zero mid-block does not end the range early.
 */
const findPreserveEnd = (
  text: string,
  fromIndex: number,
  preserveStart: number,
): number => {
  let balance = getHtmlTagBalance(text.slice(preserveStart, fromIndex));
  let ifDepth = 0;
  let index = fromIndex;

  while (index < text.length && (balance > 0 || ifDepth > 0)) {
    const remaining = text.slice(index);

    if (/^\s+/.test(remaining)) {
      index += remaining.match(/^\s+/)![0].length;
      continue;
    }

    if (remaining.startsWith("{#")) {
      const commentEnd = remaining.indexOf("#}");
      index += commentEnd === -1 ? 2 : commentEnd + 2;
      continue;
    }

    const controlTagMatch = remaining.match(HUBL_IF_ENDIF_AT_START_REGEX);
    if (controlTagMatch) {
      if (controlTagMatch[1] === "if") {
        ifDepth++;
      } else {
        ifDepth = Math.max(0, ifDepth - 1);
      }
      index += controlTagMatch[0].length;
      continue;
    }

    if (remaining.startsWith("{%")) {
      const tagEnd = remaining.indexOf("%}");
      index += tagEnd === -1 ? 2 : tagEnd + 2;
      continue;
    }

    if (remaining.startsWith("{{")) {
      const expressionEnd = remaining.indexOf("}}");
      index += expressionEnd === -1 ? 2 : expressionEnd + 2;
      continue;
    }

    const tagMatch = remaining.match(/^<\/?[a-zA-Z][^>]*>/);
    if (tagMatch) {
      const tag = tagMatch[0];
      const tagNameMatch = tag.match(/<\/?([a-zA-Z][\w-]*)/);
      const tagName = tagNameMatch?.[1].toLowerCase() ?? "";

      if (
        !VOID_HTML_ELEMENTS.has(tagName) &&
        !(tag.startsWith("<") && !tag.startsWith("</") && isSelfClosingHtmlTag(tag))
      ) {
        if (tag.startsWith("</")) {
          balance--;
        } else {
          balance++;
        }
      }

      index += tag.length;
      continue;
    }

    index++;
  }

  if (balance > 0) {
    return findContainerCloseEnd(text, preserveStart);
  }

  return index;
};

/** Merges overlapping ranges so each character is covered at most once. */
const mergeOverlappingRanges = (ranges: TextRange[]): TextRange[] => {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: TextRange[] = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push(range);
    }
  }

  return merged;
};

/**
 * Returns text spans that must be preserved verbatim because an
 * `{% if %}/{% else %}` pair leaves HTML tags unbalanced across branches.
 *
 * @param input - Source template text before tokenization.
 * @param shouldSkip - Optional predicate; when it returns true for a block's
 *   start offset, that block is ignored (e.g. already inside `{% preserve %}`).
 * @returns Non-overlapping ranges to replace with opaque placeholders.
 */
export const findConditionalPreserveRanges = (
  input: string,
  shouldSkip: (offset: number) => boolean = () => false,
): TextRange[] => {
  const blocks = findIfElseBlocks(input);
  const preserveRanges: TextRange[] = [];

  for (const block of blocks) {
    if (shouldSkip(block.start)) {
      continue;
    }

    const ifBranch = input.slice(block.afterIf, block.elseStart);
    const elseBranch = input.slice(block.afterElse, block.beforeEndif);
    const ifBalance = getHtmlTagBalance(ifBranch);
    const elseBalance = getHtmlTagBalance(elseBranch);

    // Balanced branches are safe — the HTML formatter's flattened view
    // resyncs to the same depth regardless of which branch is "real".
    if (ifBalance === 0 && elseBalance === 0) {
      continue;
    }

    const preserveStart = findOuterUnclosedOpenStart(input, block.start);
    preserveRanges.push({
      start: preserveStart,
      end: findPreserveEnd(input, block.end, preserveStart),
    });
  }

  return mergeOverlappingRanges(preserveRanges);
};
