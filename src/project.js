/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Project;
const path = require('path');

const _ = require('underscore-plus');
const fs = require('fs-plus');
const {Emitter, Disposable} = require('event-kit');
const TextBuffer = require('text-buffer');

const DefaultDirectoryProvider = require('./default-directory-provider');
const Model = require('./model');
const GitRepositoryProvider = require('./git-repository-provider');

// Extended: Represents a project that's opened in Atom.
//
// An instance of this class is always available as the `atom.project` global.
module.exports =
(Project = class Project extends Model {
  /*
  Section: Construction and Destruction
  */

  constructor({notificationManager, packageManager, config, applicationDelegate}) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { return this; }).toString();
      let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
      eval(`${thisName} = this;`);
    }
    this.notificationManager = notificationManager;
    this.applicationDelegate = applicationDelegate;
    this.emitter = new Emitter;
    this.buffers = [];
    this.rootDirectories = [];
    this.repositories = [];
    this.directoryProviders = [];
    this.defaultDirectoryProvider = new DefaultDirectoryProvider();
    this.repositoryPromisesByPath = new Map();
    this.repositoryProviders = [new GitRepositoryProvider(this, config)];
    this.loadPromisesByPath = {};
    this.consumeServices(packageManager);
  }

  destroyed() {
    for (let buffer of Array.from(this.buffers.slice())) { buffer.destroy(); }
    for (let repository of Array.from(this.repositories.slice())) { if (repository != null) {
      repository.destroy();
    } }
    this.rootDirectories = [];
    return this.repositories = [];
  }

  reset(packageManager) {
    this.emitter.dispose();
    this.emitter = new Emitter;

    for (let buffer of Array.from(this.buffers)) { if (buffer != null) {
      buffer.destroy();
    } }
    this.buffers = [];
    this.setPaths([]);
    this.loadPromisesByPath = {};
    return this.consumeServices(packageManager);
  }

  destroyUnretainedBuffers() {
    for (let buffer of Array.from(this.getBuffers())) { if (!buffer.isRetained()) { buffer.destroy(); } }
  }

  /*
  Section: Serialization
  */

  deserialize(state) {
    const bufferPromises = [];
    for (let bufferState of Array.from(state.buffers)) {
      if (fs.isDirectorySync(bufferState.filePath)) { continue; }
      if (bufferState.filePath) {
        try {
          fs.closeSync(fs.openSync(bufferState.filePath, 'r'));
        } catch (error) {
          if (error.code !== 'ENOENT') { continue; }
        }
      }
      if (bufferState.shouldDestroyOnFileDelete == null) {
        bufferState.shouldDestroyOnFileDelete = () => atom.config.get('core.closeDeletedFileTabs');
      }
      bufferPromises.push(TextBuffer.deserialize(bufferState));
    }
    return Promise.all(bufferPromises).then(buffers => {
      this.buffers = buffers;
      for (let buffer of Array.from(this.buffers)) { this.subscribeToBuffer(buffer); }
      return this.setPaths(state.paths);
    });
  }

  serialize(options) {
    if (options == null) { options = {}; }
    return {
      deserializer: 'Project',
      paths: this.getPaths(),
      buffers: _.compact(this.buffers.map(function(buffer) {
        if (buffer.isRetained()) {
          const isUnloading = options.isUnloading === true;
          return buffer.serialize({markerLayers: isUnloading, history: isUnloading});
        }
      }))
    };
  }

  /*
  Section: Event Subscription
  */

  // Public: Invoke the given callback when the project paths change.
  //
  // * `callback` {Function} to be called after the project paths change.
  //    * `projectPaths` An {Array} of {String} project paths.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChangePaths(callback) {
    return this.emitter.on('did-change-paths', callback);
  }

  // Public: Invoke the given callback when a text buffer is added to the
  // project.
  //
  // * `callback` {Function} to be called when a text buffer is added.
  //   * `buffer` A {TextBuffer} item.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidAddBuffer(callback) {
    return this.emitter.on('did-add-buffer', callback);
  }

  // Public: Invoke the given callback with all current and future text
  // buffers in the project.
  //
  // * `callback` {Function} to be called with current and future text buffers.
  //   * `buffer` A {TextBuffer} item.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  observeBuffers(callback) {
    for (let buffer of Array.from(this.getBuffers())) { callback(buffer); }
    return this.onDidAddBuffer(callback);
  }

  /*
  Section: Accessing the git repository
  */

  // Public: Get an {Array} of {GitRepository}s associated with the project's
  // directories.
  //
  // This method will be removed in 2.0 because it does synchronous I/O.
  // Prefer the following, which evaluates to a {Promise} that resolves to an
  // {Array} of {Repository} objects:
  // ```
  // Promise.all(atom.project.getDirectories().map(
  //     atom.project.repositoryForDirectory.bind(atom.project)))
  // ```
  getRepositories() { return this.repositories; }

  // Public: Get the repository for a given directory asynchronously.
  //
  // * `directory` {Directory} for which to get a {Repository}.
  //
  // Returns a {Promise} that resolves with either:
  // * {Repository} if a repository can be created for the given directory
  // * `null` if no repository can be created for the given directory.
  repositoryForDirectory(directory) {
    const pathForDirectory = directory.getRealPathSync();
    let promise = this.repositoryPromisesByPath.get(pathForDirectory);
    if (!promise) {
      const promises = this.repositoryProviders.map(provider => provider.repositoryForDirectory(directory));
      promise = Promise.all(promises).then(repositories => {
        let left;
        const repo = (left = _.find(repositories, repo => repo != null)) != null ? left : null;

        // If no repository is found, remove the entry in for the directory in
        // @repositoryPromisesByPath in case some other RepositoryProvider is
        // registered in the future that could supply a Repository for the
        // directory.
        if (repo == null) { this.repositoryPromisesByPath.delete(pathForDirectory); }
        __guardMethod__(repo, 'onDidDestroy', o => o.onDidDestroy(() => this.repositoryPromisesByPath.delete(pathForDirectory)));
        return repo;
      });
      this.repositoryPromisesByPath.set(pathForDirectory, promise);
    }
    return promise;
  }

  /*
  Section: Managing Paths
  */

  // Public: Get an {Array} of {String}s containing the paths of the project's
  // directories.
  getPaths() { return Array.from(this.rootDirectories).map((rootDirectory) => rootDirectory.getPath()); }

  // Public: Set the paths of the project's directories.
  //
  // * `projectPaths` {Array} of {String} paths.
  setPaths(projectPaths) {
    for (let repository of Array.from(this.repositories)) { if (repository != null) {
      repository.destroy();
    } }
    this.rootDirectories = [];
    this.repositories = [];

    for (let projectPath of Array.from(projectPaths)) { this.addPath(projectPath, {emitEvent: false}); }

    return this.emitter.emit('did-change-paths', projectPaths);
  }

  // Public: Add a path to the project's list of root paths
  //
  // * `projectPath` {String} The path to the directory to add.
  addPath(projectPath, options) {
    const directory = this.getDirectoryForProjectPath(projectPath);
    if (!directory.existsSync()) { return; }
    for (let existingDirectory of Array.from(this.getDirectories())) {
      if (existingDirectory.getPath() === directory.getPath()) { return; }
    }

    this.rootDirectories.push(directory);

    let repo = null;
    for (let provider of Array.from(this.repositoryProviders)) {
      if (repo = typeof provider.repositoryForDirectorySync === 'function' ? provider.repositoryForDirectorySync(directory) : undefined) { break; }
    }
    this.repositories.push(repo != null ? repo : null);

    if ((options != null ? options.emitEvent : undefined) !== false) {
      return this.emitter.emit('did-change-paths', this.getPaths());
    }
  }

  getDirectoryForProjectPath(projectPath) {
    let directory = null;
    for (let provider of Array.from(this.directoryProviders)) {
      if (directory = typeof provider.directoryForURISync === 'function' ? provider.directoryForURISync(projectPath) : undefined) { break; }
    }
    if (directory == null) { directory = this.defaultDirectoryProvider.directoryForURISync(projectPath); }
    return directory;
  }

  // Public: remove a path from the project's list of root paths.
  //
  // * `projectPath` {String} The path to remove.
  removePath(projectPath) {
    // The projectPath may be a URI, in which case it should not be normalized.
    let needle;
    if ((needle = projectPath, !Array.from(this.getPaths()).includes(needle))) {
      projectPath = this.defaultDirectoryProvider.normalizePath(projectPath);
    }

    let indexToRemove = null;
    for (let i = 0; i < this.rootDirectories.length; i++) {
      const directory = this.rootDirectories[i];
      if (directory.getPath() === projectPath) {
        indexToRemove = i;
        break;
      }
    }

    if (indexToRemove != null) {
      const [removedDirectory] = Array.from(this.rootDirectories.splice(indexToRemove, 1));
      const [removedRepository] = Array.from(this.repositories.splice(indexToRemove, 1));
      if (!Array.from(this.repositories).includes(removedRepository)) { if (removedRepository != null) {
        removedRepository.destroy();
      } }
      this.emitter.emit("did-change-paths", this.getPaths());
      return true;
    } else {
      return false;
    }
  }

  // Public: Get an {Array} of {Directory}s associated with this project.
  getDirectories() {
    return this.rootDirectories;
  }

  resolvePath(uri) {
    if (!uri) { return; }

    if ((uri != null ? uri.match(/[A-Za-z0-9+-.]+:\/\//) : undefined)) { // leave path alone if it has a scheme
      return uri;
    } else {
      let projectPath;
      if (fs.isAbsolute(uri)) {
        return this.defaultDirectoryProvider.normalizePath(fs.resolveHome(uri));
      // TODO: what should we do here when there are multiple directories?
      } else if ((projectPath = this.getPaths()[0])) {
        return this.defaultDirectoryProvider.normalizePath(fs.resolveHome(path.join(projectPath, uri)));
      } else {
        return undefined;
      }
    }
  }

  relativize(fullPath) {
    return this.relativizePath(fullPath)[1];
  }

  // Public: Get the path to the project directory that contains the given path,
  // and the relative path from that project directory to the given path.
  //
  // * `fullPath` {String} An absolute path.
  //
  // Returns an {Array} with two elements:
  // * `projectPath` The {String} path to the project directory that contains the
  //   given path, or `null` if none is found.
  // * `relativePath` {String} The relative path from the project directory to
  //   the given path.
  relativizePath(fullPath) {
    let result = [null, fullPath];
    if (fullPath != null) {
      for (let rootDirectory of Array.from(this.rootDirectories)) {
        const relativePath = rootDirectory.relativize(fullPath);
        if ((relativePath != null ? relativePath.length : undefined) < result[1].length) {
          result = [rootDirectory.getPath(), relativePath];
        }
      }
    }
    return result;
  }

  // Public: Determines whether the given path (real or symbolic) is inside the
  // project's directory.
  //
  // This method does not actually check if the path exists, it just checks their
  // locations relative to each other.
  //
  // ## Examples
  //
  // Basic operation
  //
  // ```coffee
  // # Project's root directory is /foo/bar
  // project.contains('/foo/bar/baz')        # => true
  // project.contains('/usr/lib/baz')        # => false
  // ```
  //
  // Existence of the path is not required
  //
  // ```coffee
  // # Project's root directory is /foo/bar
  // fs.existsSync('/foo/bar/baz')           # => false
  // project.contains('/foo/bar/baz')        # => true
  // ```
  //
  // * `pathToCheck` {String} path
  //
  // Returns whether the path is inside the project's root directory.
  contains(pathToCheck) {
    return this.rootDirectories.some(dir => dir.contains(pathToCheck));
  }

  /*
  Section: Private
  */

  consumeServices({serviceHub}) {
    serviceHub.consume(
      'atom.directory-provider',
      '^0.1.0',
      provider => {
        this.directoryProviders.unshift(provider);
        return new Disposable(() => {
          return this.directoryProviders.splice(this.directoryProviders.indexOf(provider), 1);
      });
    });

    return serviceHub.consume(
      'atom.repository-provider',
      '^0.1.0',
      provider => {
        this.repositoryProviders.unshift(provider);
        if (Array.from(this.repositories).includes(null)) { this.setPaths(this.getPaths()); }
        return new Disposable(() => {
          return this.repositoryProviders.splice(this.repositoryProviders.indexOf(provider), 1);
      });
    });
  }

  // Retrieves all the {TextBuffer}s in the project; that is, the
  // buffers for all open files.
  //
  // Returns an {Array} of {TextBuffer}s.
  getBuffers() {
    return this.buffers.slice();
  }

  // Is the buffer for the given path modified?
  isPathModified(filePath) {
    return __guard__(this.findBufferForPath(this.resolvePath(filePath)), x => x.isModified());
  }

  findBufferForPath(filePath) {
    return _.find(this.buffers, buffer => buffer.getPath() === filePath);
  }

  findBufferForId(id) {
    return _.find(this.buffers, buffer => buffer.getId() === id);
  }

  // Only to be used in specs
  bufferForPathSync(filePath) {
    let existingBuffer;
    const absoluteFilePath = this.resolvePath(filePath);
    if (filePath) { existingBuffer = this.findBufferForPath(absoluteFilePath); }
    return existingBuffer != null ? existingBuffer : this.buildBufferSync(absoluteFilePath);
  }

  // Only to be used when deserializing
  bufferForIdSync(id) {
    let existingBuffer;
    if (id) { existingBuffer = this.findBufferForId(id); }
    return existingBuffer != null ? existingBuffer : this.buildBufferSync();
  }

  // Given a file path, this retrieves or creates a new {TextBuffer}.
  //
  // If the `filePath` already has a `buffer`, that value is used instead. Otherwise,
  // `text` is used as the contents of the new buffer.
  //
  // * `filePath` A {String} representing a path. If `null`, an "Untitled" buffer is created.
  //
  // Returns a {Promise} that resolves to the {TextBuffer}.
  bufferForPath(absoluteFilePath) {
    let existingBuffer;
    if (absoluteFilePath != null) { existingBuffer = this.findBufferForPath(absoluteFilePath); }
    if (existingBuffer) {
      return Promise.resolve(existingBuffer);
    } else {
      return this.buildBuffer(absoluteFilePath);
    }
  }

  shouldDestroyBufferOnFileDelete() {
    return atom.config.get('core.closeDeletedFileTabs');
  }

  // Still needed when deserializing a tokenized buffer
  buildBufferSync(absoluteFilePath) {
    let buffer;
    const params = {shouldDestroyOnFileDelete: this.shouldDestroyBufferOnFileDelete};
    if (absoluteFilePath != null) {
      buffer = TextBuffer.loadSync(absoluteFilePath, params);
    } else {
      buffer = new TextBuffer(params);
    }
    this.addBuffer(buffer);
    return buffer;
  }

  // Given a file path, this sets its {TextBuffer}.
  //
  // * `absoluteFilePath` A {String} representing a path.
  // * `text` The {String} text to use as a buffer.
  //
  // Returns a {Promise} that resolves to the {TextBuffer}.
  buildBuffer(absoluteFilePath) {
    let promise;
    const params = {shouldDestroyOnFileDelete: this.shouldDestroyBufferOnFileDelete};
    if (absoluteFilePath != null) {
      promise =
        this.loadPromisesByPath[absoluteFilePath] != null ? this.loadPromisesByPath[absoluteFilePath] : (this.loadPromisesByPath[absoluteFilePath] =
        TextBuffer.load(absoluteFilePath, params).catch(error => {
          delete this.loadPromisesByPath[absoluteFilePath];
          throw error;
        }));
    } else {
      promise = Promise.resolve(new TextBuffer(params));
    }
    return promise.then(buffer => {
      delete this.loadPromisesByPath[absoluteFilePath];
      this.addBuffer(buffer);
      return buffer;
    });
  }


  addBuffer(buffer, options) {
    if (options == null) { options = {}; }
    return this.addBufferAtIndex(buffer, this.buffers.length, options);
  }

  addBufferAtIndex(buffer, index, options) {
    if (options == null) { options = {}; }
    this.buffers.splice(index, 0, buffer);
    this.subscribeToBuffer(buffer);
    this.emitter.emit('did-add-buffer', buffer);
    return buffer;
  }

  // Removes a {TextBuffer} association from the project.
  //
  // Returns the removed {TextBuffer}.
  removeBuffer(buffer) {
    const index = this.buffers.indexOf(buffer);
    if (index !== -1) { return this.removeBufferAtIndex(index); }
  }

  removeBufferAtIndex(index, options) {
    if (options == null) { options = {}; }
    const [buffer] = Array.from(this.buffers.splice(index, 1));
    return (buffer != null ? buffer.destroy() : undefined);
  }

  eachBuffer(...args) {
    let subscriber;
    if (args.length > 1) { subscriber = args.shift(); }
    const callback = args.shift();

    for (let buffer of Array.from(this.getBuffers())) { callback(buffer); }
    if (subscriber) {
      return subscriber.subscribe(this, 'buffer-created', buffer => callback(buffer));
    } else {
      return this.on('buffer-created', buffer => callback(buffer));
    }
  }

  subscribeToBuffer(buffer) {
    buffer.onWillSave(({path}) => this.applicationDelegate.emitWillSavePath(path));
    buffer.onDidSave(({path}) => this.applicationDelegate.emitDidSavePath(path));
    buffer.onDidDestroy(() => this.removeBuffer(buffer));
    buffer.onDidChangePath(() => {
      if (!(this.getPaths().length > 0)) {
        return this.setPaths([path.dirname(buffer.getPath())]);
      }
    });
    return buffer.onWillThrowWatchError(({error, handle}) => {
      handle();
      return this.notificationManager.addWarning(`\
Unable to read file after file \`${error.eventType}\` event.
Make sure you have permission to access \`${buffer.getPath()}\`.\
`, {
        detail: error.message,
        dismissable: true
      }
      );
    });
  }
});

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