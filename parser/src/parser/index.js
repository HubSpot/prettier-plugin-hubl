"use strict";

const lib = require("./lib");
const parser = require("./parser");
const lexer = require("./lexer");
const nodes = require("./nodes");
// const installJinjaCompat = require("./jinja-compat");

// A single instance of an environment, since this is so commonly used
let e;

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

module.exports = {
  parser: parser,
  lexer: lexer,
  lib: lib,
  nodes: nodes,
  // TODO: once hubl-compat is moved into this package, rework this
  // installJinjaCompat: installJinjaCompat,
  configure: configure,
};
