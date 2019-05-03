/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const fs = require('fs-plus');
const temp = require('temp').track();
const {Directory} = require('pathwatcher');
const GitRepository = require('../src/git-repository');
const GitRepositoryProvider = require('../src/git-repository-provider');

describe("GitRepositoryProvider", function() {
  let provider = null;

  beforeEach(() => provider = new GitRepositoryProvider(atom.project, atom.config, atom.confirm));

  afterEach(() => temp.cleanupSync());

  return describe(".repositoryForDirectory(directory)", function() {
    describe("when specified a Directory with a Git repository", function() {
      it("returns a Promise that resolves to a GitRepository", () =>
        waitsForPromise(function() {
          const directory = new Directory(path.join(__dirname, 'fixtures', 'git', 'master.git'));
          return provider.repositoryForDirectory(directory).then(function(result) {
            expect(result).toBeInstanceOf(GitRepository);
            expect(provider.pathToRepository[result.getPath()]).toBeTruthy();
            expect(result.statusTask).toBeTruthy();
            return expect(result.getType()).toBe('git');
          });
        })
      );

      return it("returns the same GitRepository for different Directory objects in the same repo", function() {
        let firstRepo = null;
        let secondRepo = null;

        waitsForPromise(function() {
          const directory = new Directory(path.join(__dirname, 'fixtures', 'git', 'master.git'));
          return provider.repositoryForDirectory(directory).then(result => firstRepo = result);
        });

        waitsForPromise(function() {
          const directory = new Directory(path.join(__dirname, 'fixtures', 'git', 'master.git', 'objects'));
          return provider.repositoryForDirectory(directory).then(result => secondRepo = result);
        });

        return runs(function() {
          expect(firstRepo).toBeInstanceOf(GitRepository);
          return expect(firstRepo).toBe(secondRepo);
        });
      });
    });

    describe("when specified a Directory without a Git repository", () =>
      it("returns a Promise that resolves to null", () =>
        waitsForPromise(function() {
          const directory = new Directory(temp.mkdirSync('dir'));
          return provider.repositoryForDirectory(directory).then(result => expect(result).toBe(null));
        })
      )
    );

    describe("when specified a Directory with an invalid Git repository", () =>
      it("returns a Promise that resolves to null", () =>
        waitsForPromise(function() {
          const dirPath = temp.mkdirSync('dir');
          fs.writeFileSync(path.join(dirPath, '.git', 'objects'), '');
          fs.writeFileSync(path.join(dirPath, '.git', 'HEAD'), '');
          fs.writeFileSync(path.join(dirPath, '.git', 'refs'), '');

          const directory = new Directory(dirPath);
          return provider.repositoryForDirectory(directory).then(result => expect(result).toBe(null));
        })
      )
    );

    describe("when specified a Directory with a valid gitfile-linked repository", () =>
      it("returns a Promise that resolves to a GitRepository", () =>
        waitsForPromise(function() {
          const gitDirPath = path.join(__dirname, 'fixtures', 'git', 'master.git');
          const workDirPath = temp.mkdirSync('git-workdir');
          fs.writeFileSync(path.join(workDirPath, '.git'), `gitdir: ${gitDirPath}\n`);

          const directory = new Directory(workDirPath);
          return provider.repositoryForDirectory(directory).then(function(result) {
            expect(result).toBeInstanceOf(GitRepository);
            expect(provider.pathToRepository[result.getPath()]).toBeTruthy();
            expect(result.statusTask).toBeTruthy();
            return expect(result.getType()).toBe('git');
          });
        })
      )
    );

    return describe("when specified a Directory without existsSync()", function() {
      let directory = null;
      provider = null;
      beforeEach(function() {
        // An implementation of Directory that does not implement existsSync().
        const subdirectory = {};
        directory = {
          getSubdirectory() {},
          isRoot() { return true; }
        };
        return spyOn(directory, "getSubdirectory").andReturn(subdirectory);
      });

      it("returns null", function() {
        const repo = provider.repositoryForDirectorySync(directory);
        expect(repo).toBe(null);
        return expect(directory.getSubdirectory).toHaveBeenCalledWith(".git");
      });

      return it("returns a Promise that resolves to null for the async implementation", () =>
        waitsForPromise(() =>
          provider.repositoryForDirectory(directory).then(function(repo) {
            expect(repo).toBe(null);
            return expect(directory.getSubdirectory).toHaveBeenCalledWith(".git");
          })
        )
      );
    });
  });
});
