/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ThemeManager;
const path = require('path');
const _ = require('underscore-plus');
const {Emitter, CompositeDisposable} = require('event-kit');
const {File} = require('pathwatcher');
const fs = require('fs-plus');
const LessCompileCache = require('./less-compile-cache');

// Extended: Handles loading and activating available themes.
//
// An instance of this class is always available as the `atom.themes` global.
module.exports =
(ThemeManager = class ThemeManager {
  constructor({packageManager, config, styleManager, notificationManager, viewRegistry}) {
    this.packageManager = packageManager;
    this.config = config;
    this.styleManager = styleManager;
    this.notificationManager = notificationManager;
    this.viewRegistry = viewRegistry;
    this.emitter = new Emitter;
    this.styleSheetDisposablesBySourcePath = {};
    this.lessCache = null;
    this.initialLoadComplete = false;
    this.packageManager.registerPackageActivator(this, ['theme']);
    this.packageManager.onDidActivateInitialPackages(() => {
      return this.onDidChangeActiveThemes(() => this.packageManager.reloadActivePackageStyleSheets());
    });
  }

  initialize({resourcePath, configDirPath, safeMode, devMode}) {
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;
    this.safeMode = safeMode;
    this.lessSourcesByRelativeFilePath = null;
    if (devMode || (typeof snapshotAuxiliaryData === 'undefined')) {
      this.lessSourcesByRelativeFilePath = {};
      return this.importedFilePathsByRelativeImportPath = {};
    } else {
      this.lessSourcesByRelativeFilePath = snapshotAuxiliaryData.lessSourcesByRelativeFilePath;
      return this.importedFilePathsByRelativeImportPath = snapshotAuxiliaryData.importedFilePathsByRelativeImportPath;
    }
  }

  /*
  Section: Event Subscription
  */

  // Essential: Invoke `callback` when style sheet changes associated with
  // updating the list of active themes have completed.
  //
  // * `callback` {Function}
  onDidChangeActiveThemes(callback) {
    return this.emitter.on('did-change-active-themes', callback);
  }

  /*
  Section: Accessing Available Themes
  */

  getAvailableNames() {
    // TODO: Maybe should change to list all the available themes out there?
    return this.getLoadedNames();
  }

  /*
  Section: Accessing Loaded Themes
  */

  // Public: Returns an {Array} of {String}s of all the loaded theme names.
  getLoadedThemeNames() {
    return Array.from(this.getLoadedThemes()).map((theme) => theme.name);
  }

  // Public: Returns an {Array} of all the loaded themes.
  getLoadedThemes() {
    return (() => {
      const result = [];
      for (let pack of Array.from(this.packageManager.getLoadedPackages())) {         if (pack.isTheme()) {
          result.push(pack);
        }
      }
      return result;
    })();
  }

  /*
  Section: Accessing Active Themes
  */

  // Public: Returns an {Array} of {String}s all the active theme names.
  getActiveThemeNames() {
    return Array.from(this.getActiveThemes()).map((theme) => theme.name);
  }

  // Public: Returns an {Array} of all the active themes.
  getActiveThemes() {
    return (() => {
      const result = [];
      for (let pack of Array.from(this.packageManager.getActivePackages())) {         if (pack.isTheme()) {
          result.push(pack);
        }
      }
      return result;
    })();
  }

  activatePackages() { return this.activateThemes(); }

  /*
  Section: Managing Enabled Themes
  */

  warnForNonExistentThemes() {
    let left;
    let themeNames = (left = this.config.get('core.themes')) != null ? left : [];
    if (!_.isArray(themeNames)) { themeNames = [themeNames]; }
    return (() => {
      const result = [];
      for (let themeName of Array.from(themeNames)) {
        if (!themeName || (typeof themeName !== 'string') || !this.packageManager.resolvePackagePath(themeName)) {
          result.push(console.warn(`Enabled theme '${themeName}' is not installed.`));
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  }

  // Public: Get the enabled theme names from the config.
  //
  // Returns an array of theme names in the order that they should be activated.
  getEnabledThemeNames() {
    let left;
    let themeNames = (left = this.config.get('core.themes')) != null ? left : [];
    if (!_.isArray(themeNames)) { themeNames = [themeNames]; }
    themeNames = themeNames.filter(themeName => {
      if (themeName && (typeof themeName === 'string')) {
        if (this.packageManager.resolvePackagePath(themeName)) { return true; }
      }
      return false;
    });

    // Use a built-in syntax and UI theme any time the configured themes are not
    // available.
    if (themeNames.length < 2) {
      const builtInThemeNames = [
        'atom-dark-syntax',
        'atom-dark-ui',
        'atom-light-syntax',
        'atom-light-ui',
        'base16-tomorrow-dark-theme',
        'base16-tomorrow-light-theme',
        'solarized-dark-syntax',
        'solarized-light-syntax'
      ];
      themeNames = _.intersection(themeNames, builtInThemeNames);
      if (themeNames.length === 0) {
        themeNames = ['atom-dark-syntax', 'atom-dark-ui'];
      } else if (themeNames.length === 1) {
        if (_.endsWith(themeNames[0], '-ui')) {
          themeNames.unshift('atom-dark-syntax');
        } else {
          themeNames.push('atom-dark-ui');
        }
      }
    }

    // Reverse so the first (top) theme is loaded after the others. We want
    // the first/top theme to override later themes in the stack.
    return themeNames.reverse();
  }

  /*
  Section: Private
  */

  // Resolve and apply the stylesheet specified by the path.
  //
  // This supports both CSS and Less stylsheets.
  //
  // * `stylesheetPath` A {String} path to the stylesheet that can be an absolute
  //   path or a relative path that will be resolved against the load path.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to remove the
  // required stylesheet.
  requireStylesheet(stylesheetPath, priority, skipDeprecatedSelectorsTransformation) {
    let fullPath;
    if (fullPath = this.resolveStylesheet(stylesheetPath)) {
      const content = this.loadStylesheet(fullPath);
      return this.applyStylesheet(fullPath, content, priority, skipDeprecatedSelectorsTransformation);
    } else {
      throw new Error(`Could not find a file at path '${stylesheetPath}'`);
    }
  }

  unwatchUserStylesheet() {
    if (this.userStylsheetSubscriptions != null) {
      this.userStylsheetSubscriptions.dispose();
    }
    this.userStylsheetSubscriptions = null;
    this.userStylesheetFile = null;
    if (this.userStyleSheetDisposable != null) {
      this.userStyleSheetDisposable.dispose();
    }
    return this.userStyleSheetDisposable = null;
  }

  loadUserStylesheet() {
    let userStylesheetContents;
    this.unwatchUserStylesheet();

    const userStylesheetPath = this.styleManager.getUserStyleSheetPath();
    if (!fs.isFileSync(userStylesheetPath)) { return; }

    try {
      this.userStylesheetFile = new File(userStylesheetPath);
      this.userStylsheetSubscriptions = new CompositeDisposable();
      const reloadStylesheet = () => this.loadUserStylesheet();
      this.userStylsheetSubscriptions.add(this.userStylesheetFile.onDidChange(reloadStylesheet));
      this.userStylsheetSubscriptions.add(this.userStylesheetFile.onDidRename(reloadStylesheet));
      this.userStylsheetSubscriptions.add(this.userStylesheetFile.onDidDelete(reloadStylesheet));
    } catch (error) {
      const message = `\
Unable to watch path: \`${path.basename(userStylesheetPath)}\`. Make sure
you have permissions to \`${userStylesheetPath}\`.

On linux there are currently problems with watch sizes. See
[this document][watches] for more info.
[watches]:https://github.com/atom/atom/blob/master/docs/build-instructions/linux.md#typeerror-unable-to-watch-path\
`;
      this.notificationManager.addError(message, {dismissable: true});
    }

    try {
      userStylesheetContents = this.loadStylesheet(userStylesheetPath, true);
    } catch (error1) {
      return;
    }

    return this.userStyleSheetDisposable = this.styleManager.addStyleSheet(userStylesheetContents, {sourcePath: userStylesheetPath, priority: 2});
  }

  loadBaseStylesheets() {
    return this.reloadBaseStylesheets();
  }

  reloadBaseStylesheets() {
    return this.requireStylesheet('../static/atom', -2, true);
  }

  stylesheetElementForId(id) {
    const escapedId = id.replace(/\\/g, '\\\\');
    return document.head.querySelector(`atom-styles style[source-path=\"${escapedId}\"]`);
  }

  resolveStylesheet(stylesheetPath) {
    if (path.extname(stylesheetPath).length > 0) {
      return fs.resolveOnLoadPath(stylesheetPath);
    } else {
      return fs.resolveOnLoadPath(stylesheetPath, ['css', 'less']);
    }
  }

  loadStylesheet(stylesheetPath, importFallbackVariables) {
    if (path.extname(stylesheetPath) === '.less') {
      return this.loadLessStylesheet(stylesheetPath, importFallbackVariables);
    } else {
      return fs.readFileSync(stylesheetPath, 'utf8');
    }
  }

  loadLessStylesheet(lessStylesheetPath, importFallbackVariables) {
    let detail, message;
    if (importFallbackVariables == null) { importFallbackVariables = false; }
    if (this.lessCache == null) { this.lessCache = new LessCompileCache({
      resourcePath: this.resourcePath,
      lessSourcesByRelativeFilePath: this.lessSourcesByRelativeFilePath,
      importedFilePathsByRelativeImportPath: this.importedFilePathsByRelativeImportPath,
      importPaths: this.getImportPaths()
    }); }

    try {
      if (importFallbackVariables) {
        let content, digest;
        const baseVarImports = `\
@import "variables/ui-variables";
@import "variables/syntax-variables";\
`;
        const relativeFilePath = path.relative(this.resourcePath, lessStylesheetPath);
        const lessSource = this.lessSourcesByRelativeFilePath[relativeFilePath];
        if (lessSource != null) {
          ({ content } = lessSource);
          ({ digest } = lessSource);
        } else {
          content = baseVarImports + '\n' + fs.readFileSync(lessStylesheetPath, 'utf8');
          digest = null;
        }

        return this.lessCache.cssForFile(lessStylesheetPath, content, digest);
      } else {
        return this.lessCache.read(lessStylesheetPath);
      }
    } catch (error) {
      error.less = true;
      if (error.line != null) {
        // Adjust line numbers for import fallbacks
        if (importFallbackVariables) { error.line -= 2; }

        message = `Error compiling Less stylesheet: \`${lessStylesheetPath}\``;
        detail = `\
Line number: ${error.line}
${error.message}\
`;
      } else {
        message = `Error loading Less stylesheet: \`${lessStylesheetPath}\``;
        detail = error.message;
      }

      this.notificationManager.addError(message, {detail, dismissable: true});
      throw error;
    }
  }

  removeStylesheet(stylesheetPath) {
    return (this.styleSheetDisposablesBySourcePath[stylesheetPath] != null ? this.styleSheetDisposablesBySourcePath[stylesheetPath].dispose() : undefined);
  }

  applyStylesheet(path, text, priority, skipDeprecatedSelectorsTransformation) {
    return this.styleSheetDisposablesBySourcePath[path] = this.styleManager.addStyleSheet(
      text,
      {
        priority,
        skipDeprecatedSelectorsTransformation,
        sourcePath: path
      }
    );
  }

  activateThemes() {
    return new Promise(resolve => {
      // @config.observe runs the callback once, then on subsequent changes.
      return this.config.observe('core.themes', () => {
        this.deactivateThemes();

        this.warnForNonExistentThemes();

        this.refreshLessCache(); // Update cache for packages in core.themes config

        const promises = [];
        for (let themeName of Array.from(this.getEnabledThemeNames())) {
          if (this.packageManager.resolvePackagePath(themeName)) {
            promises.push(this.packageManager.activatePackage(themeName));
          } else {
            console.warn(`Failed to activate theme '${themeName}' because it isn't installed.`);
          }
        }

        return Promise.all(promises).then(() => {
          this.addActiveThemeClasses();
          this.refreshLessCache(); // Update cache again now that @getActiveThemes() is populated
          this.loadUserStylesheet();
          this.reloadBaseStylesheets();
          this.initialLoadComplete = true;
          this.emitter.emit('did-change-active-themes');
          return resolve();
        });
      });
    });
  }

  deactivateThemes() {
    this.removeActiveThemeClasses();
    this.unwatchUserStylesheet();
    for (let pack of Array.from(this.getActiveThemes())) { this.packageManager.deactivatePackage(pack.name); }
    return null;
  }

  isInitialLoadComplete() { return this.initialLoadComplete; }

  addActiveThemeClasses() {
    let workspaceElement;
    if (workspaceElement = this.viewRegistry.getView(this.workspace)) {
      for (let pack of Array.from(this.getActiveThemes())) {
        workspaceElement.classList.add(`theme-${pack.name}`);
      }
      return;
    }
  }

  removeActiveThemeClasses() {
    const workspaceElement = this.viewRegistry.getView(this.workspace);
    for (let pack of Array.from(this.getActiveThemes())) {
      workspaceElement.classList.remove(`theme-${pack.name}`);
    }
  }

  refreshLessCache() {
    return (this.lessCache != null ? this.lessCache.setImportPaths(this.getImportPaths()) : undefined);
  }

  getImportPaths() {
    let themePaths;
    const activeThemes = this.getActiveThemes();
    if (activeThemes.length > 0) {
      themePaths = (Array.from(activeThemes).filter((theme) => theme).map((theme) => theme.getStylesheetsPath()));
    } else {
      themePaths = [];
      for (let themeName of Array.from(this.getEnabledThemeNames())) {
        var themePath;
        if (themePath = this.packageManager.resolvePackagePath(themeName)) {
          const deprecatedPath = path.join(themePath, 'stylesheets');
          if (fs.isDirectorySync(deprecatedPath)) {
            themePaths.push(deprecatedPath);
          } else {
            themePaths.push(path.join(themePath, 'styles'));
          }
        }
      }
    }

    return themePaths.filter(themePath => fs.isDirectorySync(themePath));
  }
});
