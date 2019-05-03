/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const BufferedNodeProcess = require('../src/buffered-node-process');

describe("BufferedNodeProcess", function() {
  it("executes the script in a new process", function() {
    const exit = jasmine.createSpy('exitCallback');
    let output = '';
    const stdout = lines => output += lines;
    let error = '';
    const stderr = lines => error += lines;
    const args = ['hi'];
    const command = path.join(__dirname, 'fixtures', 'script.js');

    new BufferedNodeProcess({command, args, stdout, stderr, exit});

    waitsFor(() => exit.callCount === 1);

    return runs(function() {
      expect(output).toBe('hi');
      expect(error).toBe('');
      return expect(args).toEqual(['hi']);});
});

  return it("suppresses deprecations in the new process", function() {
    const exit = jasmine.createSpy('exitCallback');
    let output = '';
    const stdout = lines => output += lines;
    let error = '';
    const stderr = lines => error += lines;
    const command = path.join(__dirname, 'fixtures', 'script-with-deprecations.js');

    new BufferedNodeProcess({command, stdout, stderr, exit});

    waitsFor(() => exit.callCount === 1);

    return runs(function() {
      expect(output).toBe('hi');
      return expect(error).toBe('');
    });
  });
});
