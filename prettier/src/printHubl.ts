import { Doc } from "prettier";
import { doc, util } from "prettier";
const {
  builders: { group, indent, dedent, join, hardline, line, softline, align },
} = doc;

const openTag = (whitepsace) => {
  return whitepsace.start ? "{%-" : "{%";
};
const closeTag = (whitepsace) => {
  return whitepsace.end ? "-%}" : "%}";
};
const openVar = (whitepsace) => {
  return whitepsace.start ? "{{-" : "{{";
};
const closeVar = (whitepsace) => {
  return whitepsace.end ? "-}}" : "}}";
};

// Recurvisely print if elif and else
const printElse = (node) => {
  if (node.else_ && node.else_.typename === "If") {
    const parts = [
      openTag(node.else_.whiteSpace.openTag),
      " elif ",
      printHubl(node.else_.cond),
      " ",
      closeTag(node.else_.whiteSpace.openTag),
      indent(printBody(node.else_.body)),
    ];
    if (node.else_.else_) {
      parts.push(printElse(node.else_));
    }
    return parts;
  } else if (node.else_ && node.else_.typename === "NodeList") {
    return [
      openTag(node.else_.whiteSpace.openTag),
      " else ",
      closeTag(node.else_.whiteSpace.openTag),
      indent(printBody(node.else_)),
    ];
  }
};

const printTagArgs = (node) => {
  return node.children.map((child) => {
    if (child.typename === "KeywordArgs") {
      return printHubl(child);
    } else {
      return group([line, printHubl(child)]);
    }
  });
};

// Nested HubL tags get special treatment to indent correctly
const printBody = (node) => {
  let bodyElements: Doc = [];
  const isTemplateData = (item) => {
    return (
      item.typename === "Output" &&
      item.children &&
      item.children[0].typename === "TemplateData"
    );
  };
  const getTemplateData = (item) => {
    const childValue = item.children[0].value;
    let lines = childValue.split("\n");

    return join(hardline, lines);
  };
  const getEndTemplateData = (item) => {
    const childValue = item.children[0].value.replace(/\n$/, "");
    let lines = childValue.split("\n");
    if (/^\s+$/.test(lines[lines.length - 1])) {
      const lastLine = lines.pop();
      return [join(hardline, lines), dedent([hardline, lastLine])];
    }

    return [join(hardline, lines), dedent(hardline)];
  };
  for (let i = 0; i < node.children.length; i++) {
    const element = node.children[i];
    if (isTemplateData(element)) {
      if (i === node.children.length - 1) {
        bodyElements.push(getEndTemplateData(element));
      } else {
        bodyElements.push(getTemplateData(element));
      }
    } else {
      bodyElements.push(printHubl(element));
    }
  }
  return bodyElements;
};

const printComment = (node) => {
  let commentText;
  try {
    // We'd normally recurse here, but comments should always have the same shape.
    commentText = node.body.children[0].children[0].value;
    commentText = commentText
      .replace(/^.*?<!--/gms, "")
      .replace(/-->.*?$/g, "");

    return group(["{#", commentText, "#}"]);
  } catch (e) {
    throw new Error(`Error printing comment`);
  }
};

// This is the main print function, which will determine the type of node and
// print accordingly. It is recursive, so it will call itself to print nested
// nodes.
function printHubl(node) {
  if (!node) {
    return "";
  }
  switch (node.typename) {
    case "Root":
      return node.children.map((child) => {
        return printHubl(child);
      });
    case "Set":
      return [
        "{% set ",
        join(
          ", ",
          node.targets.map((target) => {
            return target.value;
          })
        ),
        " = ",
        printHubl(node.value),
        " %}",
      ];
    case "Concat":
      return [printHubl(node.left), " ~ ", printHubl(node.right)];
    case "And":
      return [printHubl(node.left), " and ", printHubl(node.right)];
    case "Is":
      return [printHubl(node.left), " is ", printHubl(node.right)];
    case "If":
      const ifParts = [
        group([
          openTag(node.whiteSpace.openTag),
          " if ",
          printHubl(node.cond),
          " ",
          closeTag(node.whiteSpace.openTag),
        ]),
        indent(printBody(node.body)),
      ];
      if (node.else_) {
        ifParts.push(printElse(node));
      }
      ifParts.push(
        openTag(node.whiteSpace.closingTag),
        " endif ",
        closeTag(node.whiteSpace.closingTag)
      );
      return group(ifParts);
    case "InlineIf":
      if (node.else_) {
        return group([
          printHubl(node.body),
          " if ",
          printHubl(node.cond),
          " else ",
          printHubl(node.else_),
        ]);
      }
      return group([printHubl(node.body), " if ", printHubl(node.cond)]);
    case "Ternary":
      return group([
        printHubl(node.cond),
        " ? ",
        printHubl(node.body),
        " : ",
        printHubl(node.else),
      ]);
    case "Unless":
      const unlessParts = [
        group([
          openTag(node.whiteSpace.openTag),
          " unless ",
          printHubl(node.cond),
          " ",
          closeTag(node.whiteSpace.openTag),
        ]),
        indent(printBody(node.body)),
      ];
      if (node.else_) {
        unlessParts.push(printElse(node));
      }
      unlessParts.push([
        openTag(node.whiteSpace.closingTag),
        " endunless ",
        closeTag(node.whiteSpace.closingTag),
      ]);
      return group(unlessParts);
    case "Div":
      return group([printHubl(node.left), " / ", printHubl(node.right)]);
    case "Mul":
      return group([printHubl(node.left), " * ", printHubl(node.right)]);
    case "Mod":
      return group([printHubl(node.left), " % ", printHubl(node.right)]);
    case "Pow":
      return group([printHubl(node.left), " ** ", printHubl(node.right)]);
    case "Neg":
      return group(["-", printHubl(node.target)]);
    case "Sub":
      return group([printHubl(node.left), " - ", printHubl(node.right)]);
    case "Add":
      return group([printHubl(node.left), " + ", printHubl(node.right)]);
    case "In":
      return group([printHubl(node.left), " in ", printHubl(node.right)]);
    case "Output":
      return node.children.map((child) => {
        if (child.typename === "TemplateData") {
          return printHubl(child);
        }
        return ["{{ ", printHubl(child), " }}"];
      });
    case "NodeList":
      return node.children.map((child) => {
        return printHubl(child);
      });
    case "Array":
      return group([
        "[",
        indent([
          join(
            ",",
            node.children.map((child) => {
              return [line, printHubl(child)];
            })
          ),
        ]),
        softline,
        "]",
      ]);
    case "LookupVal":
      if (node.val.typename === "Literal") {
        return [printHubl(node.target), ".", node.val.value];
      }
      return [printHubl(node.target), "[", printHubl(node.val), "]"];
    case "Or":
      return [printHubl(node.left), " or ", printHubl(node.right)];
    case "Symbol":
      if (!node.value) {
        return "";
      }
      return node.value;
    case "TemplateData":
      const newLineRegex = /(\n)+/gm;
      if (newLineRegex.test(node.value)) {
        let parts = node.value.split("\n");
        return join(hardline, parts);
      }
      return node.value;
    case "Literal":
      if (node.value === null) {
        return "null";
      }
      if (typeof node.value === "string") {
        return util.makeString(node.value, '"');
      }
      return `${node.value}`;
    case "Filter":
      const leftHandSide = node.args.children.shift();
      const parts = [printHubl(leftHandSide), "|", printHubl(node.name)];
      if (node.args.children.length > 0) {
        parts.push(["(", join(", ", printHubl(node.args)), ")"]);
      }
      return parts;
    case "Compare":
      return group([
        printHubl(node.expr),
        " ",
        node.ops.map((op) => {
          return [op.type, " ", printHubl(op.expr)];
        }),
      ]);
    case "FunCall":
      return [
        printHubl(node.name),
        "(",
        join(
          ", ",
          node.args.children.map((arg) => {
            return printHubl(arg);
          })
        ),
        ")",
      ];
    case "Block":
      return [
        [
          openTag(node.whiteSpace.openTag),
          " block ",
          printHubl(node.name),
          " ",
          closeTag(node.whiteSpace.openTag),
          indent(printBody(node.body)),
          openTag(node.whiteSpace.closingTag),
          " endblock ",
          printHubl(node.name),
          " ",
          closeTag(node.whiteSpace.closingTag),
        ],
      ];
    case "Raw":
      return [
        group([
          openTag(node.whiteSpace.openTag),
          " raw ",
          closeTag(node.whiteSpace.openTag),
        ]),
        node.body,
        group([
          openTag(node.whiteSpace.closingTag),
          " endraw ",
          closeTag(node.whiteSpace.closingTag),
        ]),
      ];
    case "KeywordArgs":
      return [
        hardline,
        join(
          [",", hardline],
          node.children.map((kw) => {
            return group([kw.key.value, "=", printHubl(kw.value)]);
          })
        ),
      ];

    case "Dict":
      const dictParts: any[] = ["{"];
      dictParts.push(
        indent(
          join(
            ",",
            node.children.map((kw) => {
              return [hardline, printHubl(kw.key), ": ", printHubl(kw.value)];
            })
          )
        )
      );
      dictParts.push(hardline, "}");
      return dictParts;
    case "For":
      const forCol = node.colno;
      return [
        group([
          openTag(node.whiteSpace.openTag),
          " for ",
          printHubl(node.name),
          " in ",
          printHubl(node.arr),
          " ",
          closeTag(node.whiteSpace.openTag),
        ]),
        printHubl(node.body),
        openTag(node.whiteSpace.closingTag),
        " endfor ",
        closeTag(node.whiteSpace.closingTag),
      ];
    case "Macro":
      return [
        group([
          `{% macro `,
          group([
            printHubl(node.name),
            "(",
            join(
              ", ",
              node.args.children.map((arg) => {
                return printHubl(arg);
              })
            ),
            ")",
            " %}",
          ]),
        ]),
        indent(printBody(node.body)),
        group([`{% endmacro %}`]),
      ];
    case "Not":
      if (node.target.typename === "Is") {
        return [
          printHubl(node.target.left),
          " is not ",
          printHubl(node.target.right),
        ];
      }
      return ["not ", printHubl(node.target)];
    case "Group":
      return group([
        "(",
        // children is an array with no type information so it must be iterated on here
        node.children.map((child) => {
          return printHubl(child);
        }),
        ")",
      ]);
    case "Extends":
      return group([
        openTag(node.whiteSpace.openTag),
        " extends ",
        printHubl(node.template),
        " ",
        closeTag(node.whiteSpace.openTag),
      ]);
    case "Include":
      return group([
        openTag(node.whiteSpace.openTag),
        " include ",
        printHubl(node.template),
        " ",
        closeTag(node.whiteSpace.openTag),
      ]);
    default:
      if (node.type === "tag") {
        if (node.value) {
          if (node.value === "do") {
            return group(["{% do ", printHubl(node.children), " %}"]);
          }
          return group([
            `{% ${node.value}`,
            align(node.colno - 1, printTagArgs(node.children)),
            " %}",
          ]);
        } else {
          return group([
            "{% ",
            " ",
            align(node.colno - 1, printTagArgs(node.children)),
            " %}",
          ]);
        }
      } else if (node.type === "compound") {
        return node.children.map((child) => {
          if (typeof child === "string") {
            return child;
          }
          return printHubl(child);
        });
      } else if (node.type === "block_tag") {
        if (node.value === "comment") {
          return printComment(node);
        }
        return [
          group([
            `{% ${node.value}`,
            align(node.colno - 1, printTagArgs(node.children)),
            " %}",
          ]),
          indent(printBody(node.body)),
          group([`{% end_${node.value} %}`]),
        ];
      }
      return `unknown type: ${node.typename}`;
  }
}

function print(path, options, print) {
  const parsedArray = path.stack[0];

  return printHubl(parsedArray);
}
export default {
  "hubl-ast": {
    print,
  },
};
