/**
 * Detects `{% if %}/{% elif %}/{% else %}` blocks whose branches leave HTML
 * tags unbalanced or share the same top-level HTML element types across
 * branches. The HTML formatter flattens all branches into one sequential view,
 * which can corrupt tag nesting or produce invalid sibling structures — so
 * callers replace the affected spans with opaque tokens before formatting.
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
 * Matches HubL control-flow block tags (`{% if %}`, `{% elif %}`, `{% else %}`,
 * `{% endif %}`). Used by `findIfBlocks` to locate all branch boundaries.
 */
const HUBL_CONTROL_TAG_REGEX = /\{%-?\s*(if|elif|else|endif)\b[^%]*?-?%\}/g;

/** HubL block tags (`{% ... %}`) — stripped before HTML tag-balance counting. */
const HUBL_BLOCK_TAG_REGEX = /\{%.+?%\}/gs;

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

/** A single branch's content span inside an `{% if %}/{% elif %}/{% else %}` block. */
interface BranchRange {
  /** Offset of the first character after the opening control tag. */
  start: number;
  /** Offset of the first character of the next control tag (or `{% endif %}`). */
  end: number;
}

/**
 * All branches of an `{% if %}...{% elif %}...{% else %}...{% endif %}` block.
 * Blocks without a final `{% else %}` branch are also collected so that
 * unbalanced single-branch `{% if %}...{% endif %}` constructs can be detected.
 */
interface IfBlock {
  /** Offset of the start of the `{% if %}` tag. */
  start: number;
  /** Offset just past the `{% endif %}` tag. */
  end: number;
  /** Content ranges for each branch: if, each elif, and (optionally) else. */
  branches: BranchRange[];
  /** Whether the block has a final `{% else %}` branch. */
  hasElse: boolean;
}

const isSelfClosingHtmlTag = (tag: string): boolean => {
  return SELF_CLOSING_HTML_TAG_REGEX.test(tag);
};

/**
 * Returns the index immediately after a `{{ ... }}` expression, correctly
 * handling nested `{{ }}` pairs inside filter arguments.
 */
const indexAfterHubLExpression = (text: string, startIndex: number): number => {
  if (!text.startsWith("{{", startIndex)) {
    return startIndex;
  }

  let index = startIndex + 2;
  let depth = 1;

  while (index < text.length && depth > 0) {
    if (text.startsWith("{{", index)) {
      depth++;
      index += 2;
      continue;
    }

    if (text.startsWith("}}", index)) {
      depth--;
      index += 2;
      continue;
    }

    index++;
  }

  return index;
};

/** Removes `{{ ... }}` expressions, including nested pairs inside filter args. */
const stripHubLExpressions = (fragment: string): string => {
  let output = "";
  let index = 0;

  while (index < fragment.length) {
    if (fragment.startsWith("{{", index)) {
      index = indexAfterHubLExpression(fragment, index);
      continue;
    }

    output += fragment[index];
    index++;
  }

  return output;
};

/** Removes HubL syntax so only literal HTML remains for tag-balance counting. */
const stripHubL = (fragment: string): string =>
  stripHubLExpressions(
    fragment.replace(HUBL_BLOCK_TAG_REGEX, "").replace(HUBL_COMMENT_REGEX, ""),
  );

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

/**
 * Returns the set of HTML element types that appear as top-level (depth-0)
 * elements in `fragment`, after stripping HubL. Void and self-closing elements
 * are excluded. Used to detect when two branches both contribute the same
 * block-level element, which would produce invalid sibling structures when
 * the branches are flattened by the HTML formatter.
 */
const getTopLevelTagNames = (fragment: string): Set<string> => {
  const withoutHubL = stripHubL(fragment);
  const result = new Set<string>();
  const stack: string[] = [];

  HTML_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HTML_TAG_REGEX.exec(withoutHubL)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    if (VOID_HTML_ELEMENTS.has(tagName) || isSelfClosingHtmlTag(fullTag)) {
      continue;
    }

    if (fullTag.startsWith("</")) {
      if (stack.length > 0 && stack[stack.length - 1] === tagName) {
        stack.pop();
      }
    } else {
      if (stack.length === 0) {
        result.add(tagName);
      }
      stack.push(tagName);
    }
  }

  return result;
};

/**
 * Collects all `{% if %}...{% elif %}...{% else %}...{% endif %}` blocks via
 * a stack walk, recording every branch boundary (if, each elif, else).
 */
const findIfBlocks = (text: string): IfBlock[] => {
  const blocks: IfBlock[] = [];
  const stack: Array<{
    start: number;
    branchStarts: number[];
    branchEnds: number[];
    hasElse: boolean;
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
        branchStarts: [tagEnd],
        branchEnds: [],
        hasElse: false,
      });
      continue;
    }

    if ((tagType === "elif" || tagType === "else") && stack.length > 0) {
      const current = stack[stack.length - 1];
      current.branchEnds.push(tagStart);
      current.branchStarts.push(tagEnd);
      if (tagType === "else") {
        current.hasElse = true;
      }
      continue;
    }

    if (tagType === "endif" && stack.length > 0) {
      const current = stack.pop()!;
      current.branchEnds.push(tagStart);

      const branches: BranchRange[] = current.branchStarts.map(
        (branchStart, index) => ({
          start: branchStart,
          end: current.branchEnds[index],
        }),
      );

      blocks.push({
        start: current.start,
        end: tagEnd,
        branches,
        hasElse: current.hasElse,
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
      index = indexAfterHubLExpression(text, index);
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
      !(
        tag.startsWith("<") &&
        !tag.startsWith("</") &&
        isSelfClosingHtmlTag(tag)
      )
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
      index = indexAfterHubLExpression(text, index);
      continue;
    }

    const tagMatch = remaining.match(/^<\/?[a-zA-Z][^>]*>/);
    if (tagMatch) {
      const tag = tagMatch[0];
      const tagNameMatch = tag.match(/<\/?([a-zA-Z][\w-]*)/);
      const tagName = tagNameMatch?.[1].toLowerCase() ?? "";

      if (
        !VOID_HTML_ELEMENTS.has(tagName) &&
        !(
          tag.startsWith("<") &&
          !tag.startsWith("</") &&
          isSelfClosingHtmlTag(tag)
        )
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

  // The forward scan above counts balance by tag open/close alone, without
  // regard to tag name, so it can resync to zero too early (e.g. an
  // unrelated `<span>...</span>` inside the range closes before the actual
  // container opened at `preserveStart` does). Re-check with the tag-name-
  // aware `findContainerCloseEnd` and extend the range if it reaches
  // further, so the preserved span always covers the whole container.
  const openTagMatch = text
    .slice(preserveStart)
    .match(/^<([a-zA-Z][\w-]*)[^>]*>/);
  if (openTagMatch) {
    const containerCloseEnd = findContainerCloseEnd(text, preserveStart);
    if (containerCloseEnd > index) {
      return containerCloseEnd;
    }
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
 * `{% if %}/{% elif %}/{% else %}` block would produce invalid HTML when its
 * branches are flattened by the HTML formatter.
 *
 * Two conditions each trigger preservation independently:
 *
 * 1. **Unbalanced branch** — any single branch has a non-zero net HTML tag
 *    balance (more opens than closes, or vice-versa). This is the classic
 *    split-wrapper pattern: `{% if %}<div>{% else %}</div>{% endif %}`. Only
 *    blocks with two or more branches qualify; see below.
 *
 * 2. **Duplicate top-level element** — the same HTML element type appears as
 *    a top-level element in two or more branches. When flattened, all branches
 *    are rendered as siblings, which can produce invalid HTML (e.g. three
 *    sibling `<main>` elements). This check only applies to blocks that have a
 *    final `{% else %}` branch to avoid flagging simple `{% if %}...{% endif %}`
 *    patterns that are always safe to flatten.
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
  const blocks = findIfBlocks(input);
  const preserveRanges: TextRange[] = [];

  for (const block of blocks) {
    if (shouldSkip(block.start)) {
      continue;
    }

    const branchTexts = block.branches.map((branch) =>
      input.slice(branch.start, branch.end),
    );
    const branchBalances = branchTexts.map(getHtmlTagBalance);

    // A lone {% if %}...{% endif %} is excluded: templates routinely open a
    // wrapper element in one such block and close it in a separate later one,
    // and the HTML formatter flattens that correctly. Preserving it would
    // anchor the range at the outermost unclosed element, which can swallow
    // most of the template and emit it verbatim and unindented.
    const hasUnbalancedBranch =
      block.branches.length > 1 &&
      branchBalances.some((balance) => balance !== 0);

    // Check #2 only for blocks with an {% else %} branch (two or more branches).
    // A lone {% if %}...{% endif %} with balanced content is always safe.
    let hasDuplicateTopLevelElement = false;
    if (block.hasElse) {
      const seenTagNames = new Set<string>();
      for (const branchText of branchTexts) {
        for (const tagName of getTopLevelTagNames(branchText)) {
          if (seenTagNames.has(tagName)) {
            hasDuplicateTopLevelElement = true;
            break;
          }
          seenTagNames.add(tagName);
        }
        if (hasDuplicateTopLevelElement) {
          break;
        }
      }
    }

    if (!hasUnbalancedBranch && !hasDuplicateTopLevelElement) {
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
