/** @babel */
/* eslint-disable
    no-cond-assign,
    no-return-assign,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let GitRepository
const { join } = require('path')

const _ = require('underscore-plus')
const { Emitter, Disposable, CompositeDisposable } = require('event-kit')
const fs = require('fs-plus')
const path = require('path')
const GitUtils = require('git-utils')

const Task = require('./task')

// Extended: Represents the underlying git operations performed by Atom.
//
// This class shouldn't be instantiated directly but instead by accessing the
// `atom.project` global and calling `getRepositories()`. Note that this will
// only be available when the project is backed by a Git repository.
//
// This class handles submodules automatically by taking a `path` argument to many
// of the methods.  This `path` argument will determine which underlying
// repository is used.
//
// For a repository with submodules this would have the following outcome:
//
// ```coffee
// repo = atom.project.getRepositories()[0]
// repo.getShortHead() # 'master'
// repo.getShortHead('vendor/path/to/a/submodule') # 'dead1234'
// ```
//
// ## Examples
//
// ### Logging the URL of the origin remote
//
// ```coffee
// git = atom.project.getRepositories()[0]
// console.log git.getOriginURL()
// ```
//
// ### Requiring in packages
//
// ```coffee
// {GitRepository} = require 'atom'
// ```
module.exports =
(GitRepository = class GitRepository {
  static exists (path) {
    let git
    if (git = this.open(path)) {
      git.destroy()
      return true
    } else {
      return false
    }
  }

  /*
  Section: Construction and Destruction
  */

  // Public: Creates a new GitRepository instance.
  //
  // * `path` The {String} path to the Git repository to open.
  // * `options` An optional {Object} with the following keys:
  //   * `refreshOnWindowFocus` A {Boolean}, `true` to refresh the index and
  //     statuses when the window is focused.
  //
  // Returns a {GitRepository} instance or `null` if the repository could not be opened.
  static open (path, options) {
    if (!path) { return null }
    try {
      return new GitRepository(path, options)
    } catch (error) {
      return null
    }
  }

  constructor (path, options) {
    let refreshOnWindowFocus
    if (options == null) { options = {} }
    this.emitter = new Emitter()
    this.subscriptions = new CompositeDisposable()

    this.repo = GitUtils.open(path)
    if (this.repo == null) {
      throw new Error(`No Git repository found searching path: ${path}`)
    }

    this.statuses = {}
    this.upstream = { ahead: 0, behind: 0 }
    for (let submodulePath in this.repo.submodules) {
      const submoduleRepo = this.repo.submodules[submodulePath]
      submoduleRepo.upstream = { ahead: 0, behind: 0 }
    }

    ({ project: this.project, config: this.config, refreshOnWindowFocus } = options)

    if (refreshOnWindowFocus == null) { refreshOnWindowFocus = true }
    if (refreshOnWindowFocus) {
      const onWindowFocus = () => {
        this.refreshIndex()
        return this.refreshStatus()
      }

      window.addEventListener('focus', onWindowFocus)
      this.subscriptions.add(new Disposable(function () { return window.removeEventListener('focus', onWindowFocus) }))
    }

    if (this.project != null) {
      this.project.getBuffers().forEach(buffer => this.subscribeToBuffer(buffer))
      this.subscriptions.add(this.project.onDidAddBuffer(buffer => this.subscribeToBuffer(buffer)))
    }
  }

  // Public: Destroy this {GitRepository} object.
  //
  // This destroys any tasks and subscriptions and releases the underlying
  // libgit2 repository handle. This method is idempotent.
  destroy () {
    if (this.emitter != null) {
      this.emitter.emit('did-destroy')
      this.emitter.dispose()
      this.emitter = null
    }

    if (this.statusTask != null) {
      this.statusTask.terminate()
      this.statusTask = null
    }

    if (this.repo != null) {
      this.repo.release()
      this.repo = null
    }

    if (this.subscriptions != null) {
      this.subscriptions.dispose()
      return this.subscriptions = null
    }
  }

  // Public: Returns a {Boolean} indicating if this repository has been destroyed.
  isDestroyed () {
    return (this.repo == null)
  }

  // Public: Invoke the given callback when this GitRepository's destroy() method
  // is invoked.
  //
  // * `callback` {Function}
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidDestroy (callback) {
    return this.emitter.once('did-destroy', callback)
  }

  /*
  Section: Event Subscription
  */

  // Public: Invoke the given callback when a specific file's status has
  // changed. When a file is updated, reloaded, etc, and the status changes, this
  // will be fired.
  //
  // * `callback` {Function}
  //   * `event` {Object}
  //     * `path` {String} the old parameters the decoration used to have
  //     * `pathStatus` {Number} representing the status. This value can be passed to
  //       {::isStatusModified} or {::isStatusNew} to get more information.
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChangeStatus (callback) {
    return this.emitter.on('did-change-status', callback)
  }

  // Public: Invoke the given callback when a multiple files' statuses have
  // changed. For example, on window focus, the status of all the paths in the
  // repo is checked. If any of them have changed, this will be fired. Call
  // {::getPathStatus(path)} to get the status for your path of choice.
  //
  // * `callback` {Function}
  //
  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChangeStatuses (callback) {
    return this.emitter.on('did-change-statuses', callback)
  }

  /*
  Section: Repository Details
  */

  // Public: A {String} indicating the type of version control system used by
  // this repository.
  //
  // Returns `"git"`.
  getType () { return 'git' }

  // Public: Returns the {String} path of the repository.
  getPath () {
    return this.path != null ? this.path : (this.path = fs.absolute(this.getRepo().getPath()))
  }

  // Public: Returns the {String} working directory path of the repository.
  getWorkingDirectory () { return this.getRepo().getWorkingDirectory() }

  // Public: Returns true if at the root, false if in a subfolder of the
  // repository.
  isProjectAtRoot () {
    return this.projectAtRoot != null ? this.projectAtRoot : (this.projectAtRoot = (this.project != null ? this.project.relativize(this.getWorkingDirectory()) : undefined) === '')
  }

  // Public: Makes a path relative to the repository's working directory.
  relativize (path) { return this.getRepo().relativize(path) }

  // Public: Returns true if the given branch exists.
  hasBranch (branch) { return (this.getReferenceTarget(`refs/heads/${branch}`) != null) }

  // Public: Retrieves a shortened version of the HEAD reference value.
  //
  // This removes the leading segments of `refs/heads`, `refs/tags`, or
  // `refs/remotes`.  It also shortens the SHA-1 of a detached `HEAD` to 7
  // characters.
  //
  // * `path` An optional {String} path in the repository to get this information
  //   for, only needed if the repository contains submodules.
  //
  // Returns a {String}.
  getShortHead (path) { return this.getRepo(path).getShortHead() }

  // Public: Is the given path a submodule in the repository?
  //
  // * `path` The {String} path to check.
  //
  // Returns a {Boolean}.
  isSubmodule (path) {
    if (!path) { return false }

    const repo = this.getRepo(path)
    if (repo.isSubmodule(repo.relativize(path))) {
      return true
    } else {
      // Check if the path is a working directory in a repo that isn't the root.
      return (repo !== this.getRepo()) && (repo.relativize(join(path, 'dir')) === 'dir')
    }
  }

  // Public: Returns the number of commits behind the current branch is from the
  // its upstream remote branch.
  //
  // * `reference` The {String} branch reference name.
  // * `path`      The {String} path in the repository to get this information for,
  //   only needed if the repository contains submodules.
  getAheadBehindCount (reference, path) {
    return this.getRepo(path).getAheadBehindCount(reference)
  }

  // Public: Get the cached ahead/behind commit counts for the current branch's
  // upstream branch.
  //
  // * `path` An optional {String} path in the repository to get this information
  //   for, only needed if the repository has submodules.
  //
  // Returns an {Object} with the following keys:
  //   * `ahead`  The {Number} of commits ahead.
  //   * `behind` The {Number} of commits behind.
  getCachedUpstreamAheadBehindCount (path) {
    let left
    return (left = this.getRepo(path).upstream) != null ? left : this.upstream
  }

  // Public: Returns the git configuration value specified by the key.
  //
  // * `key`  The {String} key for the configuration to lookup.
  // * `path` An optional {String} path in the repository to get this information
  //   for, only needed if the repository has submodules.
  getConfigValue (key, path) { return this.getRepo(path).getConfigValue(key) }

  // Public: Returns the origin url of the repository.
  //
  // * `path` (optional) {String} path in the repository to get this information
  //   for, only needed if the repository has submodules.
  getOriginURL (path) { return this.getConfigValue('remote.origin.url', path) }

  // Public: Returns the upstream branch for the current HEAD, or null if there
  // is no upstream branch for the current HEAD.
  //
  // * `path` An optional {String} path in the repo to get this information for,
  //   only needed if the repository contains submodules.
  //
  // Returns a {String} branch name such as `refs/remotes/origin/master`.
  getUpstreamBranch (path) { return this.getRepo(path).getUpstreamBranch() }

  // Public: Gets all the local and remote references.
  //
  // * `path` An optional {String} path in the repository to get this information
  //   for, only needed if the repository has submodules.
  //
  // Returns an {Object} with the following keys:
  //  * `heads`   An {Array} of head reference names.
  //  * `remotes` An {Array} of remote reference names.
  //  * `tags`    An {Array} of tag reference names.
  getReferences (path) { return this.getRepo(path).getReferences() }

  // Public: Returns the current {String} SHA for the given reference.
  //
  // * `reference` The {String} reference to get the target of.
  // * `path` An optional {String} path in the repo to get the reference target
  //   for. Only needed if the repository contains submodules.
  getReferenceTarget (reference, path) {
    return this.getRepo(path).getReferenceTarget(reference)
  }

  /*
  Section: Reading Status
  */

  // Public: Returns true if the given path is modified.
  //
  // * `path` The {String} path to check.
  //
  // Returns a {Boolean} that's true if the `path` is modified.
  isPathModified (path) { return this.isStatusModified(this.getPathStatus(path)) }

  // Public: Returns true if the given path is new.
  //
  // * `path` The {String} path to check.
  //
  // Returns a {Boolean} that's true if the `path` is new.
  isPathNew (path) { return this.isStatusNew(this.getPathStatus(path)) }

  // Public: Is the given path ignored?
  //
  // * `path` The {String} path to check.
  //
  // Returns a {Boolean} that's true if the `path` is ignored.
  isPathIgnored (path) { return this.getRepo().isIgnored(this.relativize(path)) }

  // Public: Get the status of a directory in the repository's working directory.
  //
  // * `path` The {String} path to check.
  //
  // Returns a {Number} representing the status. This value can be passed to
  // {::isStatusModified} or {::isStatusNew} to get more information.
  getDirectoryStatus (directoryPath) {
    directoryPath = `${this.relativize(directoryPath)}/`
    let directoryStatus = 0
    for (let statusPath in this.statuses) {
      const status = this.statuses[statusPath]
      if (statusPath.indexOf(directoryPath) === 0) { directoryStatus |= status }
    }
    return directoryStatus
  }

  // Public: Get the status of a single path in the repository.
  //
  // * `path` A {String} repository-relative path.
  //
  // Returns a {Number} representing the status. This value can be passed to
  // {::isStatusModified} or {::isStatusNew} to get more information.
  getPathStatus (path) {
    let left
    const repo = this.getRepo(path)
    const relativePath = this.relativize(path)
    const currentPathStatus = this.statuses[relativePath] != null ? this.statuses[relativePath] : 0
    let pathStatus = (left = repo.getStatus(repo.relativize(path))) != null ? left : 0
    if (repo.isStatusIgnored(pathStatus)) { pathStatus = 0 }
    if (pathStatus > 0) {
      this.statuses[relativePath] = pathStatus
    } else {
      delete this.statuses[relativePath]
    }
    if (currentPathStatus !== pathStatus) {
      this.emitter.emit('did-change-status', { path, pathStatus })
    }

    return pathStatus
  }

  // Public: Get the cached status for the given path.
  //
  // * `path` A {String} path in the repository, relative or absolute.
  //
  // Returns a status {Number} or null if the path is not in the cache.
  getCachedPathStatus (path) {
    return this.statuses[this.relativize(path)]
  }

  // Public: Returns true if the given status indicates modification.
  //
  // * `status` A {Number} representing the status.
  //
  // Returns a {Boolean} that's true if the `status` indicates modification.
  isStatusModified (status) { return this.getRepo().isStatusModified(status) }

  // Public: Returns true if the given status indicates a new path.
  //
  // * `status` A {Number} representing the status.
  //
  // Returns a {Boolean} that's true if the `status` indicates a new path.
  isStatusNew (status) { return this.getRepo().isStatusNew(status) }

  /*
  Section: Retrieving Diffs
  */

  // Public: Retrieves the number of lines added and removed to a path.
  //
  // This compares the working directory contents of the path to the `HEAD`
  // version.
  //
  // * `path` The {String} path to check.
  //
  // Returns an {Object} with the following keys:
  //   * `added` The {Number} of added lines.
  //   * `deleted` The {Number} of deleted lines.
  getDiffStats (path) {
    const repo = this.getRepo(path)
    return repo.getDiffStats(repo.relativize(path))
  }

  // Public: Retrieves the line diffs comparing the `HEAD` version of the given
  // path and the given text.
  //
  // * `path` The {String} path relative to the repository.
  // * `text` The {String} to compare against the `HEAD` contents
  //
  // Returns an {Array} of hunk {Object}s with the following keys:
  //   * `oldStart` The line {Number} of the old hunk.
  //   * `newStart` The line {Number} of the new hunk.
  //   * `oldLines` The {Number} of lines in the old hunk.
  //   * `newLines` The {Number} of lines in the new hunk
  getLineDiffs (path, text) {
    // Ignore eol of line differences on windows so that files checked in as
    // LF don't report every line modified when the text contains CRLF endings.
    const options = { ignoreEolWhitespace: process.platform === 'win32' }
    const repo = this.getRepo(path)
    return repo.getLineDiffs(repo.relativize(path), text, options)
  }

  /*
  Section: Checking Out
  */

  // Public: Restore the contents of a path in the working directory and index
  // to the version at `HEAD`.
  //
  // This is essentially the same as running:
  //
  // ```sh
  //   git reset HEAD -- <path>
  //   git checkout HEAD -- <path>
  // ```
  //
  // * `path` The {String} path to checkout.
  //
  // Returns a {Boolean} that's true if the method was successful.
  checkoutHead (path) {
    const repo = this.getRepo(path)
    const headCheckedOut = repo.checkoutHead(repo.relativize(path))
    if (headCheckedOut) { this.getPathStatus(path) }
    return headCheckedOut
  }

  // Public: Checks out a branch in your repository.
  //
  // * `reference` The {String} reference to checkout.
  // * `create`    A {Boolean} value which, if true creates the new reference if
  //   it doesn't exist.
  //
  // Returns a Boolean that's true if the method was successful.
  checkoutReference (reference, create) {
    return this.getRepo().checkoutReference(reference, create)
  }

  /*
  Section: Private
  */

  // Subscribes to buffer events.
  subscribeToBuffer (buffer) {
    const getBufferPathStatus = () => {
      let bufferPath
      if (bufferPath = buffer.getPath()) {
        return this.getPathStatus(bufferPath)
      }
    }

    getBufferPathStatus()
    const bufferSubscriptions = new CompositeDisposable()
    bufferSubscriptions.add(buffer.onDidSave(getBufferPathStatus))
    bufferSubscriptions.add(buffer.onDidReload(getBufferPathStatus))
    bufferSubscriptions.add(buffer.onDidChangePath(getBufferPathStatus))
    bufferSubscriptions.add(buffer.onDidDestroy(() => {
      bufferSubscriptions.dispose()
      return this.subscriptions.remove(bufferSubscriptions)
    })
    )
    this.subscriptions.add(bufferSubscriptions)
  }

  // Subscribes to editor view event.
  checkoutHeadForEditor (editor) {
    let filePath
    const buffer = editor.getBuffer()
    if (filePath = buffer.getPath()) {
      this.checkoutHead(filePath)
      return buffer.reload()
    }
  }

  // Returns the corresponding {Repository}
  getRepo (path) {
    if (this.repo != null) {
      let left
      return (left = this.repo.submoduleForPath(path)) != null ? left : this.repo
    } else {
      throw new Error('Repository has been destroyed')
    }
  }

  // Reread the index to update any values that have changed since the
  // last time the index was read.
  refreshIndex () { return this.getRepo().refreshIndex() }

  // Refreshes the current git status in an outside process and asynchronously
  // updates the relevant properties.
  refreshStatus () {
    if (this.handlerPath == null) { this.handlerPath = require.resolve('./repository-status-handler') }

    const relativeProjectPaths = this.project != null ? this.project.getPaths()
      .map(projectPath => this.relativize(projectPath))
      .filter(projectPath => (projectPath.length > 0) && !path.isAbsolute(projectPath)) : undefined

    if (this.statusTask != null) {
      this.statusTask.terminate()
    }
    return new Promise(resolve => {
      return this.statusTask = Task.once(this.handlerPath, this.getPath(), relativeProjectPaths, ({ statuses, upstream, branch, submodules }) => {
        const statusesUnchanged = _.isEqual(statuses, this.statuses) &&
                            _.isEqual(upstream, this.upstream) &&
                            _.isEqual(branch, this.branch) &&
                            _.isEqual(submodules, this.submodules)

        this.statuses = statuses
        this.upstream = upstream
        this.branch = branch
        this.submodules = submodules

        const object = this.getRepo().submodules
        for (let submodulePath in object) {
          const submoduleRepo = object[submodulePath]
          submoduleRepo.upstream = (submodules[submodulePath] != null ? submodules[submodulePath].upstream : undefined) != null ? (submodules[submodulePath] != null ? submodules[submodulePath].upstream : undefined) : { ahead: 0, behind: 0 }
        }

        if (!statusesUnchanged) {
          this.emitter.emit('did-change-statuses')
        }
        return resolve()
      })
    })
  }
})
