/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
describe("TypeScript transpiler support", function() {
  describe("when there is a .ts file", () =>
    it("transpiles it using typescript", function() {
      const transpiled = require('./fixtures/typescript/valid.ts');
      return expect(transpiled(3)).toBe(4);
    })
  );

  return describe("when the .ts file is invalid", () =>
    it("does not transpile", () => expect(() => require('./fixtures/typescript/invalid.ts')).toThrow())
  );
});
