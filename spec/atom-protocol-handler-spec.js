/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
describe('"atom" protocol URL', () =>
  it('sends the file relative in the package as response', function() {
    let called = false;
    const request = new XMLHttpRequest();
    request.addEventListener('load', () => called = true);
    request.open('GET', 'atom://async/package.json', true);
    request.send();

    return waitsFor('request to be done', () => called === true);
  })
);
