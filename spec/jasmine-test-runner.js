/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Grim = require('grim');
const fs = require('fs-plus');
const path = require('path');
const {ipcRenderer} = require('electron');

module.exports = function({logFile, headless, testPaths, buildAtomEnvironment}) {
  const object = require('../vendor/jasmine');
  for (let key in object) { const value = object[key]; window[key] = value; }
  require('jasmine-tagged');

  if (process.env.TEST_JUNIT_XML_PATH) {
    require('jasmine-reporters');
    jasmine.getEnv().addReporter(new jasmine.JUnitXmlReporter(process.env.TEST_JUNIT_XML_PATH, true, true));
  }

  // Allow document.title to be assigned in specs without screwing up spec window title
  let documentTitle = null;
  Object.defineProperty(document, 'title', {
    get() { return documentTitle; },
    set(title) { return documentTitle = title; }
  }
  );

  const ApplicationDelegate = require('../src/application-delegate');
  const applicationDelegate = new ApplicationDelegate();
  applicationDelegate.setRepresentedFilename = function() {};
  applicationDelegate.setWindowDocumentEdited = function() {};
  window.atom = buildAtomEnvironment({
    applicationDelegate, window, document,
    configDirPath: process.env.ATOM_HOME,
    enablePersistence: false
  });

  require('./spec-helper');
  if (process.env.JANKY_SHA1 || process.env.CI) { disableFocusMethods(); }
  for (let testPath of Array.from(testPaths)) { requireSpecs(testPath); }

  setSpecType('user');

  let resolveWithExitCode = null;
  const promise = new Promise(function(resolve, reject) { return resolveWithExitCode = resolve; });
  const jasmineEnv = jasmine.getEnv();
  jasmineEnv.addReporter(buildReporter({logFile, headless, resolveWithExitCode}));
  const TimeReporter = require('./time-reporter');
  jasmineEnv.addReporter(new TimeReporter());
  jasmineEnv.setIncludedTags([process.platform]);

  const jasmineContent = document.createElement('div');
  jasmineContent.setAttribute('id', 'jasmine-content');

  document.body.appendChild(jasmineContent);

  jasmineEnv.execute();
  return promise;
};

var disableFocusMethods = () =>
  ['fdescribe', 'ffdescribe', 'fffdescribe', 'fit', 'ffit', 'fffit'].forEach(function(methodName) {
    const focusMethod = window[methodName];
    return window[methodName] = function(description) {
      const error = new Error('Focused spec is running on CI');
      return focusMethod(description, function() { throw error; });
    };
  })
;

var requireSpecs = function(testPath, specType) {
  if (fs.isDirectorySync(testPath)) {
    return (() => {
      const result = [];
      for (let testFilePath of Array.from(fs.listTreeSync(testPath))) {
        if (/-spec\.(coffee|js)$/.test(testFilePath)) {
          require(testFilePath);
          // Set spec directory on spec for setting up the project in spec-helper
          result.push(setSpecDirectory(testPath));
        }
      }
      return result;
    })();
  } else {
    require(testPath);
    return setSpecDirectory(path.dirname(testPath));
  }
};

const setSpecField = function(name, value) {
  const specs = jasmine.getEnv().currentRunner().specs();
  if (specs.length === 0) { return; }
  return (() => {
    const result = [];
    for (let start = specs.length-1, index = start, asc = start <= 0; asc ? index <= 0 : index >= 0; asc ? index++ : index--) {
      if (specs[index][name] != null) { break; }
      result.push(specs[index][name] = value);
    }
    return result;
  })();
};

var setSpecType = specType => setSpecField('specType', specType);

var setSpecDirectory = specDirectory => setSpecField('specDirectory', specDirectory);

var buildReporter = function({logFile, headless, resolveWithExitCode}) {
  if (headless) {
    return buildTerminalReporter(logFile, resolveWithExitCode);
  } else {
    let reporter;
    const AtomReporter = require('./atom-reporter');
    return reporter = new AtomReporter();
  }
};

var buildTerminalReporter = function(logFile, resolveWithExitCode) {
  let logStream;
  if (logFile != null) { logStream = fs.openSync(logFile, 'w'); }
  const log = function(str) {
    if (logStream != null) {
      return fs.writeSync(logStream, str);
    } else {
      return ipcRenderer.send('write-to-stderr', str);
    }
  };

  const {TerminalReporter} = require('jasmine-tagged');
  return new TerminalReporter({
    print(str) {
      return log(str);
    },
    onComplete(runner) {
      if (logStream != null) { fs.closeSync(logStream); }
      if (Grim.getDeprecationsLength() > 0) {
        Grim.logDeprecations();
        resolveWithExitCode(1);
        return;
      }

      if (runner.results().failedCount > 0) {
        return resolveWithExitCode(1);
      } else {
        return resolveWithExitCode(0);
      }
    }
  });
};
