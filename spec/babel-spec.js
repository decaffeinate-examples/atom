/** @babel */
/* eslint-disable
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Users may have this environment variable set. Currently, it causes babel to
// log to stderr, which causes errors on Windows.
// See https://github.com/atom/electron/issues/2033
process.env.DEBUG = '*'

const path = require('path')
const temp = require('temp').track()
const CompileCache = require('../src/compile-cache')

describe('Babel transpiler support', function () {
  let originalCacheDir = null

  beforeEach(function () {
    originalCacheDir = CompileCache.getCacheDirectory()
    CompileCache.setCacheDirectory(temp.mkdirSync('compile-cache'))
    return (() => {
      const result = []
      for (let cacheKey of Array.from(Object.keys(require.cache))) {
        if (cacheKey.startsWith(path.join(__dirname, 'fixtures', 'babel'))) {
          result.push(delete require.cache[cacheKey])
        } else {
          result.push(undefined)
        }
      }
      return result
    })()
  })

  afterEach(function () {
    CompileCache.setCacheDirectory(originalCacheDir)
    return temp.cleanupSync()
  })

  describe('when a .js file starts with /** @babel */;', () =>
    it('transpiles it using babel', function () {
      const transpiled = require('./fixtures/babel/babel-comment.js')
      return expect(transpiled(3)).toBe(4)
    })
  )

  describe("when a .js file starts with 'use babel';", () =>
    it('transpiles it using babel', function () {
      const transpiled = require('./fixtures/babel/babel-single-quotes.js')
      return expect(transpiled(3)).toBe(4)
    })
  )

  describe('when a .js file starts with "use babel";', () =>
    it('transpiles it using babel', function () {
      const transpiled = require('./fixtures/babel/babel-double-quotes.js')
      return expect(transpiled(3)).toBe(4)
    })
  )

  describe('when a .js file starts with /* @flow */', () =>
    it('transpiles it using babel', function () {
      const transpiled = require('./fixtures/babel/flow-comment.js')
      return expect(transpiled(3)).toBe(4)
    })
  )

  return describe("when a .js file does not start with 'use babel';", function () {
    it('does not transpile it using babel', function () {
      spyOn(console, 'error')
      return expect(() => require('./fixtures/babel/invalid.js')).toThrow()
    })

    return it('does not try to log to stdout or stderr while parsing the file', function () {
      spyOn(process.stderr, 'write')
      spyOn(process.stdout, 'write')

      const transpiled = require('./fixtures/babel/babel-double-quotes.js')

      expect(process.stdout.write).not.toHaveBeenCalled()
      return expect(process.stderr.write).not.toHaveBeenCalled()
    })
  })
})
