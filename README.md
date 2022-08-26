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
npm i @hubspot/prettier-plugin-hubl
```

If you haven't already installed [prettier](https://prettier.io) you'll want to do that as well:

```bash
npm i prettier
```

## Setup

If you don't already have a prettier config file, create one:

```json
# .prettierrc.json
---
{
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

## Troubleshooting Errors

Check under “Known Issues” to see if your error has been reported already. If not, feel free to [open up a new issue](https://github.com/HubSpot/prettier-plugin-hubl/issues/new).

## Community

You can stay up to date with HubSpot CMS Boilerplate updates and discussions in the #hs-cms-boilerplate channel in the HubSpot Developer Slack.
