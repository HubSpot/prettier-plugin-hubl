// import nunjucks from "nunjucks";

type TemplateError = Error & {
  message: string;
  name: string;
  stack: string;
  cause: string;
};

export type RemoteExtensionContext = {
  tags: Array<string>;
  parse: (parser: ParserClass, nodes: Nodes, lexer: Lexer) => void;
};

export type Nodes = {
  Node: any;
  Root: any;
  NodeList: any;
  Value: any;
  Literal: any;
  Symbol: any;
  Group: any;
  Array: any;
  Pair: any;
  Dict: any;
  Output: any;
  Capture: any;
  TemplateData: any;
  If: any;
  IfAsync: any;
  InlineIf: any;
  For: any;
  AsyncEach: any;
  AsyncAll: any;
  Macro: any;
  Caller: any;
  Import: any;
  FromImport: any;
  FunCall: any;
  Filter: any;
  FilterAsync: any;
  KeywordArgs: any;
  Block: any;
  Super: any;
  Extends: any;
  Include: any;
  Set: any;
  Switch: any;
  Case: any;
  LookupVal: any;
  BinOp: any;
  In: any;
  Is: any;
  Or: any;
  And: any;
  Not: any;
  Add: any;
  Concat: any;
  Sub: any;
  Mul: any;
  Div: any;
  FloorDiv: any;
  Mod: any;
  Pow: any;
  Neg: any;
  Pos: any;
  Compare: any;
  CompareOperand: any;
  CallExtension: any;
  CallExtensionAsync: any;
};

export type Lexer = {
  lex: Function;
  TOKEN_STRING: "string";
  TOKEN_WHITESPACE: "whitespace";
  TOKEN_DATA: "data";
  TOKEN_BLOCK_START: "block-start";
  TOKEN_BLOCK_END: "block-end";
  TOKEN_VARIABLE_START: "variable-start";
  TOKEN_VARIABLE_END: "variable-end";
  TOKEN_COMMENT: "comment";
  TOKEN_LEFT_PAREN: "left-paren";
  TOKEN_RIGHT_PAREN: "right-paren";
  TOKEN_LEFT_BRACKET: "left-bracket";
  TOKEN_RIGHT_BRACKET: "right-bracket";
  TOKEN_LEFT_CURLY: "left-curly";
  TOKEN_RIGHT_CURLY: "right-curly";
  TOKEN_OPERATOR: "operator";
  TOKEN_COMMA: "comma";
  TOKEN_COLON: "colon";
  TOKEN_TILDE: "tilde";
  TOKEN_PIPE: "pipe";
  TOKEN_INT: "int";
  TOKEN_FLOAT: "float";
  TOKEN_BOOLEAN: "boolean";
  TOKEN_NONE: "none";
  TOKEN_SYMBOL: "symbol";
  TOKEN_SPECIAL: "special";
  TOKEN_REGEX: "regex";
};

type SymbolType = string;

type Obj = {
  constructor: (...args: Array<any>) => void;
  init: () => void;
  typeName: string;
  extend: (name: string, props: any) => any;
};

type NodeChild = {
  lineno: number;
  colno: number;
  whiteSpace?: object;
  value?: NodeChild | string;
  name?: NodeChild;
  body?: NodeChild;
  children?: Array<NodeChild>;
  targets?: Array<NodeChild>;
  cond?: NodeChild;
  else_?: NodeChild;
  arr?: NodeChild;
  args?: NodeChild;
  type?: string;
  extName?: any;
  contentArgs?: any;
};

export type Token = NodeChild;

export type NodeType = Obj & {
  init: (lineno: number, colno: number, ...args) => void;
  findAll: (type: SymbolType, results?: Array<Obj>) => Array<Obj>;
  iterFields: (func: Function) => void;
  forEach: any;
  printNodes: any;
  children: Array<NodeChild>;
  lineno: number;
  colno: number;
  type?: string;
  value?: any;
};

type TagName =
  | "raw"
  | "verbatim"
  | "if"
  | "ifAsync"
  | "for"
  | "asyncEach"
  | "asyncAll"
  | "block"
  | "extends"
  | "include"
  | "set"
  | "macro"
  | "call"
  | "import"
  | "from"
  | "filter"
  | "switch";

export type ParserClass = {
  constructor: (text?: string) => void;
  tokens: Token;
  init: (tokens: Token) => void;
  nextToken: (withWhitespace?: boolean) => Token;
  peekToken: () => Token;
  pushToken: (token: Token) => void;
  error: (message: string, lineno: number, colno: number) => TemplateError;
  fail: (message: string, lineno: number, colno: number) => void;
  skip: (type: SymbolType) => boolean;
  expect: (type: SymbolType) => Token;
  skipValue: (type: SymbolType, value: string) => boolean;
  skipSymbol: (val: string) => boolean;
  advanceAfterBlockEnd: (name?: string) => Token;
  advanceAfterVariableEnd: () => void;
  parseFor: () => NodeType;
  parseMacro: () => NodeType;
  parseCall: () => NodeType;
  parseWithContext: () => boolean;
  parseImport: () => NodeType;
  parseFrom: () => NodeType;
  parseBlock: () => NodeType;
  parseExtends: () => NodeType;
  parseInclude: () => NodeType;
  parseIf: () => NodeType;
  parseSet: () => NodeType;
  parseSwitch: () => NodeType;
  parseStatement: () => NodeType;
  parseRaw: (tagName: TagName) => NodeType;
  parsePostfix: (node: NodeType) => NodeType;
  parseExpression: () => NodeType;
  parseInlineIf: () => NodeType;
  parseOr: () => NodeType;
  parseAnd: () => NodeType;
  parseNot: () => NodeType;
  parseIn: () => NodeType;
  parseIs: () => NodeType;
  parseCompare: () => NodeType;
  parseConcat: () => NodeType;
  parseAdd: () => NodeType;
  parseSub: () => NodeType;
  parseMul: () => NodeType;
  parseDiv: () => NodeType;
  parseFloorDiv: () => NodeType;
  parseMod: () => NodeType;
  parsePow: () => NodeType;
  parseUnary: (noFilters?: boolean) => NodeType;
  parsePrimary: (noPostfix?: boolean) => NodeType;
  parseFilterName: () => NodeType;
  parseFilterArgs: (node: NodeType) => Array<NodeType>;
  parseFilter: (node: NodeType) => NodeType;
  parseFiterStatement: () => NodeType;
  parseAggregate: () => NodeType;
  parseSignature: (tolerant?: boolean, noParens?: boolean) => Array<NodeType>;
  parseUntilBlocks: (...blockNames: Array<string>) => NodeType;
  parseNodes: () => Array<NodeType>;
  parse: () => Array<NodeType>;
  parseAsRoot: () => NodeType;
  dropLeadingWhitespace: boolean;
};

declare type ParserClassDef<T = ParserClass> = new (...args: any[]) => T;

export type Parser = {
  parse: (src: string, extensions?: Array<any>, opts?: any) => NodeType;
  Parser: ParserClassDef;
};

export type NunjucksPlaceholder = any;
