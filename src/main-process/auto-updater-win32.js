/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const {EventEmitter} = require('events');
const SquirrelUpdate = require('./squirrel-update');

class AutoUpdater {
  static initClass() {
    Object.assign(this.prototype, EventEmitter.prototype);
  }

  setFeedURL(updateUrl) {
    this.updateUrl = updateUrl;
  }

  quitAndInstall() {
    if (SquirrelUpdate.existsSync()) {
      return SquirrelUpdate.restartAtom(require('electron').app);
    } else {
      return require('electron').autoUpdater.quitAndInstall();
    }
  }

  downloadUpdate(callback) {
    return SquirrelUpdate.spawn(['--download', this.updateUrl], function(error, stdout) {
      let update;
      if (error != null) { return callback(error); }

      try {
        // Last line of output is the JSON details about the releases
        const json = stdout.trim().split('\n').pop();
        update = __guardMethod__(__guard__(JSON.parse(json), x => x.releasesToApply), 'pop', o => o.pop());
      } catch (error1) {
        error = error1;
        error.stdout = stdout;
        return callback(error);
      }

      return callback(null, update);
    });
  }

  installUpdate(callback) {
    return SquirrelUpdate.spawn(['--update', this.updateUrl], callback);
  }

  supportsUpdates() {
    return SquirrelUpdate.existsSync();
  }

  checkForUpdates() {
    if (!this.updateUrl) { throw new Error('Update URL is not set'); }

    this.emit('checking-for-update');

    if (!SquirrelUpdate.existsSync()) {
      this.emit('update-not-available');
      return;
    }

    return this.downloadUpdate((error, update) => {
      if (error != null) {
        this.emit('update-not-available');
        return;
      }

      if (update == null) {
        this.emit('update-not-available');
        return;
      }

      this.emit('update-available');

      return this.installUpdate(error => {
        if (error != null) {
          this.emit('update-not-available');
          return;
        }

        return this.emit('update-downloaded', {}, update.releaseNotes, update.version, new Date(), 'https://atom.io', () => this.quitAndInstall());
      });
    });
  }
}
AutoUpdater.initClass();

module.exports = new AutoUpdater();

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}