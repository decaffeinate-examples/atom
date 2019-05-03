/** @babel */
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
// Using clipboard in renderer process is not safe on Linux.
module.exports =
  (process.platform === 'linux') && (process.type === 'renderer')
    ? require('electron').remote.clipboard
    : require('electron').clipboard
