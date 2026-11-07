# prettier-plugin-hubl

A Prettier plugin that formats HubL templates for use with the HubSpot CMS

## Plugin status: Beta

This plugin is currently in active development. Bug reports and questions [are welcomed](https://github.com/HubSpot/prettier-plugin-hubl/issues).

## Philosophy

In keeping with Prettier’s philosophy, this plugin is relatively opinionated and sometimes Prettier will prefer one syntax over another. For example:

- `{{ foo is string_containing “bar” }}` will become `{{ foo is string_containing(“bar”) }}`
- `a && b` will `become a and b`
- `c || d` will become `c or d`

If you have a particular code-style opinion that you feel strongly about, feel free to [open an issue](https://github.com/HubSpot/prettier-plugin-hubl/issues/new) for review.

## Installing

You can install this plugin directly from NPM by running:

```bash
npm i @hubspot/prettier-plugin-hubl -D
```

If you haven't already installed [prettier](https://prettier.io) you'll want to do that as well:

```bash
npm i prettier -D
```

## Setup

**Note**: Starting with Prettier 3.x, plugins must be explicitly listed in your Prettier configuration. Auto-discovery has been removed.

If you don't already have a prettier config file, create one:

```json
# .prettierrc.json
{
  "plugins": ["@hubspot/prettier-plugin-hubl"],
  "overrides": [
    {
      "files": "*.html",
      "options": {
        "parser": "hubl"
      }
    }
  ]
}
```

Run prettier

```bash
npx prettier --write '**/*.html'
```

## Options

### `hublCustomTags`

Register additional HubL tag names that the plugin should recognise but that are not part of the standard HubL tag set (for example, private or org-specific tags).

Each entry is a string:

- **Self-closing tag**: `"tag_name"`
- **Block-scoped tag**: `"tag_name:end_tag_name"`

```js
// .prettierrc.js
export default {
  plugins: ["@hubspot/prettier-plugin-hubl"],
  hublCustomTags: [
    "my_self_closing_tag",
    "my_block_tag:end_my_block_tag",
  ],
  overrides: [
    {
      files: "*.html",
      options: { parser: "hubl" },
    },
  ],
};
```

Without this option, the plugin throws `unknown block tag: <name>` when it encounters an unrecognised tag.

## Troubleshooting Errors

Check under “Known Issues” to see if your error has been reported already. If not, feel free to [open up a new issue](https://github.com/HubSpot/prettier-plugin-hubl/issues/new). You can also review the expected formatting of different elements [here](./TYPE_DOCS.md).

## Community

You can stay up to date with HubSpot CMS Boilerplate updates and discussions in the #hs-cms-boilerplate channel in the HubSpot Developer Slack.
