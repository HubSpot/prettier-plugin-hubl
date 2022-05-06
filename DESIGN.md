# Plugin Design

This plugin takes a multi-step approach at parsing and formatting templates. It can be useful to know how this works while attempting to troubleshoot, fix issues, or add functionality. The steps are roughly:

- HubL tags get serialized and replaced with on of several types of placeholders, depending on the tag type and context.
- The file is run through Prettier’s built-in HTML parser
- Paceheld tags are replaced with their origin HubL source
- The file is run through the HubL parser, which creates an AST
- The file is reprinted using the HubL printer
