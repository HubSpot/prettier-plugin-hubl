"use strict";

// A simple class system, more documentation to come
import EventEmitter from "events";

function parentWrap(parent, prop) {
  if (typeof parent !== "function" || typeof prop !== "function") {
    return prop;
  }
  return function wrap() {
    // Save the current parent method
    const tmp = this.parent;

    // Set parent to the previous method, call, and restore
    this.parent = parent;
    const res = prop.apply(this, arguments);
    this.parent = tmp;
    return res;
  };
}

function extendClass(cls, name, props = {}) {
  Object.keys(props).forEach((k) => {
    props[k] = parentWrap(cls.prototype[k], props[k]);
  });

  class subclass extends cls {
    get typename() {
      return name;
    }
  }

  Object.assign(subclass.prototype, props);
  return subclass;
}

export class Obj {
  constructor(...args) {
    // Unfortunately necessary for backwards compatibility
    this.init(...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  init() {}

  get typename() {
    return this.constructor.name;
  }

  static extend(name, props) {
    if (typeof name === "object") {
      props = name;
      name = "anonymous";
    }
    return extendClass(this, name, props);
  }
}

export class EmitterObj extends EventEmitter {
  constructor(...args) {
    super();
    // Unfortunately necessary for backwards compatibility
    this.init(...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  init() {}

  get typename() {
    return this.constructor.name;
  }

  static extend(name, props) {
    if (typeof name === "object") {
      props = name;
      name = "anonymous";
    }
    return extendClass(this, name, props);
  }
}
