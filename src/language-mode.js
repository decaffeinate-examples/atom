/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let LanguageMode;
const {Range} = require('text-buffer');
const _ = require('underscore-plus');
const {OnigRegExp} = require('oniguruma');
const ScopeDescriptor = require('./scope-descriptor');
const NullGrammar = require('./null-grammar');

module.exports =
(LanguageMode = class LanguageMode {
  // Sets up a `LanguageMode` for the given {TextEditor}.
  //
  // editor - The {TextEditor} to associate with
  constructor(editor) {
    this.editor = editor;
    ({buffer: this.buffer} = this.editor);
    this.regexesByPattern = {};
  }

  destroy() {}

  toggleLineCommentForBufferRow(row) {
    return this.toggleLineCommentsForBufferRows(row, row);
  }

  // Wraps the lines between two rows in comments.
  //
  // If the language doesn't have comment, nothing happens.
  //
  // startRow - The row {Number} to start at
  // endRow - The row {Number} to end at
  toggleLineCommentsForBufferRows(start, end) {
    let shouldUncomment;
    const scope = this.editor.scopeDescriptorForBufferPosition([start, 0]);
    const commentStrings = this.editor.getCommentStrings(scope);
    if (!(commentStrings != null ? commentStrings.commentStartString : undefined)) { return; }
    const {commentStartString, commentEndString} = commentStrings;

    const { buffer } = this.editor;
    const commentStartRegexString = _.escapeRegExp(commentStartString).replace(/(\s+)$/, '(?:$1)?');
    const commentStartRegex = new OnigRegExp(`^(\\s*)(${commentStartRegexString})`);

    if (commentEndString) {
      shouldUncomment = commentStartRegex.testSync(buffer.lineForRow(start));
      if (shouldUncomment) {
        const commentEndRegexString = _.escapeRegExp(commentEndString).replace(/^(\s+)/, '(?:$1)?');
        const commentEndRegex = new OnigRegExp(`(${commentEndRegexString})(\\s*)$`);
        const startMatch =  commentStartRegex.searchSync(buffer.lineForRow(start));
        const endMatch = commentEndRegex.searchSync(buffer.lineForRow(end));
        if (startMatch && endMatch) {
          buffer.transact(function() {
            const columnStart = startMatch[1].length;
            const columnEnd = columnStart + startMatch[2].length;
            buffer.setTextInRange([[start, columnStart], [start, columnEnd]], "");

            const endLength = buffer.lineLengthForRow(end) - endMatch[2].length;
            const endColumn = endLength - endMatch[1].length;
            return buffer.setTextInRange([[end, endColumn], [end, endLength]], "");
          });
        }
      } else {
        buffer.transact(function() {
          let left;
          const indentLength = (left = __guard__(buffer.lineForRow(start).match(/^\s*/), x => x[0].length)) != null ? left : 0;
          buffer.insert([start, indentLength], commentStartString);
          return buffer.insert([end, buffer.lineLengthForRow(end)], commentEndString);
        });
      }
    } else {
      let line, match, row;
      let end1;
      let allBlank = true;
      let allBlankOrCommented = true;

      for (row = start, end1 = end; row <= end1; row++) {
        line = buffer.lineForRow(row);
        const blank = line != null ? line.match(/^\s*$/) : undefined;

        if (!blank) { allBlank = false; }
        if (!blank && !commentStartRegex.testSync(line)) { allBlankOrCommented = false; }
      }

      shouldUncomment = allBlankOrCommented && !allBlank;

      if (shouldUncomment) {
        let end2;
        for (row = start, end2 = end; row <= end2; row++) {
          if (match = commentStartRegex.searchSync(buffer.lineForRow(row))) {
            const columnStart = match[1].length;
            const columnEnd = columnStart + match[2].length;
            buffer.setTextInRange([[row, columnStart], [row, columnEnd]], "");
          }
        }
      } else {
        let indent;
        let end3;
        if (start === end) {
          indent = this.editor.indentationForBufferRow(start);
        } else {
          indent = this.minIndentLevelForRowRange(start, end);
        }
        const indentString = this.editor.buildIndentString(indent);
        const tabLength = this.editor.getTabLength();
        const indentRegex = new RegExp(`(\t|[ ]{${tabLength}}){${Math.floor(indent)}}`);
        for (row = start, end3 = end; row <= end3; row++) {
          var indentLength;
          line = buffer.lineForRow(row);
          if ((indentLength = __guard__(line.match(indentRegex), x => x[0].length))) {
            buffer.insert([row, indentLength], commentStartString);
          } else {
            buffer.setTextInRange([[row, 0], [row, indentString.length]], indentString + commentStartString);
          }
        }
      }
    }
  }

  // Folds all the foldable lines in the buffer.
  foldAll() {
    this.unfoldAll();
    const foldedRowRanges = {};
    for (let currentRow = 0, end = this.buffer.getLastRow(); currentRow <= end; currentRow++) {
      var endRow, left, ref, startRow;
      const rowRange = ([startRow, endRow] = Array.from(ref = (left = this.rowRangeForFoldAtBufferRow(currentRow)) != null ? left : []), ref);
      if (startRow == null) { continue; }
      if (foldedRowRanges[rowRange]) { continue; }

      this.editor.foldBufferRowRange(startRow, endRow);
      foldedRowRanges[rowRange] = true;
    }
  }

  // Unfolds all the foldable lines in the buffer.
  unfoldAll() {
    return this.editor.displayLayer.destroyAllFolds();
  }

  // Fold all comment and code blocks at a given indentLevel
  //
  // indentLevel - A {Number} indicating indentLevel; 0 based.
  foldAllAtIndentLevel(indentLevel) {
    this.unfoldAll();
    const foldedRowRanges = {};
    for (let currentRow = 0, end = this.buffer.getLastRow(); currentRow <= end; currentRow++) {
      var endRow, left, ref, startRow;
      const rowRange = ([startRow, endRow] = Array.from(ref = (left = this.rowRangeForFoldAtBufferRow(currentRow)) != null ? left : []), ref);
      if (startRow == null) { continue; }
      if (foldedRowRanges[rowRange]) { continue; }

      // assumption: startRow will always be the min indent level for the entire range
      if (this.editor.indentationForBufferRow(startRow) === indentLevel) {
        this.editor.foldBufferRowRange(startRow, endRow);
        foldedRowRanges[rowRange] = true;
      }
    }
  }

  // Given a buffer row, creates a fold at it.
  //
  // bufferRow - A {Number} indicating the buffer row
  //
  // Returns the new {Fold}.
  foldBufferRow(bufferRow) {
    for (let currentRow = bufferRow; currentRow >= 0; currentRow--) {
      var left;
      const [startRow, endRow] = Array.from((left = this.rowRangeForFoldAtBufferRow(currentRow)) != null ? left : []);
      if ((startRow == null) || !(startRow <= bufferRow && bufferRow <= endRow)) { continue; }
      if (!this.editor.isFoldedAtBufferRow(startRow)) {
        return this.editor.foldBufferRowRange(startRow, endRow);
      }
    }
  }

  // Find the row range for a fold at a given bufferRow. Will handle comments
  // and code.
  //
  // bufferRow - A {Number} indicating the buffer row
  //
  // Returns an {Array} of the [startRow, endRow]. Returns null if no range.
  rowRangeForFoldAtBufferRow(bufferRow) {
    let rowRange = this.rowRangeForCommentAtBufferRow(bufferRow);
    if (rowRange == null) { rowRange = this.rowRangeForCodeFoldAtBufferRow(bufferRow); }
    return rowRange;
  }

  rowRangeForCommentAtBufferRow(bufferRow) {
    let currentRow;
    if (!(this.editor.tokenizedBuffer.tokenizedLines[bufferRow] != null ? this.editor.tokenizedBuffer.tokenizedLines[bufferRow].isComment() : undefined)) { return; }

    let startRow = bufferRow;
    let endRow = bufferRow;

    if (bufferRow > 0) {
      for (currentRow = bufferRow-1; currentRow >= 0; currentRow--) {
        if (!(this.editor.tokenizedBuffer.tokenizedLines[currentRow] != null ? this.editor.tokenizedBuffer.tokenizedLines[currentRow].isComment() : undefined)) { break; }
        startRow = currentRow;
      }
    }

    if (bufferRow < this.buffer.getLastRow()) {
      let end;
      for (currentRow = bufferRow+1, end = this.buffer.getLastRow(); currentRow <= end; currentRow++) {
        if (!(this.editor.tokenizedBuffer.tokenizedLines[currentRow] != null ? this.editor.tokenizedBuffer.tokenizedLines[currentRow].isComment() : undefined)) { break; }
        endRow = currentRow;
      }
    }

    if (startRow !== endRow) { return [startRow, endRow]; }
  }

  rowRangeForCodeFoldAtBufferRow(bufferRow) {
    let foldEndRow;
    if (!this.isFoldableAtBufferRow(bufferRow)) { return null; }

    const startIndentLevel = this.editor.indentationForBufferRow(bufferRow);
    const scopeDescriptor = this.editor.scopeDescriptorForBufferPosition([bufferRow, 0]);
    for (var row = bufferRow + 1, end = this.editor.getLastBufferRow(); row <= end; row++) {
      if (this.editor.isBufferRowBlank(row)) { continue; }
      const indentation = this.editor.indentationForBufferRow(row);
      if (indentation <= startIndentLevel) {
        const includeRowInFold = (indentation === startIndentLevel) && __guard__(this.foldEndRegexForScopeDescriptor(scopeDescriptor), x => x.searchSync(this.editor.lineTextForBufferRow(row)));
        if (includeRowInFold) { foldEndRow = row; }
        break;
      }

      foldEndRow = row;
    }

    return [bufferRow, foldEndRow];
  }

  isFoldableAtBufferRow(bufferRow) {
    return this.editor.tokenizedBuffer.isFoldableAtRow(bufferRow);
  }

  // Returns a {Boolean} indicating whether the line at the given buffer
  // row is a comment.
  isLineCommentedAtBufferRow(bufferRow) {
    let left;
    if (!(0 <= bufferRow && bufferRow <= this.editor.getLastBufferRow())) { return false; }
    return (left = (this.editor.tokenizedBuffer.tokenizedLines[bufferRow] != null ? this.editor.tokenizedBuffer.tokenizedLines[bufferRow].isComment() : undefined)) != null ? left : false;
  }

  // Find a row range for a 'paragraph' around specified bufferRow. A paragraph
  // is a block of text bounded by and empty line or a block of text that is not
  // the same type (comments next to source code).
  rowRangeForParagraphAtBufferRow(bufferRow) {
    let firstRow, isOriginalRowComment, lastRow;
    const scope = this.editor.scopeDescriptorForBufferPosition([bufferRow, 0]);
    const commentStrings = this.editor.getCommentStrings(scope);
    let commentStartRegex = null;
    if (((commentStrings != null ? commentStrings.commentStartString : undefined) != null) && (commentStrings.commentEndString == null)) {
      const commentStartRegexString = _.escapeRegExp(commentStrings.commentStartString).replace(/(\s+)$/, '(?:$1)?');
      commentStartRegex = new OnigRegExp(`^(\\s*)(${commentStartRegexString})`);
    }

    const filterCommentStart = function(line) {
      if (commentStartRegex != null) {
        const matches = commentStartRegex.searchSync(line);
        if (matches != null ? matches.length : undefined) { line = line.substring(matches[0].end); }
      }
      return line;
    };

    if (!/\S/.test(filterCommentStart(this.editor.lineTextForBufferRow(bufferRow)))) { return; }

    if (this.isLineCommentedAtBufferRow(bufferRow)) {
      isOriginalRowComment = true;
      const range = this.rowRangeForCommentAtBufferRow(bufferRow);
      [firstRow, lastRow] = Array.from(range || [bufferRow, bufferRow]);
    } else {
      isOriginalRowComment = false;
      [firstRow, lastRow] = Array.from([0, this.editor.getLastBufferRow()-1]);
    }

    let startRow = bufferRow;
    while (startRow > firstRow) {
      if (this.isLineCommentedAtBufferRow(startRow - 1) !== isOriginalRowComment) { break; }
      if (!/\S/.test(filterCommentStart(this.editor.lineTextForBufferRow(startRow - 1)))) { break; }
      startRow--;
    }

    let endRow = bufferRow;
    lastRow = this.editor.getLastBufferRow();
    while (endRow < lastRow) {
      if (this.isLineCommentedAtBufferRow(endRow + 1) !== isOriginalRowComment) { break; }
      if (!/\S/.test(filterCommentStart(this.editor.lineTextForBufferRow(endRow + 1)))) { break; }
      endRow++;
    }

    return new Range([startRow, 0], [endRow, this.editor.lineTextForBufferRow(endRow).length]);
  }

  // Given a buffer row, this returns a suggested indentation level.
  //
  // The indentation level provided is based on the current {LanguageMode}.
  //
  // bufferRow - A {Number} indicating the buffer row
  //
  // Returns a {Number}.
  suggestedIndentForBufferRow(bufferRow, options) {
    const line = this.buffer.lineForRow(bufferRow);
    const tokenizedLine = this.editor.tokenizedBuffer.tokenizedLineForRow(bufferRow);
    return this.suggestedIndentForTokenizedLineAtBufferRow(bufferRow, line, tokenizedLine, options);
  }

  suggestedIndentForLineAtBufferRow(bufferRow, line, options) {
    const tokenizedLine = this.editor.tokenizedBuffer.buildTokenizedLineForRowWithText(bufferRow, line);
    return this.suggestedIndentForTokenizedLineAtBufferRow(bufferRow, line, tokenizedLine, options);
  }

  suggestedIndentForTokenizedLineAtBufferRow(bufferRow, line, tokenizedLine, options) {
    let precedingRow;
    const iterator = tokenizedLine.getTokenIterator();
    iterator.next();
    const scopeDescriptor = new ScopeDescriptor({scopes: iterator.getScopes()});

    const increaseIndentRegex = this.increaseIndentRegexForScopeDescriptor(scopeDescriptor);
    const decreaseIndentRegex = this.decreaseIndentRegexForScopeDescriptor(scopeDescriptor);
    const decreaseNextIndentRegex = this.decreaseNextIndentRegexForScopeDescriptor(scopeDescriptor);

    if ((options != null ? options.skipBlankLines : undefined) != null ? (options != null ? options.skipBlankLines : undefined) : true) {
      precedingRow = this.buffer.previousNonBlankRow(bufferRow);
      if (precedingRow == null) { return 0; }
    } else {
      precedingRow = bufferRow - 1;
      if (precedingRow < 0) { return 0; }
    }

    let desiredIndentLevel = this.editor.indentationForBufferRow(precedingRow);
    if (!increaseIndentRegex) { return desiredIndentLevel; }

    if (!this.editor.isBufferRowCommented(precedingRow)) {
      const precedingLine = this.buffer.lineForRow(precedingRow);
      if (increaseIndentRegex != null ? increaseIndentRegex.testSync(precedingLine) : undefined) { desiredIndentLevel += 1; }
      if (decreaseNextIndentRegex != null ? decreaseNextIndentRegex.testSync(precedingLine) : undefined) { desiredIndentLevel -= 1; }
    }

    if (!this.buffer.isRowBlank(precedingRow)) {
      if (decreaseIndentRegex != null ? decreaseIndentRegex.testSync(line) : undefined) { desiredIndentLevel -= 1; }
    }

    return Math.max(desiredIndentLevel, 0);
  }

  // Calculate a minimum indent level for a range of lines excluding empty lines.
  //
  // startRow - The row {Number} to start at
  // endRow - The row {Number} to end at
  //
  // Returns a {Number} of the indent level of the block of lines.
  minIndentLevelForRowRange(startRow, endRow) {
    let indents = ((() => {
      const result = [];
      for (let row = startRow, end = endRow; row <= end; row++) {
        if (!this.editor.isBufferRowBlank(row)) {
          result.push(this.editor.indentationForBufferRow(row));
        }
      }
      return result;
    })());
    if (!indents.length) { indents = [0]; }
    return Math.min(...Array.from(indents || []));
  }

  // Indents all the rows between two buffer row numbers.
  //
  // startRow - The row {Number} to start at
  // endRow - The row {Number} to end at
  autoIndentBufferRows(startRow, endRow) {
    for (let row = startRow, end = endRow; row <= end; row++) { this.autoIndentBufferRow(row); }
  }

  // Given a buffer row, this indents it.
  //
  // bufferRow - The row {Number}.
  // options - An options {Object} to pass through to {TextEditor::setIndentationForBufferRow}.
  autoIndentBufferRow(bufferRow, options) {
    const indentLevel = this.suggestedIndentForBufferRow(bufferRow, options);
    return this.editor.setIndentationForBufferRow(bufferRow, indentLevel, options);
  }

  // Given a buffer row, this decreases the indentation.
  //
  // bufferRow - The row {Number}
  autoDecreaseIndentForBufferRow(bufferRow) {
    let decreaseIndentRegex, decreaseNextIndentRegex, increaseIndentRegex;
    const scopeDescriptor = this.editor.scopeDescriptorForBufferPosition([bufferRow, 0]);
    if (!(decreaseIndentRegex = this.decreaseIndentRegexForScopeDescriptor(scopeDescriptor))) { return; }

    const line = this.buffer.lineForRow(bufferRow);
    if (!decreaseIndentRegex.testSync(line)) { return; }

    const currentIndentLevel = this.editor.indentationForBufferRow(bufferRow);
    if (currentIndentLevel === 0) { return; }

    const precedingRow = this.buffer.previousNonBlankRow(bufferRow);
    if (precedingRow == null) { return; }

    const precedingLine = this.buffer.lineForRow(precedingRow);
    let desiredIndentLevel = this.editor.indentationForBufferRow(precedingRow);

    if (increaseIndentRegex = this.increaseIndentRegexForScopeDescriptor(scopeDescriptor)) {
      if (!increaseIndentRegex.testSync(precedingLine)) { desiredIndentLevel -= 1; }
    }

    if (decreaseNextIndentRegex = this.decreaseNextIndentRegexForScopeDescriptor(scopeDescriptor)) {
      if (decreaseNextIndentRegex.testSync(precedingLine)) { desiredIndentLevel -= 1; }
    }

    if ((desiredIndentLevel >= 0) && (desiredIndentLevel < currentIndentLevel)) {
      return this.editor.setIndentationForBufferRow(bufferRow, desiredIndentLevel);
    }
  }

  cacheRegex(pattern) {
    if (pattern) {
      return this.regexesByPattern[pattern] != null ? this.regexesByPattern[pattern] : (this.regexesByPattern[pattern] = new OnigRegExp(pattern));
    }
  }

  increaseIndentRegexForScopeDescriptor(scopeDescriptor) {
    return this.cacheRegex(this.editor.getIncreaseIndentPattern(scopeDescriptor));
  }

  decreaseIndentRegexForScopeDescriptor(scopeDescriptor) {
    return this.cacheRegex(this.editor.getDecreaseIndentPattern(scopeDescriptor));
  }

  decreaseNextIndentRegexForScopeDescriptor(scopeDescriptor) {
    return this.cacheRegex(this.editor.getDecreaseNextIndentPattern(scopeDescriptor));
  }

  foldEndRegexForScopeDescriptor(scopeDescriptor) {
    return this.cacheRegex(this.editor.getFoldEndPattern(scopeDescriptor));
  }
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}