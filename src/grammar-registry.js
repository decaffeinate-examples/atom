/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let GrammarRegistry;
const _ = require('underscore-plus');
const FirstMate = require('first-mate');
const Token = require('./token');
const fs = require('fs-plus');
const Grim = require('grim');

const PathSplitRegex = new RegExp("[/.]");

// Extended: Syntax class holding the grammars used for tokenizing.
//
// An instance of this class is always available as the `atom.grammars` global.
//
// The Syntax class also contains properties for things such as the
// language-specific comment regexes. See {::getProperty} for more details.
module.exports =
(GrammarRegistry = class GrammarRegistry extends FirstMate.GrammarRegistry {
  constructor(param) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { return this; }).toString();
      let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
      eval(`${thisName} = this;`);
    }
    if (param == null) { param = {}; }
    const {config} = param;
    this.config = config;
    super({maxTokensPerLine: 100, maxLineLength: 1000});
  }

  createToken(value, scopes) { return new Token({value, scopes}); }

  // Extended: Select a grammar for the given file path and file contents.
  //
  // This picks the best match by checking the file path and contents against
  // each grammar.
  //
  // * `filePath` A {String} file path.
  // * `fileContents` A {String} of text for the file path.
  //
  // Returns a {Grammar}, never null.
  selectGrammar(filePath, fileContents) {
    return this.selectGrammarWithScore(filePath, fileContents).grammar;
  }

  selectGrammarWithScore(filePath, fileContents) {
    let grammar, score;
    let bestMatch = null;
    let highestScore = -Infinity;
    for (grammar of Array.from(this.grammars)) {
      score = this.getGrammarScore(grammar, filePath, fileContents);
      if ((score > highestScore) || (bestMatch == null)) {
        bestMatch = grammar;
        highestScore = score;
      }
    }
    return {grammar: bestMatch, score: highestScore};
  }

  // Extended: Returns a {Number} representing how well the grammar matches the
  // `filePath` and `contents`.
  getGrammarScore(grammar, filePath, contents) {
    if ((contents == null) && fs.isFileSync(filePath)) { contents = fs.readFileSync(filePath, 'utf8'); }

    let score = this.getGrammarPathScore(grammar, filePath);
    if ((score > 0) && !grammar.bundledPackage) {
      score += 0.25;
    }
    if (this.grammarMatchesContents(grammar, contents)) {
      score += 0.125;
    }
    return score;
  }

  getGrammarPathScore(grammar, filePath) {
    let customFileTypes;
    if (!filePath) { return -1; }
    if (process.platform === 'win32') { filePath = filePath.replace(/\\/g, '/'); }

    const pathComponents = filePath.toLowerCase().split(PathSplitRegex);
    let pathScore = -1;

    let { fileTypes } = grammar;
    if (customFileTypes = __guard__(this.config.get('core.customFileTypes'), x => x[grammar.scopeName])) {
      fileTypes = fileTypes.concat(customFileTypes);
    }

    for (let i = 0; i < fileTypes.length; i++) {
      const fileType = fileTypes[i];
      const fileTypeComponents = fileType.toLowerCase().split(PathSplitRegex);
      const pathSuffix = pathComponents.slice(-fileTypeComponents.length);
      if (_.isEqual(pathSuffix, fileTypeComponents)) {
        pathScore = Math.max(pathScore, fileType.length);
        if (i >= grammar.fileTypes.length) {
          pathScore += 0.5;
        }
      }
    }

    return pathScore;
  }

  grammarMatchesContents(grammar, contents) {
    if ((contents == null) || (grammar.firstLineRegex == null)) { return false; }

    let escaped = false;
    let numberOfNewlinesInRegex = 0;
    for (let character of Array.from(grammar.firstLineRegex.source)) {
      switch (character) {
        case '\\':
          escaped = !escaped;
          break;
        case 'n':
          if (escaped) { numberOfNewlinesInRegex++; }
          escaped = false;
          break;
        default:
          escaped = false;
      }
    }
    const lines = contents.split('\n');
    return grammar.firstLineRegex.testSync(lines.slice(0, +numberOfNewlinesInRegex + 1 || undefined).join('\n'));
  }

  // Deprecated: Get the grammar override for the given file path.
  //
  // * `filePath` A {String} file path.
  //
  // Returns a {String} such as `"source.js"`.
  grammarOverrideForPath(filePath) {
    let editor;
    Grim.deprecate('Use atom.textEditors.getGrammarOverride(editor) instead');
    if (editor = getEditorForPath(filePath)) {
      return atom.textEditors.getGrammarOverride(editor);
    }
  }

  // Deprecated: Set the grammar override for the given file path.
  //
  // * `filePath` A non-empty {String} file path.
  // * `scopeName` A {String} such as `"source.js"`.
  //
  // Returns undefined
  setGrammarOverrideForPath(filePath, scopeName) {
    let editor;
    Grim.deprecate('Use atom.textEditors.setGrammarOverride(editor, scopeName) instead');
    if (editor = getEditorForPath(filePath)) {
      atom.textEditors.setGrammarOverride(editor, scopeName);
    }
  }

  // Deprecated: Remove the grammar override for the given file path.
  //
  // * `filePath` A {String} file path.
  //
  // Returns undefined.
  clearGrammarOverrideForPath(filePath) {
    let editor;
    Grim.deprecate('Use atom.textEditors.clearGrammarOverride(editor) instead');
    if (editor = getEditorForPath(filePath)) {
      atom.textEditors.clearGrammarOverride(editor);
    }
  }
});

var getEditorForPath = function(filePath) {
  if (filePath != null) {
    return atom.workspace.getTextEditors().find(editor => editor.getPath() === filePath);
  }
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}