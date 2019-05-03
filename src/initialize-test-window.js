/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const ipcHelpers = require('./ipc-helpers');

const cloneObject = function(object) {
  const clone = {};
  for (let key in object) { const value = object[key]; clone[key] = value; }
  return clone;
};

module.exports = function({blobStore}) {
  let getWindowLoadSettings, headless;
  const startCrashReporter = require('./crash-reporter-start');
  const {remote} = require('electron');

  startCrashReporter(); // Before anything else

  const exitWithStatusCode = function(status) {
    remote.app.emit('will-quit');
    return remote.process.exit(status);
  };

  try {
    let legacyTestRunnerPath, logFile, packageRoot, testPaths, testRunnerPath;
    const path = require('path');
    const {ipcRenderer} = require('electron');
    getWindowLoadSettings = require('./get-window-load-settings');
    const CompileCache = require('./compile-cache');
    const AtomEnvironment = require('../src/atom-environment');
    const ApplicationDelegate = require('../src/application-delegate');
    const Clipboard = require('../src/clipboard');
    const TextEditor = require('../src/text-editor');
    require('./electron-shims');

    ({testRunnerPath, legacyTestRunnerPath, headless, logFile, testPaths} = getWindowLoadSettings());

    if (!headless) {
      // Show window synchronously so a focusout doesn't fire on input elements
      // that are focused in the very first spec run.
      remote.getCurrentWindow().show();
    }

    const handleKeydown = function(event) {
      // Reload: cmd-r / ctrl-r
      if ((event.metaKey || event.ctrlKey) && (event.keyCode === 82)) {
        ipcHelpers.call('window-method', 'reload');
      }

      // Toggle Dev Tools: cmd-alt-i (Mac) / ctrl-shift-i (Linux/Windows)
      if ((event.keyCode === 73) && (
        ((process.platform === 'darwin') && event.metaKey && event.altKey) ||
        ((process.platform !== 'darwin') && event.ctrlKey && event.shiftKey))) {
          ipcHelpers.call('window-method', 'toggleDevTools');
        }

      // Close: cmd-w / ctrl-w
      if ((event.metaKey || event.ctrlKey) && (event.keyCode === 87)) {
        ipcHelpers.call('window-method', 'close');
      }

      // Copy: cmd-c / ctrl-c
      if ((event.metaKey || event.ctrlKey) && (event.keyCode === 67)) {
        return ipcHelpers.call('window-method', 'copy');
      }
    };

    window.addEventListener('keydown', handleKeydown, true);

    // Add 'exports' to module search path.
    const exportsPath = path.join(getWindowLoadSettings().resourcePath, 'exports');
    require('module').globalPaths.push(exportsPath);
    process.env.NODE_PATH = exportsPath; // Set NODE_PATH env variable since tasks may need it.

    // Set up optional transpilation for packages under test if any
    const FindParentDir = require('find-parent-dir');
    if (packageRoot = FindParentDir.sync(testPaths[0], 'package.json')) {
      const packageMetadata = require(path.join(packageRoot, 'package.json'));
      if (packageMetadata.atomTranspilers) {
        CompileCache.addTranspilerConfigForPath(packageRoot, packageMetadata.name, packageMetadata, packageMetadata.atomTranspilers);
      }
    }

    document.title = "Spec Suite";

    const clipboard = new Clipboard;
    TextEditor.setClipboard(clipboard);
    TextEditor.viewForItem = item => atom.views.getView(item);

    const testRunner = require(testRunnerPath);
    const legacyTestRunner = require(legacyTestRunnerPath);
    const buildDefaultApplicationDelegate = () => new ApplicationDelegate();
    const buildAtomEnvironment = function(params) {
      params = cloneObject(params);
      if (!params.hasOwnProperty("clipboard")) { params.clipboard = clipboard; }
      if (!params.hasOwnProperty("blobStore")) { params.blobStore = blobStore; }
      if (!params.hasOwnProperty("onlyLoadBaseStyleSheets")) { params.onlyLoadBaseStyleSheets = true; }
      const atomEnvironment = new AtomEnvironment(params);
      atomEnvironment.initialize(params);
      return atomEnvironment;
    };

    const promise = testRunner({
      logFile, headless, testPaths, buildAtomEnvironment, buildDefaultApplicationDelegate, legacyTestRunner
    });

    return promise.then(function(statusCode) {
      if (getWindowLoadSettings().headless) { return exitWithStatusCode(statusCode); }
    });
  } catch (error) {
    if (getWindowLoadSettings().headless) {
      console.error(error.stack != null ? error.stack : error);
      return exitWithStatusCode(1);
    } else {
      throw error;
    }
  }
};
