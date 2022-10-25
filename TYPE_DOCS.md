# Formatting logic

This plugin makes two passes when formatting a HubL document. The first pass utilizes Prettier's built in HTML formatter which has it's own specific formatting rules. Two notables rules are:

- Self closing tags will contain a `/`: `<img src="" />`
- Whitespace-sensitive tags will break the tag itself onto multiple lines:

```
<a class="blog-post__tag-link" href="{{ url }}" rel="tag"
            >{{ tag.name }}</a
          >
```

## HubL formatting rules

- The `body` or children of a block tag will be generally be indented one level deeper
- No specific quote type is enforced. However, quotes inside of quotes will be adjusted or escaped as needed

## Tags

### Set

```
{% set var = "some string" %}
```

### If

May be printed on a single line if it will fit

```
{% if true %}Hello{% endif %}
```

```
{% if condition %}
  [indented content]
{% elif condition %}
  [indented content]
{% else %}
  [indented content]
{% endif %}
```

### Unless

```
{% unless condition %}
  [indented content]
{% endunless %}
```

Raw

```
{% raw %}
[preserved content]
{% endraw %}
```

### For

```
{% for item in list %}
  [indented content]
{% endfor %}
```

Macro

```
{% macro macro_name(list, of, params) %}
  [indented content]
{% endmacro %}
```

### Extends

```
{% extends "path/to/file" %}
```

### Include

```
{% include "path/to/file" %}
```

### Import

```
{% import "path/to/file" %}
```

### FromImport

```
{# import variable from 'path/to/file' #}
```

### Caller ### Do

```
{% do variable.method() %}
```

### Block

```
{% block name %}
  [indented content]
{% endblock name %}
```

## Operators

### Concatenate

```
foo ~ bar
```

### And

```
foo and bar
```

Note: `&&` is converted to `and`

### Or

```
foor or bar
```

Note: `||` is converted to `or`

### Is

```
foo is bar
```

### Ternary

```
condition ? foo : bar
```

### Inline If

```
foo if condition else bar
```

### Divide

```
foo / bar
```

### Multiply

```
foo * bar
```

### Modulus

```
foo % bar
```

### Power

```
foo ** bar
```

### Negate

```
-variable
```

### Subtract

```
foo - bar
```

### Add

```
foo + bar
```

### In

```
foo in bar
```

### Group

```
(foo + bar)
```

### Filter

```
|filter
|filter(list, of, params)
```

### FuncCall

```
function(list, of, params)
```

### Compare

### Not

```
left is not right
not variable
```

### LookupVal

```
variable.property
variable[symbol]
```

Note: When the key is string (`variable['property']`) it will be converted to `variable.property`

### KeywordArgs

```
{% tag 'name' foo="bar", bar="foo" %}
{% longerTag 'name'
  item1=true,
  item2="foo",
  item3=bar %}
```

## Data Types

### Array

```
[ "list", "of", "items"]
[
  "long",
  "list",
  "of",
  "items"
]
```

### Dict

```
{ a: true, b: false }
{
  item1: true,
  item2: false
  item3: 100
}
```

### Pair

```
key as value
```

### Symbol / Variable

```
symbol
```

### String Literal

```
"string"
```
