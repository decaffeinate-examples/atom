/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const DefaultDirectoryProvider = require('../src/default-directory-provider')
const path = require('path')
const fs = require('fs-plus')
const temp = require('temp').track()

describe('DefaultDirectoryProvider', function () {
  let tmp = null

  beforeEach(() => tmp = temp.mkdirSync('atom-spec-default-dir-provider'))

  afterEach(() => temp.cleanupSync())

  describe('.directoryForURISync(uri)', function () {
    it('returns a Directory with a path that matches the uri', function () {
      const provider = new DefaultDirectoryProvider()

      const directory = provider.directoryForURISync(tmp)
      return expect(directory.getPath()).toEqual(tmp)
    })

    it('normalizes its input before creating a Directory for it', function () {
      const provider = new DefaultDirectoryProvider()
      const nonNormalizedPath = tmp + path.sep + '..' + path.sep + path.basename(tmp)
      expect(tmp.includes('..')).toBe(false)
      expect(nonNormalizedPath.includes('..')).toBe(true)

      const directory = provider.directoryForURISync(nonNormalizedPath)
      return expect(directory.getPath()).toEqual(tmp)
    })

    it('normalizes disk drive letter in path on #win32', function () {
      const provider = new DefaultDirectoryProvider()
      const nonNormalizedPath = tmp[0].toLowerCase() + tmp.slice(1)
      expect(tmp).not.toMatch(/^[a-z]:/)
      expect(nonNormalizedPath).toMatch(/^[a-z]:/)

      const directory = provider.directoryForURISync(nonNormalizedPath)
      return expect(directory.getPath()).toEqual(tmp)
    })

    it('creates a Directory for its parent dir when passed a file', function () {
      const provider = new DefaultDirectoryProvider()
      const file = path.join(tmp, 'example.txt')
      fs.writeFileSync(file, 'data')

      const directory = provider.directoryForURISync(file)
      return expect(directory.getPath()).toEqual(tmp)
    })

    return it('creates a Directory with a path as a uri when passed a uri', function () {
      const provider = new DefaultDirectoryProvider()
      const uri = 'remote://server:6792/path/to/a/dir'
      const directory = provider.directoryForURISync(uri)
      return expect(directory.getPath()).toEqual(uri)
    })
  })

  return describe('.directoryForURI(uri)', () =>
    it('returns a Promise that resolves to a Directory with a path that matches the uri', function () {
      const provider = new DefaultDirectoryProvider()

      return waitsForPromise(() =>
        provider.directoryForURI(tmp).then(directory => expect(directory.getPath()).toEqual(tmp))
      )
    })
  )
})
