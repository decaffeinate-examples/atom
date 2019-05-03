/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let CommandInstaller;
const path = require('path');
const fs = require('fs-plus');
let runas = null; // defer until used

const symlinkCommand = (sourcePath, destinationPath, callback) =>
  fs.unlink(destinationPath, function(error) {
    if ((error != null) && ((error != null ? error.code : undefined) !== 'ENOENT')) {
      return callback(error);
    } else {
      return fs.makeTree(path.dirname(destinationPath), function(error) {
        if (error != null) {
          return callback(error);
        } else {
          return fs.symlink(sourcePath, destinationPath, callback);
        }
      });
    }
  })
;

const symlinkCommandWithPrivilegeSync = function(sourcePath, destinationPath) {
  if (runas == null) { runas = require('runas'); }
  if (runas('/bin/rm', ['-f', destinationPath], {admin: true}) !== 0) {
    throw new Error(`Failed to remove '${destinationPath}'`);
  }

  if (runas('/bin/mkdir', ['-p', path.dirname(destinationPath)], {admin: true}) !== 0) {
    throw new Error(`Failed to create directory '${destinationPath}'`);
  }

  if (runas('/bin/ln', ['-s', sourcePath, destinationPath], {admin: true}) !== 0) {
    throw new Error(`Failed to symlink '${sourcePath}' to '${destinationPath}'`);
  }
};

module.exports =
(CommandInstaller = class CommandInstaller {
  constructor(applicationDelegate) {
    this.applicationDelegate = applicationDelegate;
  }

  initialize(appVersion) {
    this.appVersion = appVersion;
  }

  getInstallDirectory() {
    return "/usr/local/bin";
  }

  getResourcesDirectory() {
    return process.resourcesPath;
  }

  installShellCommandsInteractively() {
    const showErrorDialog = error => {
      return this.applicationDelegate.confirm({
        message: "Failed to install shell commands",
        detailedMessage: error.message
      });
    };

    return this.installAtomCommand(true, error => {
      if (error != null) {
        return showErrorDialog(error);
      } else {
        return this.installApmCommand(true, error => {
          if (error != null) {
            return showErrorDialog(error);
          } else {
            return this.applicationDelegate.confirm({
              message: "Commands installed.",
              detailedMessage: "The shell commands `atom` and `apm` are installed."
            });
          }
        });
      }
    });
  }

  installAtomCommand(askForPrivilege, callback) {
    const programName = this.appVersion.includes("beta") ?
      "atom-beta"
    :
      "atom";

    const commandPath = path.join(this.getResourcesDirectory(), 'app', 'atom.sh');
    return this.createSymlink(commandPath, programName, askForPrivilege, callback);
  }

  installApmCommand(askForPrivilege, callback) {
    const programName = this.appVersion.includes("beta") ?
      "apm-beta"
    :
      "apm";

    const commandPath = path.join(this.getResourcesDirectory(), 'app', 'apm', 'node_modules', '.bin', 'apm');
    return this.createSymlink(commandPath, programName, askForPrivilege, callback);
  }

  createSymlink(commandPath, commandName, askForPrivilege, callback) {
    if (process.platform !== 'darwin') { return; }

    const destinationPath = path.join(this.getInstallDirectory(), commandName);

    return fs.readlink(destinationPath, function(error, realpath) {
      if (realpath === commandPath) {
        callback();
        return;
      }

      return symlinkCommand(commandPath, destinationPath, function(error) {
        if (askForPrivilege && ((error != null ? error.code : undefined) === 'EACCES')) {
          try {
            error = null;
            symlinkCommandWithPrivilegeSync(commandPath, destinationPath);
          } catch (err) {
            error = err;
          }
        }

        return (typeof callback === 'function' ? callback(error) : undefined);
      });
    });
  }
});
