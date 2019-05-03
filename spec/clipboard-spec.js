/** @babel */
/* eslint-disable
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
describe('Clipboard', () =>
  describe('write(text, metadata) and read()', function () {
    it('writes and reads text to/from the native clipboard', function () {
      expect(atom.clipboard.read()).toBe('initial clipboard content')
      atom.clipboard.write('next')
      return expect(atom.clipboard.read()).toBe('next')
    })

    return it('returns metadata if the item on the native clipboard matches the last written item', function () {
      atom.clipboard.write('next', { meta: 'data' })
      expect(atom.clipboard.read()).toBe('next')
      expect(atom.clipboard.readWithMetadata().text).toBe('next')
      return expect(atom.clipboard.readWithMetadata().metadata).toEqual({ meta: 'data' })
    })
  })
)
