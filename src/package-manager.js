/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let PackageManager;
const path = require('path');
let normalizePackageData = null;

const _ = require('underscore-plus');
const {Emitter} = require('event-kit');
const fs = require('fs-plus');
const CSON = require('season');

const ServiceHub = require('service-hub');
const Package = require('./package');
const ThemePackage = require('./theme-package');
const {isDeprecatedPackage, getDeprecatedPackageMetadata} = require('./deprecated-packages');
const packageJSON = require('../package.json');

// Extended: Package manager for coordinating the lifecycle of Atom packages.
//
// An instance of this class is always available as the `atom.packages` global.
//
// Packages can be loaded, activated, and deactivated, and unloaded:
//  * Loading a package reads and parses the package's metadata and resources
//    such as keymaps, menus, stylesheets, etc.
//  * Activating a package registers the loaded resources and calls `activate()`
//    on the package's main module.
//  * Deactivating a package unregisters the package's resources  and calls
//    `deactivate()` on the package's main module.
//  * Unloading a package removes it completely from the package manager.
//
// Packages can be enabled/disabled via the `core.disabledPackages` config
// settings and also by calling `enablePackage()/disablePackage()`.
module.exports =
(PackageManager = class PackageManager {
  constructor(params) {
    ({
      config: this.config, styleManager: this.styleManager, notificationManager: this.notificationManager, keymapManager: this.keymapManager,
      commandRegistry: this.commandRegistry, grammarRegistry: this.grammarRegistry, deserializerManager: this.deserializerManager, viewRegistry: this.viewRegistry
    } = params);

    this.emitter = new Emitter;
    this.activationHookEmitter = new Emitter;
    this.packageDirPaths = [];
    this.deferredActivationHooks = [];
    this.triggeredActivationHooks = new Set();
    this.packagesCache = packageJSON._atomPackages != null ? packageJSON._atomPackages : {};
    this.packageDependencies = packageJSON.packageDependencies != null ? packageJSON.packageDependencies : {};
    this.initialPackagesLoaded = false;
    this.initialPackagesActivated = false;
    this.preloadedPackages = {};
    this.loadedPackages = {};
    this.activePackages = {};
    this.activatingPackages = {};
    this.packageStates = {};
    this.serviceHub = new ServiceHub;

    this.packageActivators = [];
    this.registerPackageActivator(this, ['atom', 'textmate']);
  }

  initialize(params) {
    let configDirPath, safeMode;
    ({configDirPath, devMode: this.devMode, safeMode, resourcePath: this.resourcePath} = params);
    if ((configDirPath != null) && !safeMode) {
      if (this.devMode) {
        this.packageDirPaths.push(path.join(configDirPath, "dev", "packages"));
      }
      return this.packageDirPaths.push(path.join(configDirPath, "packages"));
    }
  }

  setContextMenuManager(contextMenuManager) {
    this.contextMenuManager = contextMenuManager;
  }

  setMenuManager(menuManager) {
    this.menuManager = menuManager;
  }

  setThemeManager(themeManager) {
    this.themeManager = themeManager;
  }

  reset() {
    this.serviceHub.clear();
    this.deactivatePackages();
    this.loadedPackages = {};
    this.preloadedPackages = {};
    this.packageStates = {};
    this.packagesCache = packageJSON._atomPackages != null ? packageJSON._atomPackages : {};
    this.packageDependencies = packageJSON.packageDependencies != null ? packageJSON.packageDependencies : {};
    return this.triggeredActivationHooks.clear();
  }

  /*
  Section: Event Subscription
  */

  // Public: Invoke the given callback when all packages have been loaded.
  //
  // * `callback` {Function}
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidLoadInitialPackages(callback) {
    return this.emitter.on('did-load-initial-packages', callback);
  }

  // Public: Invoke the given callback when all packages have been activated.
  //
  // * `callback` {Function}
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidActivateInitialPackages(callback) {
    return this.emitter.on('did-activate-initial-packages', callback);
  }

  // Public: Invoke the given callback when a package is activated.
  //
  // * `callback` A {Function} to be invoked when a package is activated.
  //   * `package` The {Package} that was activated.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidActivatePackage(callback) {
    return this.emitter.on('did-activate-package', callback);
  }

  // Public: Invoke the given callback when a package is deactivated.
  //
  // * `callback` A {Function} to be invoked when a package is deactivated.
  //   * `package` The {Package} that was deactivated.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidDeactivatePackage(callback) {
    return this.emitter.on('did-deactivate-package', callback);
  }

  // Public: Invoke the given callback when a package is loaded.
  //
  // * `callback` A {Function} to be invoked when a package is loaded.
  //   * `package` The {Package} that was loaded.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidLoadPackage(callback) {
    return this.emitter.on('did-load-package', callback);
  }

  // Public: Invoke the given callback when a package is unloaded.
  //
  // * `callback` A {Function} to be invoked when a package is unloaded.
  //   * `package` The {Package} that was unloaded.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidUnloadPackage(callback) {
    return this.emitter.on('did-unload-package', callback);
  }

  /*
  Section: Package system data
  */

  // Public: Get the path to the apm command.
  //
  // Uses the value of the `core.apmPath` config setting if it exists.
  //
  // Return a {String} file path to apm.
  getApmPath() {
    const configPath = atom.config.get('core.apmPath');
    if (configPath) { return configPath; }
    if (this.apmPath != null) { return this.apmPath; }

    let commandName = 'apm';
    if (process.platform === 'win32') { commandName += '.cmd'; }
    const apmRoot = path.join(process.resourcesPath, 'app', 'apm');
    this.apmPath = path.join(apmRoot, 'bin', commandName);
    if (!fs.isFileSync(this.apmPath)) {
      this.apmPath = path.join(apmRoot, 'node_modules', 'atom-package-manager', 'bin', commandName);
    }
    return this.apmPath;
  }

  // Public: Get the paths being used to look for packages.
  //
  // Returns an {Array} of {String} directory paths.
  getPackageDirPaths() {
    return _.clone(this.packageDirPaths);
  }

  /*
  Section: General package data
  */

  // Public: Resolve the given package name to a path on disk.
  //
  // * `name` - The {String} package name.
  //
  // Return a {String} folder path or undefined if it could not be resolved.
  resolvePackagePath(name) {
    if (fs.isDirectorySync(name)) { return name; }

    let packagePath = fs.resolve(...Array.from(this.packageDirPaths), name);
    if (fs.isDirectorySync(packagePath)) { return packagePath; }

    packagePath = path.join(this.resourcePath, 'node_modules', name);
    if (this.hasAtomEngine(packagePath)) { return packagePath; }
  }

  // Public: Is the package with the given name bundled with Atom?
  //
  // * `name` - The {String} package name.
  //
  // Returns a {Boolean}.
  isBundledPackage(name) {
    return this.getPackageDependencies().hasOwnProperty(name);
  }

  isDeprecatedPackage(name, version) {
    return isDeprecatedPackage(name, version);
  }

  getDeprecatedPackageMetadata(name) {
    return getDeprecatedPackageMetadata(name);
  }

  /*
  Section: Enabling and disabling packages
  */

  // Public: Enable the package with the given name.
  //
  // * `name` - The {String} package name.
  //
  // Returns the {Package} that was enabled or null if it isn't loaded.
  enablePackage(name) {
    const pack = this.loadPackage(name);
    if (pack != null) {
      pack.enable();
    }
    return pack;
  }

  // Public: Disable the package with the given name.
  //
  // * `name` - The {String} package name.
  //
  // Returns the {Package} that was disabled or null if it isn't loaded.
  disablePackage(name) {
    const pack = this.loadPackage(name);

    if (!this.isPackageDisabled(name)) {
      if (pack != null) {
        pack.disable();
      }
    }

    return pack;
  }

  // Public: Is the package with the given name disabled?
  //
  // * `name` - The {String} package name.
  //
  // Returns a {Boolean}.
  isPackageDisabled(name) {
    let left;
    return _.include((left = this.config.get('core.disabledPackages')) != null ? left : [], name);
  }

  /*
  Section: Accessing active packages
  */

  // Public: Get an {Array} of all the active {Package}s.
  getActivePackages() {
    return _.values(this.activePackages);
  }

  // Public: Get the active {Package} with the given name.
  //
  // * `name` - The {String} package name.
  //
  // Returns a {Package} or undefined.
  getActivePackage(name) {
    return this.activePackages[name];
  }

  // Public: Is the {Package} with the given name active?
  //
  // * `name` - The {String} package name.
  //
  // Returns a {Boolean}.
  isPackageActive(name) {
    return (this.getActivePackage(name) != null);
  }

  // Public: Returns a {Boolean} indicating whether package activation has occurred.
  hasActivatedInitialPackages() { return this.initialPackagesActivated; }

  /*
  Section: Accessing loaded packages
  */

  // Public: Get an {Array} of all the loaded {Package}s
  getLoadedPackages() {
    return _.values(this.loadedPackages);
  }

  // Get packages for a certain package type
  //
  // * `types` an {Array} of {String}s like ['atom', 'textmate'].
  getLoadedPackagesForTypes(types) {
    return (() => {
      const result = [];
      for (let pack of Array.from(this.getLoadedPackages())) {         var needle;
      if ((needle = pack.getType(), Array.from(types).includes(needle))) {
          result.push(pack);
        }
      }
      return result;
    })();
  }

  // Public: Get the loaded {Package} with the given name.
  //
  // * `name` - The {String} package name.
  //
  // Returns a {Package} or undefined.
  getLoadedPackage(name) {
    return this.loadedPackages[name];
  }

  // Public: Is the package with the given name loaded?
  //
  // * `name` - The {String} package name.
  //
  // Returns a {Boolean}.
  isPackageLoaded(name) {
    return (this.getLoadedPackage(name) != null);
  }

  // Public: Returns a {Boolean} indicating whether package loading has occurred.
  hasLoadedInitialPackages() { return this.initialPackagesLoaded; }

  /*
  Section: Accessing available packages
  */

  // Public: Returns an {Array} of {String}s of all the available package paths.
  getAvailablePackagePaths() {
    return this.getAvailablePackages().map(a => a.path);
  }

  // Public: Returns an {Array} of {String}s of all the available package names.
  getAvailablePackageNames() {
    return this.getAvailablePackages().map(a => a.name);
  }

  // Public: Returns an {Array} of {String}s of all the available package metadata.
  getAvailablePackageMetadata() {
    const packages = [];
    for (let pack of Array.from(this.getAvailablePackages())) {
      var left;
      const metadata = (left = __guard__(this.getLoadedPackage(pack.name), x => x.metadata)) != null ? left : this.loadPackageMetadata(pack, true);
      packages.push(metadata);
    }
    return packages;
  }

  getAvailablePackages() {
    let packageName;
    const packages = [];
    const packagesByName = new Set();

    for (let packageDirPath of Array.from(this.packageDirPaths)) {
      if (fs.isDirectorySync(packageDirPath)) {
        for (let packagePath of Array.from(fs.readdirSync(packageDirPath))) {
          packagePath = path.join(packageDirPath, packagePath);
          packageName = path.basename(packagePath);
          if (!packageName.startsWith('.') && !packagesByName.has(packageName) && fs.isDirectorySync(packagePath)) {
            packages.push({
              name: packageName,
              path: packagePath,
              isBundled: false
            });
            packagesByName.add(packageName);
          }
        }
      }
    }

    for (packageName in this.packageDependencies) {
      if (!packagesByName.has(packageName)) {
        packages.push({
          name: packageName,
          path: path.join(this.resourcePath, 'node_modules', packageName),
          isBundled: true
        });
      }
    }

    return packages.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  /*
  Section: Private
  */

  getPackageState(name) {
    return this.packageStates[name];
  }

  setPackageState(name, state) {
    return this.packageStates[name] = state;
  }

  getPackageDependencies() {
    return this.packageDependencies;
  }

  hasAtomEngine(packagePath) {
    const metadata = this.loadPackageMetadata(packagePath, true);
    return (__guard__(metadata != null ? metadata.engines : undefined, x => x.atom) != null);
  }

  unobserveDisabledPackages() {
    if (this.disabledPackagesSubscription != null) {
      this.disabledPackagesSubscription.dispose();
    }
    return this.disabledPackagesSubscription = null;
  }

  observeDisabledPackages() {
    return this.disabledPackagesSubscription != null ? this.disabledPackagesSubscription : (this.disabledPackagesSubscription = this.config.onDidChange('core.disabledPackages', ({newValue, oldValue}) => {
      let packageName;
      const packagesToEnable = _.difference(oldValue, newValue);
      const packagesToDisable = _.difference(newValue, oldValue);

      for (packageName of Array.from(packagesToDisable)) { if (this.getActivePackage(packageName)) { this.deactivatePackage(packageName); } }
      for (packageName of Array.from(packagesToEnable)) { this.activatePackage(packageName); }
      return null;
    }));
  }

  unobservePackagesWithKeymapsDisabled() {
    if (this.packagesWithKeymapsDisabledSubscription != null) {
      this.packagesWithKeymapsDisabledSubscription.dispose();
    }
    return this.packagesWithKeymapsDisabledSubscription = null;
  }

  observePackagesWithKeymapsDisabled() {
    return this.packagesWithKeymapsDisabledSubscription != null ? this.packagesWithKeymapsDisabledSubscription : (this.packagesWithKeymapsDisabledSubscription = this.config.onDidChange('core.packagesWithKeymapsDisabled', ({newValue, oldValue}) => {
      let packageName;
      const keymapsToEnable = _.difference(oldValue, newValue);
      const keymapsToDisable = _.difference(newValue, oldValue);

      const disabledPackageNames = new Set(this.config.get('core.disabledPackages'));
      for (packageName of Array.from(keymapsToDisable)) {
        if (!disabledPackageNames.has(packageName)) {
          __guard__(this.getLoadedPackage(packageName), x => x.deactivateKeymaps());
        }
      }
      for (packageName of Array.from(keymapsToEnable)) {
        if (!disabledPackageNames.has(packageName)) {
          __guard__(this.getLoadedPackage(packageName), x1 => x1.activateKeymaps());
        }
      }
      return null;
    }));
  }

  preloadPackages() {
    return (() => {
      const result = [];
      for (let packageName in this.packagesCache) {
        const pack = this.packagesCache[packageName];
        result.push(this.preloadPackage(packageName, pack));
      }
      return result;
    })();
  }

  preloadPackage(packageName, pack) {
    const metadata = pack.metadata != null ? pack.metadata : {};
    if ((typeof metadata.name !== 'string') || !(metadata.name.length > 0)) {
      metadata.name = packageName;
    }

    if (((metadata.repository != null ? metadata.repository.type : undefined) === 'git') && (typeof metadata.repository.url === 'string')) {
      metadata.repository.url = metadata.repository.url.replace(/(^git\+)|(\.git$)/g, '');
    }

    const options = {
      path: pack.rootDirPath, name: packageName, preloadedPackage: true,
      bundledPackage: true, metadata, packageManager: this, config: this.config,
      styleManager: this.styleManager, commandRegistry: this.commandRegistry, keymapManager: this.keymapManager,
      notificationManager: this.notificationManager, grammarRegistry: this.grammarRegistry, themeManager: this.themeManager, menuManager: this.menuManager,
      contextMenuManager: this.contextMenuManager, deserializerManager: this.deserializerManager, viewRegistry: this.viewRegistry
    };
    if (metadata.theme) {
      pack = new ThemePackage(options);
    } else {
      pack = new Package(options);
    }

    pack.preload();
    return this.preloadedPackages[packageName] = pack;
  }

  loadPackages() {
    // Ensure atom exports is already in the require cache so the load time
    // of the first package isn't skewed by being the first to require atom
    require('../exports/atom');

    const disabledPackageNames = new Set(this.config.get('core.disabledPackages'));
    this.config.transact(() => {
      for (let pack of Array.from(this.getAvailablePackages())) {
        this.loadAvailablePackage(pack, disabledPackageNames);
      }
    });
    this.initialPackagesLoaded = true;
    return this.emitter.emit('did-load-initial-packages');
  }

  loadPackage(nameOrPath) {
    let pack, packagePath;
    if (path.basename(nameOrPath)[0].match(/^\./)) { // primarily to skip .git folder
      return null;
    } else if (pack = this.getLoadedPackage(nameOrPath)) {
      return pack;
    } else if (packagePath = this.resolvePackagePath(nameOrPath)) {
      const name = path.basename(nameOrPath);
      return this.loadAvailablePackage({name, path: packagePath, isBundled: this.isBundledPackagePath(packagePath)});
    } else {
      console.warn(`Could not resolve '${nameOrPath}' to a package path`);
      return null;
    }
  }

  loadAvailablePackage(availablePackage, disabledPackageNames) {
    const preloadedPackage = this.preloadedPackages[availablePackage.name];

    if (disabledPackageNames != null ? disabledPackageNames.has(availablePackage.name) : undefined) {
      if (preloadedPackage != null) {
        preloadedPackage.deactivate();
        return delete preloadedPackage[availablePackage.name];
      }
    } else {
      const loadedPackage = this.getLoadedPackage(availablePackage.name);
      if (loadedPackage != null) {
        return loadedPackage;
      } else {
        let metadata, pack;
        if (preloadedPackage != null) {
          if (availablePackage.isBundled) {
            preloadedPackage.finishLoading();
            this.loadedPackages[availablePackage.name] = preloadedPackage;
            return preloadedPackage;
          } else {
            preloadedPackage.deactivate();
            delete preloadedPackage[availablePackage.name];
          }
        }

        try {
          let left;
          metadata = (left = this.loadPackageMetadata(availablePackage)) != null ? left : {};
        } catch (error) {
          this.handleMetadataError(error, availablePackage.path);
          return null;
        }

        if (!availablePackage.isBundled) {
          if (this.isDeprecatedPackage(metadata.name, metadata.version)) {
            console.warn(`Could not load ${metadata.name}@${metadata.version} because it uses deprecated APIs that have been removed.`);
            return null;
          }
        }

        const options = {
          path: availablePackage.path, name: availablePackage.name, metadata,
          bundledPackage: availablePackage.isBundled, packageManager: this,
          config: this.config, styleManager: this.styleManager, commandRegistry: this.commandRegistry, keymapManager: this.keymapManager,
          notificationManager: this.notificationManager, grammarRegistry: this.grammarRegistry, themeManager: this.themeManager, menuManager: this.menuManager,
          contextMenuManager: this.contextMenuManager, deserializerManager: this.deserializerManager, viewRegistry: this.viewRegistry
        };
        if (metadata.theme) {
          pack = new ThemePackage(options);
        } else {
          pack = new Package(options);
        }
        pack.load();
        this.loadedPackages[pack.name] = pack;
        this.emitter.emit('did-load-package', pack);
        return pack;
      }
    }
  }

  unloadPackages() {
    for (let name of Array.from(_.keys(this.loadedPackages))) { this.unloadPackage(name); }
    return null;
  }

  unloadPackage(name) {
    let pack;
    if (this.isPackageActive(name)) {
      throw new Error(`Tried to unload active package '${name}'`);
    }

    if (pack = this.getLoadedPackage(name)) {
      delete this.loadedPackages[pack.name];
      return this.emitter.emit('did-unload-package', pack);
    } else {
      throw new Error(`No loaded package for name '${name}'`);
    }
  }

  // Activate all the packages that should be activated.
  activate() {
    let promises = [];
    for (let [activator, types] of Array.from(this.packageActivators)) {
      const packages = this.getLoadedPackagesForTypes(types);
      promises = promises.concat(activator.activatePackages(packages));
    }
    return Promise.all(promises).then(() => {
      this.triggerDeferredActivationHooks();
      this.initialPackagesActivated = true;
      return this.emitter.emit('did-activate-initial-packages');
    });
  }

  // another type of package manager can handle other package types.
  // See ThemeManager
  registerPackageActivator(activator, types) {
    return this.packageActivators.push([activator, types]);
  }

  activatePackages(packages) {
    const promises = [];
    this.config.transactAsync(() => {
      for (let pack of Array.from(packages)) {
        const promise = this.activatePackage(pack.name);
        if (!pack.activationShouldBeDeferred()) { promises.push(promise); }
      }
      return Promise.all(promises);
    });
    this.observeDisabledPackages();
    this.observePackagesWithKeymapsDisabled();
    return promises;
  }

  // Activate a single package by name
  activatePackage(name) {
    let pack;
    if (pack = this.getActivePackage(name)) {
      return Promise.resolve(pack);
    } else if (pack = this.loadPackage(name)) {
      this.activatingPackages[pack.name] = pack;
      const activationPromise = pack.activate().then(() => {
        if (this.activatingPackages[pack.name] != null) {
          delete this.activatingPackages[pack.name];
          this.activePackages[pack.name] = pack;
          this.emitter.emit('did-activate-package', pack);
        }
        return pack;
      });

      if (this.deferredActivationHooks == null) {
        this.triggeredActivationHooks.forEach(hook => this.activationHookEmitter.emit(hook));
      }

      return activationPromise;
    } else {
      return Promise.reject(new Error(`Failed to load package '${name}'`));
    }
  }

  triggerDeferredActivationHooks() {
    if (this.deferredActivationHooks == null) { return; }
    for (let hook of Array.from(this.deferredActivationHooks)) { this.activationHookEmitter.emit(hook); }
    return this.deferredActivationHooks = null;
  }

  triggerActivationHook(hook) {
    if ((hook == null) || !_.isString(hook) || !(hook.length > 0)) { return new Error("Cannot trigger an empty activation hook"); }
    this.triggeredActivationHooks.add(hook);
    if (this.deferredActivationHooks != null) {
      return this.deferredActivationHooks.push(hook);
    } else {
      return this.activationHookEmitter.emit(hook);
    }
  }

  onDidTriggerActivationHook(hook, callback) {
    if ((hook == null) || !_.isString(hook) || !(hook.length > 0)) { return; }
    return this.activationHookEmitter.on(hook, callback);
  }

  serialize() {
    for (let pack of Array.from(this.getActivePackages())) {
      this.serializePackage(pack);
    }
    return this.packageStates;
  }

  serializePackage(pack) {
    let state;
    if (state = typeof pack.serialize === 'function' ? pack.serialize() : undefined) { return this.setPackageState(pack.name, state); }
  }

  // Deactivate all packages
  deactivatePackages() {
    this.config.transact(() => {
      for (let pack of Array.from(this.getLoadedPackages())) { this.deactivatePackage(pack.name, true); }
    });
    this.unobserveDisabledPackages();
    return this.unobservePackagesWithKeymapsDisabled();
  }

  // Deactivate the package with the given name
  deactivatePackage(name, suppressSerialization) {
    const pack = this.getLoadedPackage(name);
    if (!suppressSerialization && this.isPackageActive(pack.name)) { this.serializePackage(pack); }
    pack.deactivate();
    delete this.activePackages[pack.name];
    delete this.activatingPackages[pack.name];
    return this.emitter.emit('did-deactivate-package', pack);
  }

  handleMetadataError(error, packagePath) {
    const metadataPath = path.join(packagePath, 'package.json');
    const detail = `${error.message} in ${metadataPath}`;
    const stack = `${error.stack}\n  at ${metadataPath}:1:1`;
    const message = `Failed to load the ${path.basename(packagePath)} package`;
    return this.notificationManager.addError(message, {stack, detail, packageName: path.basename(packagePath), dismissable: true});
  }

  uninstallDirectory(directory) {
    const symlinkPromise = new Promise(function(resolve) {
      return fs.isSymbolicLink(directory, isSymLink => resolve(isSymLink));
    });

    const dirPromise = new Promise(function(resolve) {
      return fs.isDirectory(directory, isDir => resolve(isDir));
    });

    return Promise.all([symlinkPromise, dirPromise]).then(function(values) {
      const [isSymLink, isDir] = Array.from(values);
      if (!isSymLink && isDir) {
        return fs.remove(directory, function() {});
      }
    });
  }

  reloadActivePackageStyleSheets() {
    for (let pack of Array.from(this.getActivePackages())) {
      if (pack.getType() !== 'theme') {
        if (typeof pack.reloadStylesheets === 'function') {
          pack.reloadStylesheets();
        }
      }
    }
  }

  isBundledPackagePath(packagePath) {
    if (this.devMode) {
      if (!this.resourcePath.startsWith(`${process.resourcesPath}${path.sep}`)) { return false; }
    }

    if (this.resourcePathWithTrailingSlash == null) { this.resourcePathWithTrailingSlash = `${this.resourcePath}${path.sep}`; }
    return (packagePath != null ? packagePath.startsWith(this.resourcePathWithTrailingSlash) : undefined);
  }

  loadPackageMetadata(packagePathOrAvailablePackage, ignoreErrors) {
    let isBundled, metadata, packageName, packagePath;
    if (ignoreErrors == null) { ignoreErrors = false; }
    if (typeof packagePathOrAvailablePackage === 'object') {
      const availablePackage = packagePathOrAvailablePackage;
      packageName = availablePackage.name;
      packagePath = availablePackage.path;
      ({ isBundled } = availablePackage);
    } else {
      packagePath = packagePathOrAvailablePackage;
      packageName = path.basename(packagePath);
      isBundled = this.isBundledPackagePath(packagePath);
    }

    if (isBundled) {
      metadata = this.packagesCache[packageName] != null ? this.packagesCache[packageName].metadata : undefined;
    }

    if (metadata == null) {
      let metadataPath;
      if (metadataPath = CSON.resolve(path.join(packagePath, 'package'))) {
        try {
          metadata = CSON.readFileSync(metadataPath);
          this.normalizePackageMetadata(metadata);
        } catch (error) {
          if (!ignoreErrors) { throw error; }
        }
      }
    }

    if (metadata == null) { metadata = {}; }
    if ((typeof metadata.name !== 'string') || !(metadata.name.length > 0)) {
      metadata.name = packageName;
    }

    if (((metadata.repository != null ? metadata.repository.type : undefined) === 'git') && (typeof metadata.repository.url === 'string')) {
      metadata.repository.url = metadata.repository.url.replace(/(^git\+)|(\.git$)/g, '');
    }

    return metadata;
  }

  normalizePackageMetadata(metadata) {
    if (!(metadata != null ? metadata._id : undefined)) {
      if (normalizePackageData == null) { normalizePackageData = require('normalize-package-data'); }
      return normalizePackageData(metadata);
    }
  }
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}