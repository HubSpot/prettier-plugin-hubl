"use strict";
exports.__esModule = true;
var parseSignature = function (parser, nodes, lexer) {
  /**
   * Gets the next token without advancing the parser
   */
  var token = parser.peekToken();
  /**
   * This contains all of the arguments/properties of the tag we are parsing.
   * We will iterate through all children and create a tree structure for all arguments
   */
  var parsedSignature = new nodes.NodeList(token.lineno, token.colno);
  /**
   * keywordArgs is initially an object in the following form
   * {
   *   lineno: 0,
   *   colno: 16,
   * }
   *
   * If we encounter a token with a key/value pair (e.g. foo="bar"),
   * we will add some more properties.  This can be seen in the line `parser.skipValue(lexer.TOKEN_OPERATOR, "=")` below
   * After we add information, the object will look like this:
   * {
   *  lineno: 0,
   *  colno: 16,
   *  type: 'kw',
   *  children: [
   *    {
   *     lineno: 0,
   *     colno: 16,
   *     key: {
   *       lineno: 0,
   *       colno: 39,
   *       value: 'overrideable',
   *       type: 'symbol'
   *     },
   *     value: {
   *       lineno: 0,
   *       colno: 52,
   *       value: 'True'
   *     }
   *    },
   *  ]
   * }
   *
   * Note that children will be an array of objects containing n KV pairs
   */
  var keywordArgs = new nodes.KeywordArgs();
  /**
   * We want to stay in this loop until we finish parsing.  We know we are done when we
   * hit the end of the block (e.g. %} and }} )
   */
  while (true) {
    token = parser.peekToken();
    /**
     * We encountered the end of the block we are parsing, this is our escape.
     */
    if (token.type === lexer.TOKEN_BLOCK_END) {
      break;
    }
    // Skip commas as they have no syntactical meaning here.
    if (token.type === lexer.TOKEN_COMMA) {
      parser.nextToken();
      continue;
    }
    /**
     * This is a tag within the top level tag.
     * For instance, if the tag is `dnd_module`,
     * this could be things like `path`, `width`, `offset`, etc.
     * If this is a key with a value, we will parse both in the `parser.skipValue(lexer.TOKEN_OPERATOR, "=")`
     * below, otherwise we will assume this is a single value and add it as is
     */
    var expression = parser.parseExpression();
    /**
     * Adding some metadata for prettier
     */
    expression.type = token.type;
    expression.value = token.value;
    expression.lineno = token.lineno;
    expression.colno = token.colno;
    if (parser.skipValue(lexer.TOKEN_OPERATOR, "=")) {
      keywordArgs.type = "kw";
      var lhs = expression;
      lhs.type = "kw_key";
      var rhs = void 0;
      // In HubL, values can be Dicts with nested variables, so we need to parse them
      //@ts-ignore
      if (parser.tokens._extractString("{{")) {
        //@ts-ignore
        var parsedVariable = parser.tokens._extractUntil("}}");
        // This is a hack to output the contents verbatim
        var symbolNode = new nodes.Symbol(
          token.lineno,
          token.colno,
          parsedVariable.trim(),
        );
        rhs = new nodes.Output(token.lineno, token.colno, [symbolNode]);
        //@ts-ignore
        parser.tokens.forwardN(2);
      } else {
        rhs = parser.parseExpression();
        rhs.type = "kw_val";
      }
      /**
       * If we are in this block, it means we encountered something of the form foo=bar
       * Our `lhs` variable will be the `foo` part
       * Our `rhs` variable will be the `bar` part
       * Ex:
       * `lhs` may look like
       * {
       *   lineno: 0,
       *   colno: 39,
       *   value: 'overrideable',
       *   type: 'symbol'
       * }
       *
       * `rhs` may look like
       * {
       *  lineno: 0,
       *  colno: 52,
       *  value: 'True'
       * }
       */
      keywordArgs.addChild(
        new nodes.Pair(lhs.lineno, lhs.colno, expression, rhs),
      );
    } else {
      // Otherwise, it's a normal argument, so we don't need to split lhs from rhs
      parsedSignature.addChild(expression);
    }
  }
  if (keywordArgs.children.length) {
    /**
     * keywordArgs is special because it is KV pairs.  Only add them
     * if we encountered any so we don't pollute the signature tree.
     */
    parsedSignature.addChild(keywordArgs);
  }
  return parsedSignature;
};
function RemoteExtension() {
  /**
   * This is where we register all custom tags.  If it is a block-scoped tag
   * also add it to the `blockTags` array below.  When the parser encounters
   * any of these tags within a {% %} block, it will call into our custom
   * parse function.
   */
  this.tags = [
    "blog_comments",
    "blog_social_sharing",
    "blog_subscribe",
    "boolean",
    "choice",
    "comment",
    "color",
    "content_attribute",
    "cta",
    "custom_widget",
    "cycle",
    "dnd_area",
    "dnd_column",
    "dnd_module",
    "dnd_row",
    "dnd_section",
    "do",
    "email_each",
    "email_flex_area",
    "email_simple_subscription",
    "email_subscriptions",
    "email_subscriptions_confirmation",
    "endemail_each",
    "endflip",
    "end_content_attribute",
    "end_dnd_area",
    "end_dnd_column",
    "end_dnd_module",
    "end_dnd_row",
    "end_dnd_section",
    "end_email_each",
    "end_module_attribute",
    "end_widget_attribute",
    "end_widget_block",
    "flip",
    "include_dnd_partial",
    "follow_me",
    "form",
    "icon",
    "json_block",
    "module",
    "module_attribute",
    "widget_attribute",
    "related_blog_posts",
    "widget_block",
    "with",
    "global_partial",
    "require_js",
    "require_css",
    "placeholder_block",
    "end_placeholder_block",
    "member_login",
    "module_block",
    "end_module_block",
    "scope_css",
    "end_scope_css",
    "member_register",
    "password_reset_request",
    "password_reset",
    "gallery",
    "global_module",
    "global_widget",
    "google_search",
    "header",
    "image",
    "image_slider",
    "image_src",
    "inline_rich_text",
    "inline_text",
    "language_switcher",
    "linked_image",
    "logo",
    "menu",
    "page_footer",
    "password_prompt",
    "post_filter",
    "post_listing",
    "print",
    "raw_html",
    "js_partial",
    "js_module",
    "require_head",
    "rich_text",
    "rss_listing",
    "section_header",
    "simple_menu",
    "social_sharing",
    "space",
    "style_settings",
    "targeted_module_attribute",
    "targeted_widget_attribute",
    "text",
    "textarea",
    "video_player",
    "widget_container",
    "widget_wrapper",
    "end_flip",
    "end_require_css",
    "end_require_head",
    "end_require_js",
    "end_style_settings",
    "end_targeted_module_attribute",
    "end_targeted_widget_attribute",
    "end_widget_container",
    "end_widget_wrapper",
    "end_json_block",
  ];
  /**
   * Any block tags we are adding should be added here in addition to the array above.
   */
  var blockTags = [
    { start: "comment", end: "end_comment" },
    { start: "content_attribute", end: "end_content_attribute" },
    { start: "dnd_area", end: "end_dnd_area" },
    { start: "dnd_column", end: "end_dnd_column" },
    { start: "dnd_module", end: "end_dnd_module" },
    { start: "dnd_row", end: "end_dnd_row" },
    { start: "dnd_section", end: "end_dnd_section" },
    { start: "email_each", end: "endemail_each" },
    { start: "flip", end: "endflip" },
    { start: "module_attribute", end: "end_module_attribute" },
    { start: "module_block", end: "end_module_block" },
    { start: "require_css", end: "end_require_css" },
    { start: "require_head", end: "end_require_head" },
    { start: "require_js", end: "end_require_js" },
    { start: "scope_css", end: "end_scope_css" },
    { start: "style_settings", end: "end_style_settings" },
    {
      start: "targeted_module_attribute",
      end: "end_targeted_module_attribute",
    },
    {
      start: "targeted_widget_attribute",
      end: "end_targeted_widget_attribute",
    },
    { start: "widget_attribute", end: "end_widget_attribute" },
    { start: "widget_block", end: "end_widget_block" },
    { start: "widget_container", end: "end_widget_container" },
    { start: "widget_wrapper", end: "end_widget_wrapper" },
    { start: "json_block", end: "end_json_block" },
  ];
  this.parse = function (parser, nodes, lexer) {
    var tagWhiteSpace = {
      openTag: { start: parser.dropLeadingWhitespace, end: false },
      closingTag: { start: false, end: false },
    };
    /**
     * This is our next top-level token/tag.  It will be one of the ones listed in the tags array above.
     * It will look like
     * {
     *   type: 'tag'
     *   value: 'cycle',
     *   lineno: 1,
     *   colno: 29
     * }
     */
    var nextTag = parser.nextToken();
    /**
     * This is where we add all of the data/properties/options/flags that goes in the tag.
     */
    nextTag.children = parseSignature(parser, nodes, lexer);
    /**
     * Check to see if this is a block tag and if so, get that obj.
     **/
    var blockTag = blockTags.find(function (t) {
      return t.start === nextTag.value;
    });
    /**
     * To make it easier for Prettier, we specify what type of token this is
     */
    nextTag.type = blockTag ? "block_tag" : "tag";
    /**
     * While parsing the signature, we escaped once we saw the block end, but we didn't
     * advance the parser.  Do that here as our final step, so the parser can continue
     */
    parser.advanceAfterBlockEnd(nextTag.value);
    tagWhiteSpace.openTag.end = parser.dropLeadingWhitespace;
    // If we have a block tag, we need to parse the block to nest the contents as a body
    if (blockTag) {
      nextTag.body = parser.parseUntilBlocks(blockTag.end);
      tagWhiteSpace.closingTag.start = parser.dropLeadingWhitespace;
      parser.advanceAfterBlockEnd();
      tagWhiteSpace.closingTag.end = parser.dropLeadingWhitespace;
    }
    nextTag.whiteSpace = tagWhiteSpace;
    return nextTag;
  };
}
exports["default"] = RemoteExtension;
