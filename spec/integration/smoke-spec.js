/** @babel */
/* eslint-disable
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const fs = require('fs-plus')
const path = require('path')
const season = require('season')
const temp = require('temp').track()
const runAtom = require('./helpers/start-atom')

describe('Smoke Test', function () {
  if (process.platform !== 'darwin') { return } // Fails on win32

  const atomHome = temp.mkdirSync('atom-home')

  beforeEach(function () {
    jasmine.useRealClock()
    return season.writeFileSync(path.join(atomHome, 'config.cson'), {
      '*': {
        welcome: { showOnStartup: false },
        core: {
          telemetryConsent: 'no',
          disabledPackages: ['github']
        }
      }
    })
  })

  return it('can open a file in Atom and perform basic operations on it', function () {
    const tempDirPath = temp.mkdirSync('empty-dir')
    return runAtom([path.join(tempDirPath, 'new-file')], { ATOM_HOME: atomHome }, client =>
      client
        .treeViewRootDirectories()
        .then(({ value }) => expect(value).toEqual([tempDirPath]))
        .waitForExist('atom-text-editor', 5000)
        .then(exists => expect(exists).toBe(true))
        .waitForPaneItemCount(1, 1000)
        .click('atom-text-editor')
        .waitUntil(function () { return this.execute(() => document.activeElement.closest('atom-text-editor')) }, 5000)
        .keys('Hello!')
        .execute(() => atom.workspace.getActiveTextEditor().getText())
        .then(({ value }) => expect(value).toBe('Hello!'))
        .dispatchCommand('editor:delete-line')
    )
  })
})
