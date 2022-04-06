import prettier from "prettier";

const code = `<div>{% form "my_form" label="My Form", custom_form_html=None, no_title=False,title="", test1=None, test2=False,title="", test3=None, test4=False,title="" %}{% form "my_form2" label="My Form", custom_form_html=None, no_title=False,title="", test1=None, test2=False,title="", test3=None, test4=False,title="" %}</div>`;
console.log(
  "output:",
  prettier.format(code, {
    parser: "hubl",
    plugins: ["./src/index.ts"]
  }) || "empty string"
);
