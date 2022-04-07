# prettier-plugin-hubl

A Prettier plugin that formats HubL templates for use with the HubSpot CMS

## Plugin status: Alpha

This plugin is currently in development and is not yet ready for production. Bug reports and questions [are welcomed](https://git.hubteam.com/HubSpot/prettier-plugin-hubl/issues).

## Installing

You can install this plugin directly from GitHub by running:

```bash
npm i https://github.com/HubSpot/prettier-plugin-hubl.git
```
_Note: installation can take a minute or two_

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
