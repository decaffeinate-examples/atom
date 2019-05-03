/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let StorageFolder;
const path = require("path");
const fs = require("fs-plus");

module.exports =
(StorageFolder = class StorageFolder {
  constructor(containingPath) {
    if (containingPath != null) { this.path = path.join(containingPath, "storage"); }
  }

  clear() {
    if (this.path == null) { return; }

    try {
      return fs.removeSync(this.path);
    } catch (error) {
      return console.warn(`Error deleting ${this.path}`, error.stack, error);
    }
  }

  storeSync(name, object) {
    if (this.path == null) { return; }

    return fs.writeFileSync(this.pathForKey(name), JSON.stringify(object), 'utf8');
  }

  load(name) {
    let error, stateString;
    if (this.path == null) { return; }

    const statePath = this.pathForKey(name);
    try {
      stateString = fs.readFileSync(statePath, 'utf8');
    } catch (error1) {
      error = error1;
      if (error.code !== 'ENOENT') {
        console.warn(`Error reading state file: ${statePath}`, error.stack, error);
      }
      return undefined;
    }

    try {
      return JSON.parse(stateString);
    } catch (error2) {
      error = error2;
      return console.warn(`Error parsing state file: ${statePath}`, error.stack, error);
    }
  }

  pathForKey(name) { return path.join(this.getPath(), name); }
  getPath() { return this.path; }
});
