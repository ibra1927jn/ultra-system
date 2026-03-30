export default [
  {
    files: ["**/*.js"],
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-empty": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        Promise: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      }
    }
  },
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "*.min.js"]
  }
];
