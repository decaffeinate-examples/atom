/** @babel */
/* eslint-disable
    no-return-assign,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path')
const fs = require('fs-plus')
const temp = require('temp').track()
const GrammarRegistry = require('../src/grammar-registry')
const Grim = require('grim')

describe('the `grammars` global', function () {
  beforeEach(function () {
    waitsForPromise(() => atom.packages.activatePackage('language-text'))

    waitsForPromise(() => atom.packages.activatePackage('language-javascript'))

    waitsForPromise(() => atom.packages.activatePackage('language-coffee-script'))

    waitsForPromise(() => atom.packages.activatePackage('language-ruby'))

    return waitsForPromise(() => atom.packages.activatePackage('language-git'))
  })

  afterEach(function () {
    atom.packages.deactivatePackages()
    atom.packages.unloadPackages()
    return temp.cleanupSync()
  })

  describe('.selectGrammar(filePath)', function () {
    it('always returns a grammar', function () {
      const registry = new GrammarRegistry({ config: atom.config })
      return expect(registry.selectGrammar().scopeName).toBe('text.plain.null-grammar')
    })

    it('selects the text.plain grammar over the null grammar', () => expect(atom.grammars.selectGrammar('test.txt').scopeName).toBe('text.plain'))

    it('selects a grammar based on the file path case insensitively', function () {
      expect(atom.grammars.selectGrammar('/tmp/source.coffee').scopeName).toBe('source.coffee')
      return expect(atom.grammars.selectGrammar('/tmp/source.COFFEE').scopeName).toBe('source.coffee')
    })

    describe('on Windows', function () {
      let originalPlatform = null

      beforeEach(function () {
        originalPlatform = process.platform
        return Object.defineProperty(process, 'platform', { value: 'win32' })
      })

      afterEach(() => Object.defineProperty(process, 'platform', { value: originalPlatform }))

      return it('normalizes back slashes to forward slashes when matching the fileTypes', () => expect(atom.grammars.selectGrammar('something\\.git\\config').scopeName).toBe('source.git-config'))
    })

    it("can use the filePath to load the correct grammar based on the grammar's filetype", function () {
      waitsForPromise(() => atom.packages.activatePackage('language-git'))

      return runs(function () {
        expect(atom.grammars.selectGrammar('file.js').name).toBe('JavaScript') // based on extension (.js)
        expect(atom.grammars.selectGrammar(path.join(temp.dir, '.git', 'config')).name).toBe('Git Config') // based on end of the path (.git/config)
        expect(atom.grammars.selectGrammar('Rakefile').name).toBe('Ruby') // based on the file's basename (Rakefile)
        expect(atom.grammars.selectGrammar('curb').name).toBe('Null Grammar')
        return expect(atom.grammars.selectGrammar('/hu.git/config').name).toBe('Null Grammar')
      })
    })

    it("uses the filePath's shebang line if the grammar cannot be determined by the extension or basename", function () {
      const filePath = require.resolve('./fixtures/shebang')
      return expect(atom.grammars.selectGrammar(filePath).name).toBe('Ruby')
    })

    it('uses the number of newlines in the first line regex to determine the number of lines to test against', function () {
      waitsForPromise(() => atom.packages.activatePackage('language-property-list'))

      return runs(function () {
        let fileContent = 'first-line\n<html>'
        expect(atom.grammars.selectGrammar('dummy.coffee', fileContent).name).toBe('CoffeeScript')

        fileContent = '<?xml version="1.0" encoding="UTF-8"?>'
        expect(atom.grammars.selectGrammar('grammar.tmLanguage', fileContent).name).toBe('Null Grammar')

        fileContent += '\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
        return expect(atom.grammars.selectGrammar('grammar.tmLanguage', fileContent).name).toBe('Property List (XML)')
      })
    })

    it("doesn't read the file when the file contents are specified", function () {
      const filePath = require.resolve('./fixtures/shebang')
      const filePathContents = fs.readFileSync(filePath, 'utf8')
      spyOn(fs, 'read').andCallThrough()
      expect(atom.grammars.selectGrammar(filePath, filePathContents).name).toBe('Ruby')
      return expect(fs.read).not.toHaveBeenCalled()
    })

    describe('when multiple grammars have matching fileTypes', () =>
      it('selects the grammar with the longest fileType match', function () {
        const grammarPath1 = temp.path({ suffix: '.json' })
        fs.writeFileSync(grammarPath1, JSON.stringify({
          name: 'test1',
          scopeName: 'source1',
          fileTypes: ['test']
        })
        )
        const grammar1 = atom.grammars.loadGrammarSync(grammarPath1)
        expect(atom.grammars.selectGrammar('more.test', '')).toBe(grammar1)
        fs.removeSync(grammarPath1)

        const grammarPath2 = temp.path({ suffix: '.json' })
        fs.writeFileSync(grammarPath2, JSON.stringify({
          name: 'test2',
          scopeName: 'source2',
          fileTypes: ['test', 'more.test']
        })
        )
        const grammar2 = atom.grammars.loadGrammarSync(grammarPath2)
        expect(atom.grammars.selectGrammar('more.test', '')).toBe(grammar2)
        return fs.removeSync(grammarPath2)
      })
    )

    it('favors non-bundled packages when breaking scoring ties', function () {
      waitsForPromise(() => atom.packages.activatePackage(path.join(__dirname, 'fixtures', 'packages', 'package-with-rb-filetype')))

      return runs(function () {
        atom.grammars.grammarForScopeName('source.ruby').bundledPackage = true
        atom.grammars.grammarForScopeName('test.rb').bundledPackage = false

        return expect(atom.grammars.selectGrammar('test.rb').scopeName).toBe('test.rb')
      })
    })

    describe('when there is no file path', () =>
      it('does not throw an exception (regression)', function () {
        expect(() => atom.grammars.selectGrammar(null, '#!/usr/bin/ruby')).not.toThrow()
        expect(() => atom.grammars.selectGrammar(null, '')).not.toThrow()
        return expect(() => atom.grammars.selectGrammar(null, null)).not.toThrow()
      })
    )

    return describe('when the user has custom grammar file types', function () {
      it('considers the custom file types as well as those defined in the grammar', function () {
        atom.config.set('core.customFileTypes', { 'source.ruby': ['Cheffile'] })
        return expect(atom.grammars.selectGrammar('build/Cheffile', 'cookbook "postgres"').scopeName).toBe('source.ruby')
      })

      it('favors user-defined file types over built-in ones of equal length', function () {
        atom.config.set('core.customFileTypes', {
          'source.coffee': ['Rakefile'],
          'source.ruby': ['Cakefile']
        }
        )
        expect(atom.grammars.selectGrammar('Rakefile', '').scopeName).toBe('source.coffee')
        return expect(atom.grammars.selectGrammar('Cakefile', '').scopeName).toBe('source.ruby')
      })

      return it('favors user-defined file types over grammars with matching first-line-regexps', function () {
        atom.config.set('core.customFileTypes', { 'source.ruby': ['bootstrap'] })
        return expect(atom.grammars.selectGrammar('bootstrap', '#!/usr/bin/env node').scopeName).toBe('source.ruby')
      })
    })
  })

  describe('when there is a grammar with a first line pattern, the file type of the file is known, but from a different grammar', () =>
    it('favors file type over the matching pattern', () => expect(atom.grammars.selectGrammar('foo.rb', '#!/usr/bin/env node').scopeName).toBe('source.ruby'))
  )

  describe('.removeGrammar(grammar)', () =>
    it("removes the grammar, so it won't be returned by selectGrammar", function () {
      const grammar = atom.grammars.selectGrammar('foo.js')
      atom.grammars.removeGrammar(grammar)
      return expect(atom.grammars.selectGrammar('foo.js').name).not.toBe(grammar.name)
    })
  )

  return describe('grammar overrides', () =>
    it('logs deprecations and uses the TextEditorRegistry', function () {
      let editor = null

      waitsForPromise(() => atom.workspace.open('sample.js').then(e => editor = e))

      return runs(function () {
        spyOn(Grim, 'deprecate')

        atom.grammars.setGrammarOverrideForPath(editor.getPath(), 'source.ruby')
        expect(Grim.deprecate.callCount).toBe(1)
        expect(editor.getGrammar().name).toBe('Ruby')

        expect(atom.grammars.grammarOverrideForPath(editor.getPath())).toBe('source.ruby')
        expect(Grim.deprecate.callCount).toBe(2)

        atom.grammars.clearGrammarOverrideForPath(editor.getPath(), 'source.ruby')
        expect(Grim.deprecate.callCount).toBe(3)
        expect(editor.getGrammar().name).toBe('JavaScript')

        expect(atom.grammars.grammarOverrideForPath(editor.getPath())).toBe(undefined)
        return expect(Grim.deprecate.callCount).toBe(4)
      })
    })
  )
})
