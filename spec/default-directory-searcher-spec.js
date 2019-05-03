/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const DefaultDirectorySearcher = require('../src/default-directory-searcher')
const Task = require('../src/task')
const path = require('path')

describe('DefaultDirectorySearcher', function () {
  let [searcher, dirPath] = Array.from([])

  beforeEach(function () {
    dirPath = path.resolve(__dirname, 'fixtures', 'dir')
    return searcher = new DefaultDirectorySearcher()
  })

  return it('terminates the task after running a search', function () {
    const options = {
      ignoreCase: false,
      includeHidden: false,
      excludeVcsIgnores: true,
      inclusions: [],
      globalExclusions: ['a-dir'],
      didMatch () {},
      didError () {},
      didSearchPaths () {}
    }
    const searchPromise = searcher.search([{ getPath () { return dirPath } }], /abcdefg/, options)
    spyOn(Task.prototype, 'terminate').andCallThrough()

    waitsForPromise(() => searchPromise)

    return runs(() => expect(Task.prototype.terminate).toHaveBeenCalled())
  })
})
