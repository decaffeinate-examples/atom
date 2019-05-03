/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let TokenizedBuffer;
const _ = require('underscore-plus');
const {CompositeDisposable, Emitter} = require('event-kit');
const {Point, Range} = require('text-buffer');
const Model = require('./model');
const TokenizedLine = require('./tokenized-line');
const TokenIterator = require('./token-iterator');
const ScopeDescriptor = require('./scope-descriptor');
const TokenizedBufferIterator = require('./tokenized-buffer-iterator');
const NullGrammar = require('./null-grammar');
const {toFirstMateScopeId} = require('./first-mate-helpers');

const prefixedScopes = new Map();

module.exports =
(TokenizedBuffer = (function() {
  TokenizedBuffer = class TokenizedBuffer extends Model {
    static initClass() {
      this.prototype.grammar = null;
      this.prototype.buffer = null;
      this.prototype.tabLength = null;
      this.prototype.tokenizedLines = null;
      this.prototype.chunkSize = 50;
      this.prototype.invalidRows = null;
      this.prototype.visible = false;
      this.prototype.changeCount = 0;
    }

    static deserialize(state, atomEnvironment) {
      if (state.bufferId) {
        state.buffer = atomEnvironment.project.bufferForIdSync(state.bufferId);
      } else {
        // TODO: remove this fallback after everyone transitions to the latest version.
        state.buffer = atomEnvironment.project.bufferForPathSync(state.bufferPath);
      }
      state.assert = atomEnvironment.assert;
      return new (this)(state);
    }

    constructor(params) {
      let grammar;
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { return this; }).toString();
        let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
        eval(`${thisName} = this;`);
      }
      ({grammar, buffer: this.buffer, tabLength: this.tabLength, largeFileMode: this.largeFileMode, assert: this.assert} = params);

      this.emitter = new Emitter;
      this.disposables = new CompositeDisposable;
      this.tokenIterator = new TokenIterator(this);

      this.disposables.add(this.buffer.registerTextDecorationLayer(this));

      this.setGrammar(grammar != null ? grammar : NullGrammar);
    }

    destroyed() {
      this.disposables.dispose();
      return this.tokenizedLines.length = 0;
    }

    buildIterator() {
      return new TokenizedBufferIterator(this);
    }

    classNameForScopeId(id) {
      const scope = this.grammar.scopeForId(toFirstMateScopeId(id));
      if (scope) {
        let prefixedScope = prefixedScopes.get(scope);
        if (prefixedScope) {
          return prefixedScope;
        } else {
          prefixedScope = `syntax--${scope.replace(/\./g, ' syntax--')}`;
          prefixedScopes.set(scope, prefixedScope);
          return prefixedScope;
        }
      } else {
        return null;
      }
    }

    getInvalidatedRanges() {
      return [];
    }

    onDidInvalidateRange(fn) {
      return this.emitter.on('did-invalidate-range', fn);
    }

    serialize() {
      return {
        deserializer: 'TokenizedBuffer',
        bufferPath: this.buffer.getPath(),
        bufferId: this.buffer.getId(),
        tabLength: this.tabLength,
        largeFileMode: this.largeFileMode
      };
    }

    observeGrammar(callback) {
      callback(this.grammar);
      return this.onDidChangeGrammar(callback);
    }

    onDidChangeGrammar(callback) {
      return this.emitter.on('did-change-grammar', callback);
    }

    onDidTokenize(callback) {
      return this.emitter.on('did-tokenize', callback);
    }

    setGrammar(grammar) {
      if ((grammar == null) || (grammar === this.grammar)) { return; }

      this.grammar = grammar;
      this.rootScopeDescriptor = new ScopeDescriptor({scopes: [this.grammar.scopeName]});

      if (this.grammarUpdateDisposable != null) {
        this.grammarUpdateDisposable.dispose();
      }
      this.grammarUpdateDisposable = this.grammar.onDidUpdate(() => this.retokenizeLines());
      this.disposables.add(this.grammarUpdateDisposable);

      this.retokenizeLines();

      return this.emitter.emit('did-change-grammar', grammar);
    }

    getGrammarSelectionContent() {
      return this.buffer.getTextInRange([[0, 0], [10, 0]]);
    }

    hasTokenForSelector(selector) {
      for (let tokenizedLine of Array.from(this.tokenizedLines)) {
        if (tokenizedLine != null) {
          for (let token of Array.from(tokenizedLine.tokens)) {
            if (selector.matches(token.scopes)) { return true; }
          }
        }
      }
      return false;
    }

    retokenizeLines() {
      if (!this.alive) { return; }
      this.fullyTokenized = false;
      this.tokenizedLines = new Array(this.buffer.getLineCount());
      this.invalidRows = [];
      if (this.largeFileMode || (this.grammar.name === 'Null Grammar')) {
        return this.markTokenizationComplete();
      } else {
        return this.invalidateRow(0);
      }
    }

    setVisible(visible) {
      this.visible = visible;
      if (this.visible && (this.grammar.name !== 'Null Grammar') && !this.largeFileMode) {
        return this.tokenizeInBackground();
      }
    }

    getTabLength() { return this.tabLength; }

    setTabLength(tabLength) {
      this.tabLength = tabLength;
    }

    tokenizeInBackground() {
      if (!this.visible || this.pendingChunk || !this.isAlive()) { return; }

      this.pendingChunk = true;
      return _.defer(() => {
        this.pendingChunk = false;
        if (this.isAlive() && this.buffer.isAlive()) { return this.tokenizeNextChunk(); }
      });
    }

    tokenizeNextChunk() {
      let rowsRemaining = this.chunkSize;

      while ((this.firstInvalidRow() != null) && (rowsRemaining > 0)) {
        var endRow, filledRegion;
        const startRow = this.invalidRows.shift();
        const lastRow = this.getLastRow();
        if (startRow > lastRow) { continue; }

        let row = startRow;
        while (true) {
          const previousStack = this.stackForRow(row);
          this.tokenizedLines[row] = this.buildTokenizedLineForRow(row, this.stackForRow(row - 1), this.openScopesForRow(row));
          if (--rowsRemaining === 0) {
            filledRegion = false;
            endRow = row;
            break;
          }
          if ((row === lastRow) || _.isEqual(this.stackForRow(row), previousStack)) {
            filledRegion = true;
            endRow = row;
            break;
          }
          row++;
        }

        this.validateRow(endRow);
        if (!filledRegion) { this.invalidateRow(endRow + 1); }

        this.emitter.emit('did-invalidate-range', Range(Point(startRow, 0), Point(endRow + 1, 0)));
      }

      if (this.firstInvalidRow() != null) {
        return this.tokenizeInBackground();
      } else {
        return this.markTokenizationComplete();
      }
    }

    markTokenizationComplete() {
      if (!this.fullyTokenized) {
        this.emitter.emit('did-tokenize');
      }
      return this.fullyTokenized = true;
    }

    firstInvalidRow() {
      return this.invalidRows[0];
    }

    validateRow(row) {
      while (this.invalidRows[0] <= row) { this.invalidRows.shift(); }
    }

    invalidateRow(row) {
      this.invalidRows.push(row);
      this.invalidRows.sort((a, b) => a - b);
      return this.tokenizeInBackground();
    }

    updateInvalidRows(start, end, delta) {
      return this.invalidRows = this.invalidRows.map(function(row) {
        if (row < start) {
          return row;
        } else if (start <= row && row <= end) {
          return end + delta + 1;
        } else if (row > end) {
          return row + delta;
        }
      });
    }

    bufferDidChange(e) {
      this.changeCount = this.buffer.changeCount;

      const {oldRange, newRange} = e;
      const start = oldRange.start.row;
      const end = oldRange.end.row;
      const delta = newRange.end.row - oldRange.end.row;
      const oldLineCount = (oldRange.end.row - oldRange.start.row) + 1;
      const newLineCount = (newRange.end.row - newRange.start.row) + 1;

      this.updateInvalidRows(start, end, delta);
      const previousEndStack = this.stackForRow(end); // used in spill detection below
      if (this.largeFileMode || (this.grammar.name === 'Null Grammar')) {
        return _.spliceWithArray(this.tokenizedLines, start, oldLineCount, new Array(newLineCount));
      } else {
        const newTokenizedLines = this.buildTokenizedLinesForRows(start, end + delta, this.stackForRow(start - 1), this.openScopesForRow(start));
        _.spliceWithArray(this.tokenizedLines, start, oldLineCount, newTokenizedLines);
        const newEndStack = this.stackForRow(end + delta);
        if (newEndStack && !_.isEqual(newEndStack, previousEndStack)) {
          return this.invalidateRow(end + delta + 1);
        }
      }
    }

    isFoldableAtRow(row) {
      return this.isFoldableCodeAtRow(row) || this.isFoldableCommentAtRow(row);
    }

    // Returns a {Boolean} indicating whether the given buffer row starts
    // a a foldable row range due to the code's indentation patterns.
    isFoldableCodeAtRow(row) {
      if (0 <= row && row <= this.buffer.getLastRow()) {
        const nextRow = this.buffer.nextNonBlankRow(row);
        const tokenizedLine = this.tokenizedLines[row];
        if (this.buffer.isRowBlank(row) || (tokenizedLine != null ? tokenizedLine.isComment() : undefined) || (nextRow == null)) {
          return false;
        } else {
          return this.indentLevelForRow(nextRow) > this.indentLevelForRow(row);
        }
      } else {
        return false;
      }
    }

    isFoldableCommentAtRow(row) {
      const previousRow = row - 1;
      const nextRow = row + 1;
      if (nextRow > this.buffer.getLastRow()) {
        return false;
      } else {
        return Boolean(
          !(this.tokenizedLines[previousRow] != null ? this.tokenizedLines[previousRow].isComment() : undefined) &&
          (this.tokenizedLines[row] != null ? this.tokenizedLines[row].isComment() : undefined) &&
          (this.tokenizedLines[nextRow] != null ? this.tokenizedLines[nextRow].isComment() : undefined)
        );
      }
    }

    buildTokenizedLinesForRows(startRow, endRow, startingStack, startingopenScopes) {
      let ruleStack, openScopes;
      ruleStack = startingStack;
      openScopes = startingopenScopes;
      const stopTokenizingAt = startRow + this.chunkSize;
      const tokenizedLines = (() => {
        const result = [];
        for (let row = startRow, end = endRow; row <= end; row++) {
          var tokenizedLine;
          if ((ruleStack || (row === 0)) && (row < stopTokenizingAt)) {
            tokenizedLine = this.buildTokenizedLineForRow(row, ruleStack, openScopes);
            ({ ruleStack } = tokenizedLine);
            openScopes = this.scopesFromTags(openScopes, tokenizedLine.tags);
          } else {
            tokenizedLine = undefined;
          }
          result.push(tokenizedLine);
        }
        return result;
      })();

      if (endRow >= stopTokenizingAt) {
        this.invalidateRow(stopTokenizingAt);
        this.tokenizeInBackground();
      }

      return tokenizedLines;
    }

    buildTokenizedLineForRow(row, ruleStack, openScopes) {
      return this.buildTokenizedLineForRowWithText(row, this.buffer.lineForRow(row), ruleStack, openScopes);
    }

    buildTokenizedLineForRowWithText(row, text, ruleStack, openScopes) {
      let tags;
      if (ruleStack == null) { ruleStack = this.stackForRow(row - 1); }
      if (openScopes == null) { openScopes = this.openScopesForRow(row); }
      const lineEnding = this.buffer.lineEndingForRow(row);
      ({tags, ruleStack} = this.grammar.tokenizeLine(text, ruleStack, row === 0, false));
      return new TokenizedLine({openScopes, text, tags, ruleStack, lineEnding, tokenIterator: this.tokenIterator, grammar: this.grammar});
    }

    tokenizedLineForRow(bufferRow) {
      if (0 <= bufferRow && bufferRow <= this.buffer.getLastRow()) {
        let tokenizedLine;
        if (tokenizedLine = this.tokenizedLines[bufferRow]) {
          return tokenizedLine;
        } else {
          const text = this.buffer.lineForRow(bufferRow);
          const lineEnding = this.buffer.lineEndingForRow(bufferRow);
          const tags = [this.grammar.startIdForScope(this.grammar.scopeName), text.length, this.grammar.endIdForScope(this.grammar.scopeName)];
          return this.tokenizedLines[bufferRow] = new TokenizedLine({openScopes: [], text, tags, lineEnding, tokenIterator: this.tokenIterator, grammar: this.grammar});
        }
      }
    }

    tokenizedLinesForRows(startRow, endRow) {
      return (() => {
        const result = [];
        for (let row = startRow, end = endRow; row <= end; row++) {
          result.push(this.tokenizedLineForRow(row));
        }
        return result;
      })();
    }

    stackForRow(bufferRow) {
      return (this.tokenizedLines[bufferRow] != null ? this.tokenizedLines[bufferRow].ruleStack : undefined);
    }

    openScopesForRow(bufferRow) {
      let precedingLine;
      if ((precedingLine = this.tokenizedLines[bufferRow - 1])) {
        return this.scopesFromTags(precedingLine.openScopes, precedingLine.tags);
      } else {
        return [];
      }
    }

    scopesFromTags(startingScopes, tags) {
      const scopes = startingScopes.slice();
      for (var tag of Array.from(tags)) {
        if (tag < 0) {
          if ((tag % 2) === -1) {
            scopes.push(tag);
          } else {
            const matchingStartTag = tag + 1;
            while (true) {
              if (scopes.pop() === matchingStartTag) { break; }
              if (scopes.length === 0) {
                this.assert(false, "Encountered an unmatched scope end tag.", error => {
                  error.metadata = {
                    grammarScopeName: this.grammar.scopeName,
                    unmatchedEndTag: this.grammar.scopeForId(tag)
                  };
                  const path = require('path');
                  error.privateMetadataDescription = `The contents of \`${path.basename(this.buffer.getPath())}\``;
                  return error.privateMetadata = {
                    filePath: this.buffer.getPath(),
                    fileContents: this.buffer.getText()
                  };
              });
                break;
              }
            }
          }
        }
      }
      return scopes;
    }

    indentLevelForRow(bufferRow) {
      const line = this.buffer.lineForRow(bufferRow);
      let indentLevel = 0;

      if (line === '') {
        let nextRow = bufferRow + 1;
        const lineCount = this.getLineCount();
        while (nextRow < lineCount) {
          const nextLine = this.buffer.lineForRow(nextRow);
          if (nextLine !== '') {
            indentLevel = Math.ceil(this.indentLevelForLine(nextLine));
            break;
          }
          nextRow++;
        }

        let previousRow = bufferRow - 1;
        while (previousRow >= 0) {
          const previousLine = this.buffer.lineForRow(previousRow);
          if (previousLine !== '') {
            indentLevel = Math.max(Math.ceil(this.indentLevelForLine(previousLine)), indentLevel);
            break;
          }
          previousRow--;
        }

        return indentLevel;
      } else {
        return this.indentLevelForLine(line);
      }
    }

    indentLevelForLine(line) {
      let indentLength = 0;
      for (let char of Array.from(line)) {
        if (char === '\t') {
          indentLength += this.getTabLength() - (indentLength % this.getTabLength());
        } else if (char === ' ') {
          indentLength++;
        } else {
          break;
        }
      }

      return indentLength / this.getTabLength();
    }

    scopeDescriptorForPosition(position) {
      let scopes;
      const {row, column} = this.buffer.clipPosition(Point.fromObject(position));

      const iterator = this.tokenizedLineForRow(row).getTokenIterator();
      while (iterator.next()) {
        if (iterator.getBufferEnd() > column) {
          scopes = iterator.getScopes();
          break;
        }
      }

      // rebuild scope of last token if we iterated off the end
      if (scopes == null) {
        scopes = iterator.getScopes();
        scopes.push(...Array.from(iterator.getScopeEnds().reverse() || []));
      }

      return new ScopeDescriptor({scopes});
    }

    tokenForPosition(position) {
      const {row, column} = Point.fromObject(position);
      return this.tokenizedLineForRow(row).tokenAtBufferColumn(column);
    }

    tokenStartPositionForPosition(position) {
      let {row, column} = Point.fromObject(position);
      column = this.tokenizedLineForRow(row).tokenStartColumnForBufferColumn(column);
      return new Point(row, column);
    }

    bufferRangeForScopeAtPosition(selector, position) {
      let endColumn, tag, tokenIndex;
      position = Point.fromObject(position);

      const {openScopes, tags} = this.tokenizedLineForRow(position.row);
      const scopes = openScopes.map(tag => this.grammar.scopeForId(tag));

      let startColumn = 0;
      for (tokenIndex = 0; tokenIndex < tags.length; tokenIndex++) {
        tag = tags[tokenIndex];
        if (tag < 0) {
          if ((tag % 2) === -1) {
            scopes.push(this.grammar.scopeForId(tag));
          } else {
            scopes.pop();
          }
        } else {
          endColumn = startColumn + tag;
          if (endColumn >= position.column) {
            break;
          } else {
            startColumn = endColumn;
          }
        }
      }


      if (!selectorMatchesAnyScope(selector, scopes)) { return; }

      const startScopes = scopes.slice();
      for (let startTokenIndex = tokenIndex - 1; startTokenIndex >= 0; startTokenIndex--) {
        tag = tags[startTokenIndex];
        if (tag < 0) {
          if ((tag % 2) === -1) {
            startScopes.pop();
          } else {
            startScopes.push(this.grammar.scopeForId(tag));
          }
        } else {
          if (!selectorMatchesAnyScope(selector, startScopes)) { break; }
          startColumn -= tag;
        }
      }

      const endScopes = scopes.slice();
      for (let endTokenIndex = tokenIndex + 1, end = tags.length; endTokenIndex < end; endTokenIndex++) {
        tag = tags[endTokenIndex];
        if (tag < 0) {
          if ((tag % 2) === -1) {
            endScopes.push(this.grammar.scopeForId(tag));
          } else {
            endScopes.pop();
          }
        } else {
          if (!selectorMatchesAnyScope(selector, endScopes)) { break; }
          endColumn += tag;
        }
      }

      return new Range(new Point(position.row, startColumn), new Point(position.row, endColumn));
    }

    // Gets the row number of the last line.
    //
    // Returns a {Number}.
    getLastRow() {
      return this.buffer.getLastRow();
    }

    getLineCount() {
      return this.buffer.getLineCount();
    }

    logLines(start, end) {
      if (start == null) { start = 0; }
      if (end == null) { end = this.buffer.getLastRow(); }
      for (let row = start, end1 = end, asc = start <= end1; asc ? row <= end1 : row >= end1; asc ? row++ : row--) {
        const line = this.tokenizedLines[row].text;
        console.log(row, line, line.length);
      }
    }
  };
  TokenizedBuffer.initClass();
  return TokenizedBuffer;
})());

var selectorMatchesAnyScope = function(selector, scopes) {
  const targetClasses = selector.replace(/^\./, '').split('.');
  return _.any(scopes, function(scope) {
    const scopeClasses = scope.split('.');
    return _.isSubset(targetClasses, scopeClasses);
  });
};
