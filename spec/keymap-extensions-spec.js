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
const path = require('path')
const temp = require('temp').track()
const CSON = require('season')
const fs = require('fs-plus')

describe('keymap-extensions', function () {
  beforeEach(function () {
    atom.keymaps.configDirPath = temp.path('atom-spec-keymap-ext')
    fs.writeFileSync(atom.keymaps.getUserKeymapPath(), '#')
    this.userKeymapLoaded = function () {}
    return atom.keymaps.onDidLoadUserKeymap(() => this.userKeymapLoaded())
  })

  afterEach(function () {
    fs.removeSync(atom.keymaps.configDirPath)
    return atom.keymaps.destroy()
  })

  return describe('did-load-user-keymap', () =>

    it('fires when user keymap is loaded', function () {
      spyOn(this, 'userKeymapLoaded')
      atom.keymaps.loadUserKeymap()
      return expect(this.userKeymapLoaded).toHaveBeenCalled()
    })
  )
})
