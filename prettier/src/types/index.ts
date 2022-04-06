export type Node = {
  lineno: number;
  colno: number;
  value?: Node | string;
  name?: Node;
  body?: Node;
  children?: Array<Node>;
  targets?: Array<Node>;
  cond?: Node;
  else_?: Node;
  arr?: Node;
  args?: Node;
  type?: string;
  extName?: any;
  contentArgs?: any;
};
