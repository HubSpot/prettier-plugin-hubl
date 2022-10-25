## Tags

### Set

```
{% set var = "some string" %}
```

### If

```
{% if condition %}
  [body indented]
{% elif condition %}
  [body indented]
{% else %}
  [body indented]
{% endif %}
```

### Unless

```
{% unless condition %}
  [body indented]
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
  [body indented]
{% endfor %}
```

Macro

```
{% macro macro_name(list, of, params) %}
  [body indented]
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

### Single ### Block

```
{% block name %}
{% endblock name %}
```

Body\*

## Operators

### Concat

```
{{ left ~ right }}
```

### And

```
{{ left and right }}
```

### Is

```
{{ left is right }}
```

### Ternary

```
{{ condition ? one : two }}
```

### InlineIf

```
{{ variable if positive else negative }}
```

### Div

```
{{ one / two }}
```

### Mul

```
{{ one * two }}
```

### Mod

```
{{ one % two }}
```

### Pow

```
{{ one ** two }}
```

### Neg

```
{{ -variable }}
```

### Sub

```
{{ left - right }}
```

### Add

```
{{ left + right }}
```

### In

```
{{ left in right }}
```

### Group

```
(epxression)
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

### Compare //TODO

### Not

```
{{ left is not right }}
{{ not variable }}
```

### LookupVal

```
variable['property']
{{ variable.property }}
{{ variable[symbol] }}
```

### KeywordArgs

## Data Types

### Array

```
{{ [ "list", "of", "items"] }}
```

### Dict

```
{{ {
  "item1": true,
  "item2": false
} }}
```

### Pair //TODO: not parsing

```
{# key as value #}
```

### Symbol

```
{{ symbol }}
```

### Literal

```
{{ "string" }}
```

// TODO: Explain quote logic
