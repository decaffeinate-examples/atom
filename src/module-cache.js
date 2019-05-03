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
let isAbsolute;
const Module = require('module');
const path = require('path');
const semver = require('semver');

// Extend semver.Range to memoize matched versions for speed
class Range extends semver.Range {
  constructor() {
    super(...arguments);
    this.matchedVersions = new Set();
    this.unmatchedVersions = new Set();
  }

  test(version) {
    if (this.matchedVersions.has(version)) { return true; }
    if (this.unmatchedVersions.has(version)) { return false; }

    const matches = super.test(...arguments);
    if (matches) {
      this.matchedVersions.add(version);
    } else {
      this.unmatchedVersions.add(version);
    }
    return matches;
  }
}

let nativeModules = null;

const cache = {
  builtins: {},
  debug: false,
  dependencies: {},
  extensions: {},
  folders: {},
  ranges: {},
  registered: false,
  resourcePath: null,
  resourcePathWithTrailingSlash: null
};

// isAbsolute is inlined from fs-plus so that fs-plus itself can be required
// from this cache.
if (process.platform === 'win32') {
  isAbsolute = pathToCheck => pathToCheck && ((pathToCheck[1] === ':') || ((pathToCheck[0] === '\\') && (pathToCheck[1] === '\\')));
} else {
  isAbsolute = pathToCheck => pathToCheck && (pathToCheck[0] === '/');
}

const isCorePath = pathToCheck => pathToCheck.startsWith(cache.resourcePathWithTrailingSlash);

var loadDependencies = function(modulePath, rootPath, rootMetadata, moduleCache) {
  const fs = require('fs-plus');

  for (let childPath of Array.from(fs.listSync(path.join(modulePath, 'node_modules')))) {
    if (path.basename(childPath) === '.bin') { continue; }
    if ((rootPath === modulePath) && (rootMetadata.packageDependencies != null ? rootMetadata.packageDependencies.hasOwnProperty(path.basename(childPath)) : undefined)) { continue; }

    const childMetadataPath = path.join(childPath, 'package.json');
    if (!fs.isFileSync(childMetadataPath)) { continue; }

    const childMetadata = JSON.parse(fs.readFileSync(childMetadataPath));
    if (childMetadata != null ? childMetadata.version : undefined) {
      var mainPath;
      try {
        mainPath = require.resolve(childPath);
      } catch (error) {
        mainPath = null;
      }

      if (mainPath) {
        moduleCache.dependencies.push({
          name: childMetadata.name,
          version: childMetadata.version,
          path: path.relative(rootPath, mainPath)
        });
      }

      loadDependencies(childPath, rootPath, rootMetadata, moduleCache);
    }
  }

};

var loadFolderCompatibility = function(modulePath, rootPath, rootMetadata, moduleCache) {
  let left;
  const fs = require('fs-plus');

  const metadataPath = path.join(modulePath, 'package.json');
  if (!fs.isFileSync(metadataPath)) { return; }

  const dependencies = (left = __guard__(JSON.parse(fs.readFileSync(metadataPath)), x => x.dependencies)) != null ? left : {};

  for (let name in dependencies) {
    const version = dependencies[name];
    try {
      new Range(version);
    } catch (error) {
      delete dependencies[name];
    }
  }

  const onDirectory = childPath => path.basename(childPath) !== 'node_modules';

  const extensions = ['.js', '.coffee', '.json', '.node'];
  let paths = {};
  const onFile = function(childPath) {
    let needle;
    if ((needle = path.extname(childPath), Array.from(extensions).includes(needle))) {
      const relativePath = path.relative(rootPath, path.dirname(childPath));
      return paths[relativePath] = true;
    }
  };
  fs.traverseTreeSync(modulePath, onFile, onDirectory);

  paths = Object.keys(paths);
  if ((paths.length > 0) && (Object.keys(dependencies).length > 0)) {
    moduleCache.folders.push({paths, dependencies});
  }

  for (let childPath of Array.from(fs.listSync(path.join(modulePath, 'node_modules')))) {
    if (path.basename(childPath) === '.bin') { continue; }
    if ((rootPath === modulePath) && (rootMetadata.packageDependencies != null ? rootMetadata.packageDependencies.hasOwnProperty(path.basename(childPath)) : undefined)) { continue; }

    loadFolderCompatibility(childPath, rootPath, rootMetadata, moduleCache);
  }

};

const loadExtensions = function(modulePath, rootPath, rootMetadata, moduleCache) {
  const fs = require('fs-plus');
  const extensions = ['.js', '.coffee', '.json', '.node'];
  const nodeModulesPath = path.join(rootPath, 'node_modules');

  const onFile = function(filePath) {
    filePath = path.relative(rootPath, filePath);
    const segments = filePath.split(path.sep);
    if (Array.from(segments).includes('test')) { return; }
    if (Array.from(segments).includes('tests')) { return; }
    if (Array.from(segments).includes('spec')) { return; }
    if (Array.from(segments).includes('specs')) { return; }
    if ((segments.length > 1) && !(['exports', 'lib', 'node_modules', 'src', 'static', 'vendor'].includes(segments[0]))) { return; }

    const extension = path.extname(filePath);
    if (Array.from(extensions).includes(extension)) {
      if (moduleCache.extensions[extension] == null) { moduleCache.extensions[extension] = []; }
      return moduleCache.extensions[extension].push(filePath);
    }
  };

  const onDirectory = function(childPath) {
    // Don't include extensions from bundled packages
    // These are generated and stored in the package's own metadata cache
    if (rootMetadata.name === 'atom') {
      const parentPath = path.dirname(childPath);
      if (parentPath === nodeModulesPath) {
        const packageName = path.basename(childPath);
        if (rootMetadata.packageDependencies != null ? rootMetadata.packageDependencies.hasOwnProperty(packageName) : undefined) { return false; }
      }
    }

    return true;
  };

  fs.traverseTreeSync(rootPath, onFile, onDirectory);

};

const satisfies = function(version, rawRange) {
  let parsedRange;
  if (!(parsedRange = cache.ranges[rawRange])) {
    parsedRange = new Range(rawRange);
    cache.ranges[rawRange] = parsedRange;
  }
  return parsedRange.test(version);
};

const resolveFilePath = function(relativePath, parentModule) {
  if (!relativePath) { return; }
  if (!(parentModule != null ? parentModule.filename : undefined)) { return; }
  if ((relativePath[0] !== '.') && !isAbsolute(relativePath)) { return; }

  const resolvedPath = path.resolve(path.dirname(parentModule.filename), relativePath);
  if (!isCorePath(resolvedPath)) { return; }

  let extension = path.extname(resolvedPath);
  if (extension) {
    if (cache.extensions[extension] != null ? cache.extensions[extension].has(resolvedPath) : undefined) { return resolvedPath; }
  } else {
    for (extension in cache.extensions) {
      const paths = cache.extensions[extension];
      const resolvedPathWithExtension = `${resolvedPath}${extension}`;
      if (paths.has(resolvedPathWithExtension)) { return resolvedPathWithExtension; }
    }
  }

};

const resolveModulePath = function(relativePath, parentModule) {
  if (!relativePath) { return; }
  if (!(parentModule != null ? parentModule.filename : undefined)) { return; }

  if (nativeModules == null) { nativeModules = process.binding('natives'); }
  if (nativeModules.hasOwnProperty(relativePath)) { return; }
  if (relativePath[0] === '.') { return; }
  if (isAbsolute(relativePath)) { return; }

  const folderPath = path.dirname(parentModule.filename);

  const range = cache.folders[folderPath] != null ? cache.folders[folderPath][relativePath] : undefined;
  if (range == null) {
    let builtinPath;
    if (builtinPath = cache.builtins[relativePath]) {
      return builtinPath;
    } else {
      return;
    }
  }

  const candidates = cache.dependencies[relativePath];
  if (candidates == null) { return; }

  for (let version in candidates) {
    const resolvedPath = candidates[version];
    if (Module._cache.hasOwnProperty(resolvedPath) || isCorePath(resolvedPath)) {
      if (satisfies(version, range)) { return resolvedPath; }
    }
  }

};

const registerBuiltins = function(devMode) {
  let builtin;
  if (devMode || !cache.resourcePath.startsWith(`${process.resourcesPath}${path.sep}`)) {
    const fs = require('fs-plus');
    const atomJsPath = path.join(cache.resourcePath, 'exports', 'atom.js');
    if (fs.isFileSync(atomJsPath)) { cache.builtins.atom = atomJsPath; }
  }
  if (cache.builtins.atom == null) { cache.builtins.atom = path.join(cache.resourcePath, 'exports', 'atom.js'); }

  const electronAsarRoot = path.join(process.resourcesPath, 'electron.asar');

  const commonRoot = path.join(electronAsarRoot, 'common', 'api');
  const commonBuiltins = ['callbacks-registry', 'clipboard', 'crash-reporter', 'shell'];
  for (builtin of Array.from(commonBuiltins)) {
    cache.builtins[builtin] = path.join(commonRoot, `${builtin}.js`);
  }

  const rendererRoot = path.join(electronAsarRoot, 'renderer', 'api');
  const rendererBuiltins = ['ipc-renderer', 'remote', 'screen'];
  return (() => {
    const result = [];
    for (builtin of Array.from(rendererBuiltins)) {
      result.push(cache.builtins[builtin] = path.join(rendererRoot, `${builtin}.js`));
    }
    return result;
  })();
};

exports.create = function(modulePath) {
  const fs = require('fs-plus');

  modulePath = fs.realpathSync(modulePath);
  const metadataPath = path.join(modulePath, 'package.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath));

  const moduleCache = {
    version: 1,
    dependencies: [],
    extensions: {},
    folders: []
  };

  loadDependencies(modulePath, modulePath, metadata, moduleCache);
  loadFolderCompatibility(modulePath, modulePath, metadata, moduleCache);
  loadExtensions(modulePath, modulePath, metadata, moduleCache);

  metadata._atomModuleCache = moduleCache;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

};

exports.register = function(param) {
  if (param == null) { param = {}; }
  const {resourcePath, devMode} = param;
  if (cache.registered) { return; }

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(relativePath, parentModule) {
    let resolvedPath = resolveModulePath(relativePath, parentModule);
    if (resolvedPath == null) { resolvedPath = resolveFilePath(relativePath, parentModule); }
    return resolvedPath != null ? resolvedPath : originalResolveFilename(relativePath, parentModule);
  };

  cache.registered = true;
  cache.resourcePath = resourcePath;
  cache.resourcePathWithTrailingSlash = `${resourcePath}${path.sep}`;
  registerBuiltins(devMode);

};

exports.add = function(directoryPath, metadata) {
  // path.join isn't used in this function for speed since path.join calls
  // path.normalize and all the paths are already normalized here.

  if (metadata == null) {
    try {
      metadata = require(`${directoryPath}${path.sep}package.json`);
    } catch (error) {
      return;
    }
  }

  const cacheToAdd = metadata != null ? metadata._atomModuleCache : undefined;
  if (cacheToAdd == null) { return; }

  for (let dependency of Array.from(cacheToAdd.dependencies != null ? cacheToAdd.dependencies : [])) {
    if (cache.dependencies[dependency.name] == null) { cache.dependencies[dependency.name] = {}; }
    if (cache.dependencies[dependency.name][dependency.version] == null) { cache.dependencies[dependency.name][dependency.version] = `${directoryPath}${path.sep}${dependency.path}`; }
  }

  for (let entry of Array.from(cacheToAdd.folders != null ? cacheToAdd.folders : [])) {
    for (let folderPath of Array.from(entry.paths)) {
      if (folderPath) {
        cache.folders[`${directoryPath}${path.sep}${folderPath}`] = entry.dependencies;
      } else {
        cache.folders[directoryPath] = entry.dependencies;
      }
    }
  }

  for (let extension in cacheToAdd.extensions) {
    const paths = cacheToAdd.extensions[extension];
    if (cache.extensions[extension] == null) { cache.extensions[extension] = new Set(); }
    for (let filePath of Array.from(paths)) {
      cache.extensions[extension].add(`${directoryPath}${path.sep}${filePath}`);
    }
  }

};

exports.cache = cache;

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}