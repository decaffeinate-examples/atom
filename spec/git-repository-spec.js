/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const temp = require('temp').track()
const GitRepository = require('../src/git-repository')
const fs = require('fs-plus')
const path = require('path')
const Project = require('../src/project')

const copyRepository = function () {
  const workingDirPath = temp.mkdirSync('atom-spec-git')
  fs.copySync(path.join(__dirname, 'fixtures', 'git', 'working-dir'), workingDirPath)
  fs.renameSync(path.join(workingDirPath, 'git.git'), path.join(workingDirPath, '.git'))
  return workingDirPath
}

describe('GitRepository', function () {
  let repo = null

  beforeEach(function () {
    const gitPath = path.join(temp.dir, '.git')
    if (fs.isDirectorySync(gitPath)) { return fs.removeSync(gitPath) }
  })

  afterEach(function () {
    if ((repo != null ? repo.repo : undefined) != null) { repo.destroy() }
    try {
      return temp.cleanupSync()
    } catch (error) {}
  }) // These tests sometimes lag at shutting down resources

  describe('@open(path)', () =>
    it('returns null when no repository is found', () => expect(GitRepository.open(path.join(temp.dir, 'nogit.txt'))).toBeNull())
  )

  describe('new GitRepository(path)', () =>
    it('throws an exception when no repository is found', () => expect(() => new GitRepository(path.join(temp.dir, 'nogit.txt'))).toThrow())
  )

  describe('.getPath()', function () {
    it('returns the repository path for a .git directory path with a directory', function () {
      repo = new GitRepository(path.join(__dirname, 'fixtures', 'git', 'master.git', 'objects'))
      return expect(repo.getPath()).toBe(path.join(__dirname, 'fixtures', 'git', 'master.git'))
    })

    return it('returns the repository path for a repository path', function () {
      repo = new GitRepository(path.join(__dirname, 'fixtures', 'git', 'master.git'))
      return expect(repo.getPath()).toBe(path.join(__dirname, 'fixtures', 'git', 'master.git'))
    })
  })

  describe('.isPathIgnored(path)', function () {
    it('returns true for an ignored path', function () {
      repo = new GitRepository(path.join(__dirname, 'fixtures', 'git', 'ignore.git'))
      return expect(repo.isPathIgnored('a.txt')).toBeTruthy()
    })

    return it('returns false for a non-ignored path', function () {
      repo = new GitRepository(path.join(__dirname, 'fixtures', 'git', 'ignore.git'))
      return expect(repo.isPathIgnored('b.txt')).toBeFalsy()
    })
  })

  describe('.isPathModified(path)', function () {
    let filePath, newPath;
    [repo, filePath, newPath] = Array.from([])

    beforeEach(function () {
      const workingDirPath = copyRepository()
      repo = new GitRepository(workingDirPath)
      filePath = path.join(workingDirPath, 'a.txt')
      return newPath = path.join(workingDirPath, 'new-path.txt')
    })

    return describe('when the path is unstaged', function () {
      it('returns false if the path has not been modified', () => expect(repo.isPathModified(filePath)).toBeFalsy())

      it('returns true if the path is modified', function () {
        fs.writeFileSync(filePath, 'change')
        return expect(repo.isPathModified(filePath)).toBeTruthy()
      })

      it('returns true if the path is deleted', function () {
        fs.removeSync(filePath)
        return expect(repo.isPathModified(filePath)).toBeTruthy()
      })

      return it('returns false if the path is new', () => expect(repo.isPathModified(newPath)).toBeFalsy())
    })
  })

  describe('.isPathNew(path)', function () {
    let [filePath, newPath] = Array.from([])

    beforeEach(function () {
      const workingDirPath = copyRepository()
      repo = new GitRepository(workingDirPath)
      filePath = path.join(workingDirPath, 'a.txt')
      newPath = path.join(workingDirPath, 'new-path.txt')
      return fs.writeFileSync(newPath, "i'm new here")
    })

    return describe('when the path is unstaged', function () {
      it('returns true if the path is new', () => expect(repo.isPathNew(newPath)).toBeTruthy())

      return it("returns false if the path isn't new", () => expect(repo.isPathNew(filePath)).toBeFalsy())
    })
  })

  describe('.checkoutHead(path)', function () {
    let [filePath] = Array.from([])

    beforeEach(function () {
      const workingDirPath = copyRepository()
      repo = new GitRepository(workingDirPath)
      return filePath = path.join(workingDirPath, 'a.txt')
    })

    it('no longer reports a path as modified after checkout', function () {
      expect(repo.isPathModified(filePath)).toBeFalsy()
      fs.writeFileSync(filePath, 'ch ch changes')
      expect(repo.isPathModified(filePath)).toBeTruthy()
      expect(repo.checkoutHead(filePath)).toBeTruthy()
      return expect(repo.isPathModified(filePath)).toBeFalsy()
    })

    it('restores the contents of the path to the original text', function () {
      fs.writeFileSync(filePath, 'ch ch changes')
      expect(repo.checkoutHead(filePath)).toBeTruthy()
      return expect(fs.readFileSync(filePath, 'utf8')).toBe('')
    })

    return it('fires a status-changed event if the checkout completes successfully', function () {
      fs.writeFileSync(filePath, 'ch ch changes')
      repo.getPathStatus(filePath)
      const statusHandler = jasmine.createSpy('statusHandler')
      repo.onDidChangeStatus(statusHandler)
      repo.checkoutHead(filePath)
      expect(statusHandler.callCount).toBe(1)
      expect(statusHandler.argsForCall[0][0]).toEqual({ path: filePath, pathStatus: 0 })

      repo.checkoutHead(filePath)
      return expect(statusHandler.callCount).toBe(1)
    })
  })

  describe('.checkoutHeadForEditor(editor)', function () {
    let [filePath, editor] = Array.from([])

    beforeEach(function () {
      spyOn(atom, 'confirm')

      const workingDirPath = copyRepository()
      repo = new GitRepository(workingDirPath, { project: atom.project, config: atom.config, confirm: atom.confirm })
      filePath = path.join(workingDirPath, 'a.txt')
      fs.writeFileSync(filePath, 'ch ch changes')

      waitsForPromise(() => atom.workspace.open(filePath))

      return runs(() => editor = atom.workspace.getActiveTextEditor())
    })

    it('displays a confirmation dialog by default', function () {
      if (process.platform === 'win32') { return } // Permissions issues with this test on Windows

      atom.confirm.andCallFake(({ buttons }) => buttons.OK())
      atom.config.set('editor.confirmCheckoutHeadRevision', true)

      repo.checkoutHeadForEditor(editor)

      return expect(fs.readFileSync(filePath, 'utf8')).toBe('')
    })

    return it('does not display a dialog when confirmation is disabled', function () {
      if (process.platform === 'win32') { return } // Flakey EPERM opening a.txt on Win32
      atom.config.set('editor.confirmCheckoutHeadRevision', false)

      repo.checkoutHeadForEditor(editor)

      expect(fs.readFileSync(filePath, 'utf8')).toBe('')
      return expect(atom.confirm).not.toHaveBeenCalled()
    })
  })

  describe('.destroy()', () =>
    it('throws an exception when any method is called after it is called', function () {
      repo = new GitRepository(path.join(__dirname, 'fixtures', 'git', 'master.git'))
      repo.destroy()
      return expect(() => repo.getShortHead()).toThrow()
    })
  )

  describe('.getPathStatus(path)', function () {
    let [filePath] = Array.from([])

    beforeEach(function () {
      const workingDirectory = copyRepository()
      repo = new GitRepository(workingDirectory)
      return filePath = path.join(workingDirectory, 'file.txt')
    })

    return it('trigger a status-changed event when the new status differs from the last cached one', function () {
      const statusHandler = jasmine.createSpy('statusHandler')
      repo.onDidChangeStatus(statusHandler)
      fs.writeFileSync(filePath, '')
      let status = repo.getPathStatus(filePath)
      expect(statusHandler.callCount).toBe(1)
      expect(statusHandler.argsForCall[0][0]).toEqual({ path: filePath, pathStatus: status })

      fs.writeFileSync(filePath, 'abc')
      status = repo.getPathStatus(filePath)
      return expect(statusHandler.callCount).toBe(1)
    })
  })

  describe('.getDirectoryStatus(path)', function () {
    let [directoryPath, filePath] = Array.from([])

    beforeEach(function () {
      const workingDirectory = copyRepository()
      repo = new GitRepository(workingDirectory)
      directoryPath = path.join(workingDirectory, 'dir')
      return filePath = path.join(directoryPath, 'b.txt')
    })

    return it('gets the status based on the files inside the directory', function () {
      expect(repo.isStatusModified(repo.getDirectoryStatus(directoryPath))).toBe(false)
      fs.writeFileSync(filePath, 'abc')
      repo.getPathStatus(filePath)
      return expect(repo.isStatusModified(repo.getDirectoryStatus(directoryPath))).toBe(true)
    })
  })

  describe('.refreshStatus()', function () {
    let [newPath, modifiedPath, cleanPath, workingDirectory] = Array.from([])

    beforeEach(function () {
      workingDirectory = copyRepository()
      repo = new GitRepository(workingDirectory, { project: atom.project, config: atom.config })
      modifiedPath = path.join(workingDirectory, 'file.txt')
      newPath = path.join(workingDirectory, 'untracked.txt')
      cleanPath = path.join(workingDirectory, 'other.txt')
      fs.writeFileSync(cleanPath, 'Full of text')
      fs.writeFileSync(newPath, '')
      return newPath = fs.absolute(newPath)
    }) // specs could be running under symbol path.

    it('returns status information for all new and modified files', function () {
      fs.writeFileSync(modifiedPath, 'making this path modified')
      const statusHandler = jasmine.createSpy('statusHandler')
      repo.onDidChangeStatuses(statusHandler)
      repo.refreshStatus()

      waitsFor(() => statusHandler.callCount > 0)

      return runs(function () {
        expect(repo.getCachedPathStatus(cleanPath)).toBeUndefined()
        expect(repo.isStatusNew(repo.getCachedPathStatus(newPath))).toBeTruthy()
        return expect(repo.isStatusModified(repo.getCachedPathStatus(modifiedPath))).toBeTruthy()
      })
    })

    it('caches the proper statuses when a subdir is open', function () {
      const subDir = path.join(workingDirectory, 'dir')
      fs.mkdirSync(subDir)

      const filePath = path.join(subDir, 'b.txt')
      fs.writeFileSync(filePath, '')

      atom.project.setPaths([subDir])

      waitsForPromise(() => atom.workspace.open('b.txt'))

      let statusHandler = null
      runs(function () {
        repo = atom.project.getRepositories()[0]

        statusHandler = jasmine.createSpy('statusHandler')
        repo.onDidChangeStatuses(statusHandler)
        return repo.refreshStatus()
      })

      waitsFor(() => statusHandler.callCount > 0)

      return runs(function () {
        const status = repo.getCachedPathStatus(filePath)
        expect(repo.isStatusModified(status)).toBe(false)
        return expect(repo.isStatusNew(status)).toBe(false)
      })
    })

    it('works correctly when the project has multiple folders (regression)', function () {
      atom.project.addPath(workingDirectory)
      atom.project.addPath(path.join(__dirname, 'fixtures', 'dir'))
      const statusHandler = jasmine.createSpy('statusHandler')
      repo.onDidChangeStatuses(statusHandler)

      repo.refreshStatus()

      waitsFor(() => statusHandler.callCount > 0)

      return runs(function () {
        expect(repo.getCachedPathStatus(cleanPath)).toBeUndefined()
        expect(repo.isStatusNew(repo.getCachedPathStatus(newPath))).toBeTruthy()
        return expect(repo.isStatusModified(repo.getCachedPathStatus(modifiedPath))).toBeTruthy()
      })
    })

    return it('caches statuses that were looked up synchronously', function () {
      const originalContent = 'undefined'
      fs.writeFileSync(modifiedPath, 'making this path modified')
      repo.getPathStatus('file.txt')

      fs.writeFileSync(modifiedPath, originalContent)
      waitsForPromise(() => repo.refreshStatus())
      return runs(() => expect(repo.isStatusModified(repo.getCachedPathStatus(modifiedPath))).toBeFalsy())
    })
  })

  describe('buffer events', function () {
    let [editor] = Array.from([])

    beforeEach(function () {
      atom.project.setPaths([copyRepository()])

      return waitsForPromise(() => atom.workspace.open('other.txt').then(o => editor = o))
    })

    it('emits a status-changed event when a buffer is saved', function () {
      editor.insertNewline()

      const statusHandler = jasmine.createSpy('statusHandler')
      atom.project.getRepositories()[0].onDidChangeStatus(statusHandler)

      waitsForPromise(() => editor.save())

      return runs(function () {
        expect(statusHandler.callCount).toBe(1)
        return expect(statusHandler).toHaveBeenCalledWith({ path: editor.getPath(), pathStatus: 256 })
      })
    })

    it('emits a status-changed event when a buffer is reloaded', function () {
      fs.writeFileSync(editor.getPath(), 'changed')

      const statusHandler = jasmine.createSpy('statusHandler')
      atom.project.getRepositories()[0].onDidChangeStatus(statusHandler)

      waitsForPromise(() => editor.getBuffer().reload())

      runs(function () {
        expect(statusHandler.callCount).toBe(1)
        return expect(statusHandler).toHaveBeenCalledWith({ path: editor.getPath(), pathStatus: 256 })
      })

      waitsForPromise(() => editor.getBuffer().reload())

      return runs(() => expect(statusHandler.callCount).toBe(1))
    })

    it("emits a status-changed event when a buffer's path changes", function () {
      fs.writeFileSync(editor.getPath(), 'changed')

      const statusHandler = jasmine.createSpy('statusHandler')
      atom.project.getRepositories()[0].onDidChangeStatus(statusHandler)
      editor.getBuffer().emitter.emit('did-change-path')
      expect(statusHandler.callCount).toBe(1)
      expect(statusHandler).toHaveBeenCalledWith({ path: editor.getPath(), pathStatus: 256 })
      editor.getBuffer().emitter.emit('did-change-path')
      return expect(statusHandler.callCount).toBe(1)
    })

    return it('stops listening to the buffer when the repository is destroyed (regression)', function () {
      atom.project.getRepositories()[0].destroy()
      return expect(() => editor.save()).not.toThrow()
    })
  })

  return describe('when a project is deserialized', function () {
    let [buffer, project2, statusHandler] = Array.from([])

    afterEach(() => project2 != null ? project2.destroy() : undefined)

    return it('subscribes to all the serialized buffers in the project', function () {
      atom.project.setPaths([copyRepository()])

      waitsForPromise(() => atom.workspace.open('file.txt'))

      waitsForPromise(function () {
        project2 = new Project({ notificationManager: atom.notifications, packageManager: atom.packages, confirm: atom.confirm, applicationDelegate: atom.applicationDelegate })
        return project2.deserialize(atom.project.serialize({ isUnloading: false }))
      })

      waitsFor(() => buffer = project2.getBuffers()[0])

      waitsForPromise(function () {
        const originalContent = buffer.getText()
        buffer.append('changes')

        statusHandler = jasmine.createSpy('statusHandler')
        project2.getRepositories()[0].onDidChangeStatus(statusHandler)
        return buffer.save()
      })

      return runs(function () {
        expect(statusHandler.callCount).toBe(1)
        return expect(statusHandler).toHaveBeenCalledWith({ path: buffer.getPath(), pathStatus: 256 })
      })
    })
  })
})
