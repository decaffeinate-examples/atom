/** @babel */
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path')
const fs = require('fs-plus')

// # Platform specific helpers
module.exports = {
  // Public: Returns true if being run from within Windows
  isWindows () {
    return !!process.platform.match(/^win/)
  },

  // Public: Some files can not exist on Windows filesystems, so we have to
  // selectively generate our fixtures.
  //
  // Returns nothing.
  generateEvilFiles () {
    let filenames
    const evilFilesPath = path.join(__dirname, 'fixtures', 'evil-files')
    if (fs.existsSync(evilFilesPath)) { fs.removeSync(evilFilesPath) }
    fs.mkdirSync(evilFilesPath)

    if (this.isWindows()) {
      filenames = [
        'a_file_with_utf8.txt',
        'file with spaces.txt',
        'utfa\u0306.md'
      ]
    } else {
      filenames = [
        'a_file_with_utf8.txt',
        'file with spaces.txt',
        'goddam\nnewlines',
        'quote".txt',
        'utfa\u0306.md'
      ]
    }

    return Array.from(filenames).map((filename) =>
      fs.writeFileSync(path.join(evilFilesPath, filename), 'evil file!', { flag: 'w' }))
  }
}
