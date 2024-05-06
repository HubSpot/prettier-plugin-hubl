"use strict";

import * as lexer from "./lexer";
import * as nodes from "./nodes";
import * as lib from "./lib";
import * as parser from "./parser";

// A single instance of an environment, since this is so commonly used
let e;

/* eslint-disable no-undef */
// Not sure what the undefined loaders are supposed to do, but leaving for now. Might be globals?
function configure(templatesPath, opts) {
  opts = opts || {};
  if (lib.isObject(templatesPath)) {
    opts = templatesPath;
    templatesPath = null;
  }

  let TemplateLoader;

  if (loaders.FileSystemLoader) {
    TemplateLoader = new loaders.FileSystemLoader(templatesPath, {
      watch: opts.watch,
      noCache: opts.noCache,
    });
  } else if (loaders.WebLoader) {
    TemplateLoader = new loaders.WebLoader(templatesPath, {
      useCache: opts.web && opts.web.useCache,
      async: opts.web && opts.web.async,
    });
  }

  e = new Environment(TemplateLoader, opts);

  if (opts && opts.express) {
    e.express(opts.express);
  }

  return e;
}
/* eslint-enable no-undef */

export { parser };

module.exports = {
  parser,
  lexer,
  lib,
  nodes,
  configure,
};
