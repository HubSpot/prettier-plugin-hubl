# HubL Pretter Plugin and Parser

LINK TO LOOM - https://www.loom.com/share/445f40453322440c81cc021ad88c5213

## Overview

The project is divided into two parts. The Parser, and the Prettier plugin. The job of the parser is to output an AST that the Prettier plugin can then use to format the code.

## Details

### Parser

HubL is an extension of Jinja. HubSpot has its own implementation of Jinja called Jinjava. See links below for more details. Much in the same vein, Nunjucks is a heavily Jinja-based templating language written for Javascript, created by Mozilla. In addition, Nunjucks offers a Jinja compatibility mode, making it the ideal candidate to build off of. Knowing this, we can leverage Nunjucks's parser and extend it to include HubL's custom tags. Any HTML we encounter while processing HubL, we can pass off to the Jinjava parser which is able to generate an AST for the html block. Whenever a templating block is encountered (`{{ }}` or `{% %}`), the Nunjucks parser goes to parse it. However, we register Tags (Tags.ts) that we want to handle. When Nunjucks encounters a symbol it doesn't recognize, it checks against the tags we registered, and if there is a match, hands off the parsing to our custom parser. From there, we analyze the tag, and generate the AST for that given block. Control is then passed back to the Nunjucks parser until we encounter another unknown symbol.

### Printer/Prettier Plugin

Once an AST is generated, we can pass this information to Prettier. Prettier will then go through the AST and give you the ability to say what you would like to do with the formatting. For instance, if we encounter a `for` statement, it is reasonable that we would want to indent everything within that block.

A Prettier plugin needs 5 exports:
languages
printers
parsers
options
defaultOptions

Information on these can be found at [Prettier's documentation](https://prettier.io/docs/en/plugins.html#printers).

### Combining Them

In prettier, you are able to register your custom parse function. Prettier will then call that parser with the document that is being prettified. Once the AST is generated from the parser, it is handed off to Prettier's print function, which iterates through the AST and applies prettier rules specified by the extension developer.

## Testing

### Quick Start

The following commands are available at the root of the repo.

- To test the parser, you can run `yarn watch-parser`.
- To test prettier, you can run `yarn watch-prettier`. While running this command, if you make changes in the parser, prettier will pick them up, but you need to trigger a re-run in the prettier folder by re-saving a file.
- If you want to test everything together you can run `yarn start` or `yarn watch-all`.

### Parser Advanced Usage

Within the parser folder, you can run

- `yarn start` or `yarn watch-all` to test everything
- `yarn test` to do a one-off run of all parser tests
- `yarn watch-complex` to only run tests in the `complex` folder
- `yarn watch-broken` to only run tests in the `simple/broken` folder
- `yarn watch-simple` to only run tests in the `simple/working` folder
- `yarn watch-single` to run a single test. It takes a path param of the test to run. E.g. `yarn watch-single tests/simple/broken/test-broken-1.html`
- `yarn watch-build` to just build the parser when it changes, but not run any tests. Useful when testing the prettier plugin.
- `yarn build` to do a one-off build of the parser

If you are making changes to the printer, have `yarn watch-build` running. This way, if you need to add any temporary logging or changes to the parser, it will be reflected when you re-run the printer. In addition, there are couple of extra flags you can use for debugging. If you add the `--debug` flag, stack traces will be printed on errors, and the generated AST will be printed. If you add the `--silent` flag, the only output will be any logging you manually add. You can combine both flags if you just want the generated AST as output. This is because the `--debug` flag prints the AST, and the `--silent` flag silences the pass/fail output.

### Prettier Advanced Usage

Within the prettier folder, you can run

- `yarn watch` or `yarn watch-all` to run all prettier tests in watch mode
- `yarn test` to do a one-off run of all prettier tests

Testing in Prettier is done through Jest snapshot testing. It is a bit hacked in there. Currently we have one 'mega' test that iterates through all of our .html files, and saves the snapshot to a single output snapshot file. To add more tests, just add `.html` files with the document you want formatted, and it will be added to the test run.

## Links

- [How to Write a Prettier Plugin](https://medium.com/@fvictorio/how-to-write-a-plugin-for-prettier-a0d98c845e70)
- [Nunjucks Docs](https://mozilla.github.io/nunjucks/api.html#custom-tags)
- [Prettier Parser API](https://prettier.io/docs/en/plugins.html#parsers)
- [Prettier Printers](https://prettier.io/docs/en/plugins.html#printers)
- [Prettier Formatting API](https://github.com/prettier/prettier/blob/main/commands.md)
- [Prettier Printing Python Example](https://github.com/prettier/plugin-python/blob/034ba8a9551f3fa22cead41b323be0b28d06d13b/src/printer.js#L174)
- [Jinja](https://jinja.palletsprojects.com/en/2.11.x/) Templating engine
- [Jinjava](https://github.com/HubSpot/jinjava) HubSpots implementation of Jinja
- [Nunjucks](https://github.com/mozilla/nunjucks) JS Implementation of Jinja
- [prettier-nunjucks-plugin](https://github.com/justrhysism/prettier-plugin-nunjucks/tree/master/src) Example Code
- [WIP Customer HubL Parser](https://github.com/kieranja/hubl/tree/main/src) Customer Code
