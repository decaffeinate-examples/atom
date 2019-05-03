/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS202: Simplify dynamic range loops
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Selection;
const {Point, Range} = require('text-buffer');
const {pick} = require('underscore-plus');
const {Emitter} = require('event-kit');
const Model = require('./model');

const NonWhitespaceRegExp = /\S/;

// Extended: Represents a selection in the {TextEditor}.
module.exports =
(Selection = (function() {
  Selection = class Selection extends Model {
    static initClass() {
      this.prototype.cursor = null;
      this.prototype.marker = null;
      this.prototype.editor = null;
      this.prototype.initialScreenRange = null;
      this.prototype.wordwise = false;
    }

    constructor({cursor, marker, editor, id}) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { return this; }).toString();
        let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
        eval(`${thisName} = this;`);
      }
      this.cursor = cursor;
      this.marker = marker;
      this.editor = editor;
      this.emitter = new Emitter;

      this.assignId(id);
      this.cursor.selection = this;
      this.decoration = this.editor.decorateMarker(this.marker, {type: 'highlight', class: 'selection'});

      this.marker.onDidChange(e => this.markerDidChange(e));
      this.marker.onDidDestroy(() => this.markerDidDestroy());
    }

    destroy() {
      return this.marker.destroy();
    }

    isLastSelection() {
      return this === this.editor.getLastSelection();
    }

    /*
    Section: Event Subscription
    */

    // Extended: Calls your `callback` when the selection was moved.
    //
    // * `callback` {Function}
    //   * `event` {Object}
    //     * `oldBufferRange` {Range}
    //     * `oldScreenRange` {Range}
    //     * `newBufferRange` {Range}
    //     * `newScreenRange` {Range}
    //     * `selection` {Selection} that triggered the event
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeRange(callback) {
      return this.emitter.on('did-change-range', callback);
    }

    // Extended: Calls your `callback` when the selection was destroyed
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidDestroy(callback) {
      return this.emitter.once('did-destroy', callback);
    }

    /*
    Section: Managing the selection range
    */

    // Public: Returns the screen {Range} for the selection.
    getScreenRange() {
      return this.marker.getScreenRange();
    }

    // Public: Modifies the screen range for the selection.
    //
    // * `screenRange` The new {Range} to use.
    // * `options` (optional) {Object} options matching those found in {::setBufferRange}.
    setScreenRange(screenRange, options) {
      return this.setBufferRange(this.editor.bufferRangeForScreenRange(screenRange), options);
    }

    // Public: Returns the buffer {Range} for the selection.
    getBufferRange() {
      return this.marker.getBufferRange();
    }

    // Public: Modifies the buffer {Range} for the selection.
    //
    // * `bufferRange` The new {Range} to select.
    // * `options` (optional) {Object} with the keys:
    //   * `preserveFolds` if `true`, the fold settings are preserved after the
    //     selection moves.
    //   * `autoscroll` {Boolean} indicating whether to autoscroll to the new
    //     range. Defaults to `true` if this is the most recently added selection,
    //     `false` otherwise.
    setBufferRange(bufferRange, options) {
      if (options == null) { options = {}; }
      bufferRange = Range.fromObject(bufferRange);
      if (options.reversed == null) { options.reversed = this.isReversed(); }
      if (!options.preserveFolds) { this.editor.destroyFoldsIntersectingBufferRange(bufferRange); }
      return this.modifySelection(() => {
        const needsFlash = options.flash;
        if (options.flash != null) { delete options.flash; }
        this.marker.setBufferRange(bufferRange, options);
        if ((options != null ? options.autoscroll : undefined) != null ? (options != null ? options.autoscroll : undefined) : this.isLastSelection()) { this.autoscroll(); }
        if (needsFlash) { return this.decoration.flash('flash', this.editor.selectionFlashDuration); }
      });
    }

    // Public: Returns the starting and ending buffer rows the selection is
    // highlighting.
    //
    // Returns an {Array} of two {Number}s: the starting row, and the ending row.
    getBufferRowRange() {
      const range = this.getBufferRange();
      const start = range.start.row;
      let end = range.end.row;
      if (range.end.column === 0) { end = Math.max(start, end - 1); }
      return [start, end];
    }

    getTailScreenPosition() {
      return this.marker.getTailScreenPosition();
    }

    getTailBufferPosition() {
      return this.marker.getTailBufferPosition();
    }

    getHeadScreenPosition() {
      return this.marker.getHeadScreenPosition();
    }

    getHeadBufferPosition() {
      return this.marker.getHeadBufferPosition();
    }

    /*
    Section: Info about the selection
    */

    // Public: Determines if the selection contains anything.
    isEmpty() {
      return this.getBufferRange().isEmpty();
    }

    // Public: Determines if the ending position of a marker is greater than the
    // starting position.
    //
    // This can happen when, for example, you highlight text "up" in a {TextBuffer}.
    isReversed() {
      return this.marker.isReversed();
    }

    // Public: Returns whether the selection is a single line or not.
    isSingleScreenLine() {
      return this.getScreenRange().isSingleLine();
    }

    // Public: Returns the text in the selection.
    getText() {
      return this.editor.buffer.getTextInRange(this.getBufferRange());
    }

    // Public: Identifies if a selection intersects with a given buffer range.
    //
    // * `bufferRange` A {Range} to check against.
    //
    // Returns a {Boolean}
    intersectsBufferRange(bufferRange) {
      return this.getBufferRange().intersectsWith(bufferRange);
    }

    intersectsScreenRowRange(startRow, endRow) {
      return this.getScreenRange().intersectsRowRange(startRow, endRow);
    }

    intersectsScreenRow(screenRow) {
      return this.getScreenRange().intersectsRow(screenRow);
    }

    // Public: Identifies if a selection intersects with another selection.
    //
    // * `otherSelection` A {Selection} to check against.
    //
    // Returns a {Boolean}
    intersectsWith(otherSelection, exclusive) {
      return this.getBufferRange().intersectsWith(otherSelection.getBufferRange(), exclusive);
    }

    /*
    Section: Modifying the selected range
    */

    // Public: Clears the selection, moving the marker to the head.
    //
    // * `options` (optional) {Object} with the following keys:
    //   * `autoscroll` {Boolean} indicating whether to autoscroll to the new
    //     range. Defaults to `true` if this is the most recently added selection,
    //     `false` otherwise.
    clear(options) {
      this.goalScreenRange = null;
      if (!this.retainSelection) { this.marker.clearTail(); }
      if ((options != null ? options.autoscroll : undefined) != null ? (options != null ? options.autoscroll : undefined) : this.isLastSelection()) { this.autoscroll(); }
      return this.finalize();
    }

    // Public: Selects the text from the current cursor position to a given screen
    // position.
    //
    // * `position` An instance of {Point}, with a given `row` and `column`.
    selectToScreenPosition(position, options) {
      position = Point.fromObject(position);

      return this.modifySelection(() => {
        if (this.initialScreenRange) {
          if (position.isLessThan(this.initialScreenRange.start)) {
            this.marker.setScreenRange([position, this.initialScreenRange.end], {reversed: true});
          } else {
            this.marker.setScreenRange([this.initialScreenRange.start, position], {reversed: false});
          }
        } else {
          this.cursor.setScreenPosition(position, options);
        }

        if (this.linewise) {
          return this.expandOverLine(options);
        } else if (this.wordwise) {
          return this.expandOverWord(options);
        }
      });
    }

    // Public: Selects the text from the current cursor position to a given buffer
    // position.
    //
    // * `position` An instance of {Point}, with a given `row` and `column`.
    selectToBufferPosition(position) {
      return this.modifySelection(() => this.cursor.setBufferPosition(position));
    }

    // Public: Selects the text one position right of the cursor.
    //
    // * `columnCount` (optional) {Number} number of columns to select (default: 1)
    selectRight(columnCount) {
      return this.modifySelection(() => this.cursor.moveRight(columnCount));
    }

    // Public: Selects the text one position left of the cursor.
    //
    // * `columnCount` (optional) {Number} number of columns to select (default: 1)
    selectLeft(columnCount) {
      return this.modifySelection(() => this.cursor.moveLeft(columnCount));
    }

    // Public: Selects all the text one position above the cursor.
    //
    // * `rowCount` (optional) {Number} number of rows to select (default: 1)
    selectUp(rowCount) {
      return this.modifySelection(() => this.cursor.moveUp(rowCount));
    }

    // Public: Selects all the text one position below the cursor.
    //
    // * `rowCount` (optional) {Number} number of rows to select (default: 1)
    selectDown(rowCount) {
      return this.modifySelection(() => this.cursor.moveDown(rowCount));
    }

    // Public: Selects all the text from the current cursor position to the top of
    // the buffer.
    selectToTop() {
      return this.modifySelection(() => this.cursor.moveToTop());
    }

    // Public: Selects all the text from the current cursor position to the bottom
    // of the buffer.
    selectToBottom() {
      return this.modifySelection(() => this.cursor.moveToBottom());
    }

    // Public: Selects all the text in the buffer.
    selectAll() {
      return this.setBufferRange(this.editor.buffer.getRange(), {autoscroll: false});
    }

    // Public: Selects all the text from the current cursor position to the
    // beginning of the line.
    selectToBeginningOfLine() {
      return this.modifySelection(() => this.cursor.moveToBeginningOfLine());
    }

    // Public: Selects all the text from the current cursor position to the first
    // character of the line.
    selectToFirstCharacterOfLine() {
      return this.modifySelection(() => this.cursor.moveToFirstCharacterOfLine());
    }

    // Public: Selects all the text from the current cursor position to the end of
    // the screen line.
    selectToEndOfLine() {
      return this.modifySelection(() => this.cursor.moveToEndOfScreenLine());
    }

    // Public: Selects all the text from the current cursor position to the end of
    // the buffer line.
    selectToEndOfBufferLine() {
      return this.modifySelection(() => this.cursor.moveToEndOfLine());
    }

    // Public: Selects all the text from the current cursor position to the
    // beginning of the word.
    selectToBeginningOfWord() {
      return this.modifySelection(() => this.cursor.moveToBeginningOfWord());
    }

    // Public: Selects all the text from the current cursor position to the end of
    // the word.
    selectToEndOfWord() {
      return this.modifySelection(() => this.cursor.moveToEndOfWord());
    }

    // Public: Selects all the text from the current cursor position to the
    // beginning of the next word.
    selectToBeginningOfNextWord() {
      return this.modifySelection(() => this.cursor.moveToBeginningOfNextWord());
    }

    // Public: Selects text to the previous word boundary.
    selectToPreviousWordBoundary() {
      return this.modifySelection(() => this.cursor.moveToPreviousWordBoundary());
    }

    // Public: Selects text to the next word boundary.
    selectToNextWordBoundary() {
      return this.modifySelection(() => this.cursor.moveToNextWordBoundary());
    }

    // Public: Selects text to the previous subword boundary.
    selectToPreviousSubwordBoundary() {
      return this.modifySelection(() => this.cursor.moveToPreviousSubwordBoundary());
    }

    // Public: Selects text to the next subword boundary.
    selectToNextSubwordBoundary() {
      return this.modifySelection(() => this.cursor.moveToNextSubwordBoundary());
    }

    // Public: Selects all the text from the current cursor position to the
    // beginning of the next paragraph.
    selectToBeginningOfNextParagraph() {
      return this.modifySelection(() => this.cursor.moveToBeginningOfNextParagraph());
    }

    // Public: Selects all the text from the current cursor position to the
    // beginning of the previous paragraph.
    selectToBeginningOfPreviousParagraph() {
      return this.modifySelection(() => this.cursor.moveToBeginningOfPreviousParagraph());
    }

    // Public: Modifies the selection to encompass the current word.
    //
    // Returns a {Range}.
    selectWord(options) {
      if (options == null) { options = {}; }
      if (this.cursor.isSurroundedByWhitespace()) { options.wordRegex = /[\t ]*/; }
      if (this.cursor.isBetweenWordAndNonWord()) {
        options.includeNonWordCharacters = false;
      }

      this.setBufferRange(this.cursor.getCurrentWordBufferRange(options), options);
      this.wordwise = true;
      return this.initialScreenRange = this.getScreenRange();
    }

    // Public: Expands the newest selection to include the entire word on which
    // the cursors rests.
    expandOverWord(options) {
      this.setBufferRange(this.getBufferRange().union(this.cursor.getCurrentWordBufferRange()), {autoscroll: false});
      if ((options != null ? options.autoscroll : undefined) != null ? (options != null ? options.autoscroll : undefined) : true) { return this.cursor.autoscroll(); }
    }

    // Public: Selects an entire line in the buffer.
    //
    // * `row` The line {Number} to select (default: the row of the cursor).
    selectLine(row, options) {
      if (row != null) {
        this.setBufferRange(this.editor.bufferRangeForBufferRow(row, {includeNewline: true}), options);
      } else {
        const startRange = this.editor.bufferRangeForBufferRow(this.marker.getStartBufferPosition().row);
        const endRange = this.editor.bufferRangeForBufferRow(this.marker.getEndBufferPosition().row, {includeNewline: true});
        this.setBufferRange(startRange.union(endRange), options);
      }

      this.linewise = true;
      this.wordwise = false;
      return this.initialScreenRange = this.getScreenRange();
    }

    // Public: Expands the newest selection to include the entire line on which
    // the cursor currently rests.
    //
    // It also includes the newline character.
    expandOverLine(options) {
      const range = this.getBufferRange().union(this.cursor.getCurrentLineBufferRange({includeNewline: true}));
      this.setBufferRange(range, {autoscroll: false});
      if ((options != null ? options.autoscroll : undefined) != null ? (options != null ? options.autoscroll : undefined) : true) { return this.cursor.autoscroll(); }
    }

    /*
    Section: Modifying the selected text
    */

    // Public: Replaces text at the current selection.
    //
    // * `text` A {String} representing the text to add
    // * `options` (optional) {Object} with keys:
    //   * `select` if `true`, selects the newly added text.
    //   * `autoIndent` if `true`, indents all inserted text appropriately.
    //   * `autoIndentNewline` if `true`, indent newline appropriately.
    //   * `autoDecreaseIndent` if `true`, decreases indent level appropriately
    //     (for example, when a closing bracket is inserted).
    //   * `normalizeLineEndings` (optional) {Boolean} (default: true)
    //   * `undo` if `skip`, skips the undo stack for this operation.
    insertText(text, options) {
      let desiredIndentLevel, indentAdjustment;
      if (options == null) { options = {}; }
      const oldBufferRange = this.getBufferRange();
      const wasReversed = this.isReversed();
      this.clear(options);

      let autoIndentFirstLine = false;
      const precedingText = this.editor.getTextInRange([[oldBufferRange.start.row, 0], oldBufferRange.start]);
      const remainingLines = text.split('\n');
      const firstInsertedLine = remainingLines.shift();

      if (options.indentBasis != null) {
        indentAdjustment = this.editor.indentLevelForLine(precedingText) - options.indentBasis;
        this.adjustIndent(remainingLines, indentAdjustment);
      }

      const textIsAutoIndentable = (text === '\n') || (text === '\r\n') || NonWhitespaceRegExp.test(text);
      if (options.autoIndent && textIsAutoIndentable && !NonWhitespaceRegExp.test(precedingText) && (remainingLines.length > 0)) {
        autoIndentFirstLine = true;
        const firstLine = precedingText + firstInsertedLine;
        desiredIndentLevel = this.editor.languageMode.suggestedIndentForLineAtBufferRow(oldBufferRange.start.row, firstLine);
        indentAdjustment = desiredIndentLevel - this.editor.indentLevelForLine(firstLine);
        this.adjustIndent(remainingLines, indentAdjustment);
      }

      text = firstInsertedLine;
      if (remainingLines.length > 0) { text += `\n${remainingLines.join('\n')}`; }

      const newBufferRange = this.editor.buffer.setTextInRange(oldBufferRange, text, pick(options, 'undo', 'normalizeLineEndings'));

      if (options.select) {
        this.setBufferRange(newBufferRange, {reversed: wasReversed});
      } else {
        if (wasReversed) { this.cursor.setBufferPosition(newBufferRange.end); }
      }

      if (autoIndentFirstLine) {
        this.editor.setIndentationForBufferRow(oldBufferRange.start.row, desiredIndentLevel);
      }

      if (options.autoIndentNewline && (text === '\n')) {
        this.editor.autoIndentBufferRow(newBufferRange.end.row, {preserveLeadingWhitespace: true, skipBlankLines: false});
      } else if (options.autoDecreaseIndent && NonWhitespaceRegExp.test(text)) {
        this.editor.autoDecreaseIndentForBufferRow(newBufferRange.start.row);
      }

      if (options.autoscroll != null ? options.autoscroll : this.isLastSelection()) { this.autoscroll(); }

      return newBufferRange;
    }

    // Public: Removes the first character before the selection if the selection
    // is empty otherwise it deletes the selection.
    backspace() {
      if (this.isEmpty()) { this.selectLeft(); }
      return this.deleteSelectedText();
    }

    // Public: Removes the selection or, if nothing is selected, then all
    // characters from the start of the selection back to the previous word
    // boundary.
    deleteToPreviousWordBoundary() {
      if (this.isEmpty()) { this.selectToPreviousWordBoundary(); }
      return this.deleteSelectedText();
    }

    // Public: Removes the selection or, if nothing is selected, then all
    // characters from the start of the selection up to the next word
    // boundary.
    deleteToNextWordBoundary() {
      if (this.isEmpty()) { this.selectToNextWordBoundary(); }
      return this.deleteSelectedText();
    }

    // Public: Removes from the start of the selection to the beginning of the
    // current word if the selection is empty otherwise it deletes the selection.
    deleteToBeginningOfWord() {
      if (this.isEmpty()) { this.selectToBeginningOfWord(); }
      return this.deleteSelectedText();
    }

    // Public: Removes from the beginning of the line which the selection begins on
    // all the way through to the end of the selection.
    deleteToBeginningOfLine() {
      if (this.isEmpty() && this.cursor.isAtBeginningOfLine()) {
        this.selectLeft();
      } else {
        this.selectToBeginningOfLine();
      }
      return this.deleteSelectedText();
    }

    // Public: Removes the selection or the next character after the start of the
    // selection if the selection is empty.
    delete() {
      if (this.isEmpty()) { this.selectRight(); }
      return this.deleteSelectedText();
    }

    // Public: If the selection is empty, removes all text from the cursor to the
    // end of the line. If the cursor is already at the end of the line, it
    // removes the following newline. If the selection isn't empty, only deletes
    // the contents of the selection.
    deleteToEndOfLine() {
      if (this.isEmpty() && this.cursor.isAtEndOfLine()) { return this.delete(); }
      if (this.isEmpty()) { this.selectToEndOfLine(); }
      return this.deleteSelectedText();
    }

    // Public: Removes the selection or all characters from the start of the
    // selection to the end of the current word if nothing is selected.
    deleteToEndOfWord() {
      if (this.isEmpty()) { this.selectToEndOfWord(); }
      return this.deleteSelectedText();
    }

    // Public: Removes the selection or all characters from the start of the
    // selection to the end of the current word if nothing is selected.
    deleteToBeginningOfSubword() {
      if (this.isEmpty()) { this.selectToPreviousSubwordBoundary(); }
      return this.deleteSelectedText();
    }

    // Public: Removes the selection or all characters from the start of the
    // selection to the end of the current word if nothing is selected.
    deleteToEndOfSubword() {
      if (this.isEmpty()) { this.selectToNextSubwordBoundary(); }
      return this.deleteSelectedText();
    }

    // Public: Removes only the selected text.
    deleteSelectedText() {
      const bufferRange = this.getBufferRange();
      if (!bufferRange.isEmpty()) { this.editor.buffer.delete(bufferRange); }
      return (this.cursor != null ? this.cursor.setBufferPosition(bufferRange.start) : undefined);
    }

    // Public: Removes the line at the beginning of the selection if the selection
    // is empty unless the selection spans multiple lines in which case all lines
    // are removed.
    deleteLine() {
      let range, start;
      if (this.isEmpty()) {
        start = this.cursor.getScreenRow();
        range = this.editor.bufferRowsForScreenRows(start, start + 1);
        if (range[1] > range[0]) {
          return this.editor.buffer.deleteRows(range[0], range[1] - 1);
        } else {
          return this.editor.buffer.deleteRow(range[0]);
        }
      } else {
        range = this.getBufferRange();
        start = range.start.row;
        let end = range.end.row;
        if ((end !== this.editor.buffer.getLastRow()) && (range.end.column === 0)) {
          end--;
        }
        return this.editor.buffer.deleteRows(start, end);
      }
    }

    // Public: Joins the current line with the one below it. Lines will
    // be separated by a single space.
    //
    // If there selection spans more than one line, all the lines are joined together.
    joinLines() {
      let joinMarker;
      const selectedRange = this.getBufferRange();
      if (selectedRange.isEmpty()) {
        if (selectedRange.start.row === this.editor.buffer.getLastRow()) { return; }
      } else {
        joinMarker = this.editor.markBufferRange(selectedRange, {invalidate: 'never'});
      }

      const rowCount = Math.max(1, selectedRange.getRowCount() - 1);
      for (let i = 0, end = rowCount, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        this.cursor.setBufferPosition([selectedRange.start.row]);
        this.cursor.moveToEndOfLine();

        // Remove trailing whitespace from the current line
        const scanRange = this.cursor.getCurrentLineBufferRange();
        let trailingWhitespaceRange = null;
        this.editor.scanInBufferRange(/[ \t]+$/, scanRange, ({range}) => trailingWhitespaceRange = range);
        if (trailingWhitespaceRange != null) {
          this.setBufferRange(trailingWhitespaceRange);
          this.deleteSelectedText();
        }

        const currentRow = selectedRange.start.row;
        const nextRow = currentRow + 1;
        const insertSpace = (nextRow <= this.editor.buffer.getLastRow()) &&
                      (this.editor.buffer.lineLengthForRow(nextRow) > 0) &&
                      (this.editor.buffer.lineLengthForRow(currentRow) > 0);
        if (insertSpace) { this.insertText(' '); }

        this.cursor.moveToEndOfLine();

        // Remove leading whitespace from the line below
        this.modifySelection(() => {
          this.cursor.moveRight();
          return this.cursor.moveToFirstCharacterOfLine();
        });
        this.deleteSelectedText();

        if (insertSpace) { this.cursor.moveLeft(); }
      }

      if (joinMarker != null) {
        const newSelectedRange = joinMarker.getBufferRange();
        this.setBufferRange(newSelectedRange);
        return joinMarker.destroy();
      }
    }

    // Public: Removes one level of indent from the currently selected rows.
    outdentSelectedRows() {
      const [start, end] = Array.from(this.getBufferRowRange());
      const { buffer } = this.editor;
      const leadingTabRegex = new RegExp(`^( {1,${this.editor.getTabLength()}}|\t)`);
      for (let row = start, end1 = end, asc = start <= end1; asc ? row <= end1 : row >= end1; asc ? row++ : row--) {
        var matchLength;
        if (matchLength = __guard__(buffer.lineForRow(row).match(leadingTabRegex), x => x[0].length)) {
          buffer.delete([[row, 0], [row, matchLength]]);
        }
      }
    }

    // Public: Sets the indentation level of all selected rows to values suggested
    // by the relevant grammars.
    autoIndentSelectedRows() {
      const [start, end] = Array.from(this.getBufferRowRange());
      return this.editor.autoIndentBufferRows(start, end);
    }

    // Public: Wraps the selected lines in comments if they aren't currently part
    // of a comment.
    //
    // Removes the comment if they are currently wrapped in a comment.
    toggleLineComments() {
      return this.editor.toggleLineCommentsForBufferRows(...Array.from(this.getBufferRowRange() || []));
    }

    // Public: Cuts the selection until the end of the screen line.
    cutToEndOfLine(maintainClipboard) {
      if (this.isEmpty()) { this.selectToEndOfLine(); }
      return this.cut(maintainClipboard);
    }

    // Public: Cuts the selection until the end of the buffer line.
    cutToEndOfBufferLine(maintainClipboard) {
      if (this.isEmpty()) { this.selectToEndOfBufferLine(); }
      return this.cut(maintainClipboard);
    }

    // Public: Copies the selection to the clipboard and then deletes it.
    //
    // * `maintainClipboard` {Boolean} (default: false) See {::copy}
    // * `fullLine` {Boolean} (default: false) See {::copy}
    cut(maintainClipboard, fullLine) {
      if (maintainClipboard == null) { maintainClipboard = false; }
      if (fullLine == null) { fullLine = false; }
      this.copy(maintainClipboard, fullLine);
      return this.delete();
    }

    // Public: Copies the current selection to the clipboard.
    //
    // * `maintainClipboard` {Boolean} if `true`, a specific metadata property
    //   is created to store each content copied to the clipboard. The clipboard
    //   `text` still contains the concatenation of the clipboard with the
    //   current selection. (default: false)
    // * `fullLine` {Boolean} if `true`, the copied text will always be pasted
    //   at the beginning of the line containing the cursor, regardless of the
    //   cursor's horizontal position. (default: false)
    copy(maintainClipboard, fullLine) {
      if (maintainClipboard == null) { maintainClipboard = false; }
      if (fullLine == null) { fullLine = false; }
      if (this.isEmpty()) { return; }
      const {start, end} = this.getBufferRange();
      const selectionText = this.editor.getTextInRange([start, end]);
      const precedingText = this.editor.getTextInRange([[start.row, 0], start]);
      const startLevel = this.editor.indentLevelForLine(precedingText);

      if (maintainClipboard) {
        let {text: clipboardText, metadata} = this.editor.constructor.clipboard.readWithMetadata();
        if (metadata == null) { metadata = {}; }
        if (metadata.selections == null) {
          metadata.selections = [{
            text: clipboardText,
            indentBasis: metadata.indentBasis,
            fullLine: metadata.fullLine,
          }];
        }
        metadata.selections.push({
          text: selectionText,
          indentBasis: startLevel,
          fullLine
        });
        return this.editor.constructor.clipboard.write([clipboardText, selectionText].join("\n"), metadata);
      } else {
        return this.editor.constructor.clipboard.write(selectionText, {
          indentBasis: startLevel,
          fullLine
        });
      }
    }

    // Public: Creates a fold containing the current selection.
    fold() {
      const range = this.getBufferRange();
      if (!range.isEmpty()) {
        this.editor.foldBufferRange(range);
        return this.cursor.setBufferPosition(range.end);
      }
    }

    // Private: Increase the indentation level of the given text by given number
    // of levels. Leaves the first line unchanged.
    adjustIndent(lines, indentAdjustment) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if ((indentAdjustment === 0) || (line === '')) {
          continue;
        } else if (indentAdjustment > 0) {
          lines[i] = this.editor.buildIndentString(indentAdjustment) + line;
        } else {
          const currentIndentLevel = this.editor.indentLevelForLine(lines[i]);
          const indentLevel = Math.max(0, currentIndentLevel + indentAdjustment);
          lines[i] = line.replace(/^[\t ]+/, this.editor.buildIndentString(indentLevel));
        }
      }
    }

    // Indent the current line(s).
    //
    // If the selection is empty, indents the current line if the cursor precedes
    // non-whitespace characters, and otherwise inserts a tab. If the selection is
    // non empty, calls {::indentSelectedRows}.
    //
    // * `options` (optional) {Object} with the keys:
    //   * `autoIndent` If `true`, the line is indented to an automatically-inferred
    //     level. Otherwise, {TextEditor::getTabText} is inserted.
    indent(param) {
      if (param == null) { param = {}; }
      const {autoIndent} = param;
      const {row} = this.cursor.getBufferPosition();

      if (this.isEmpty()) {
        this.cursor.skipLeadingWhitespace();
        const desiredIndent = this.editor.suggestedIndentForBufferRow(row);
        let delta = desiredIndent - this.cursor.getIndentLevel();

        if (autoIndent && (delta > 0)) {
          if (!this.editor.getSoftTabs()) { delta = Math.max(delta, 1); }
          return this.insertText(this.editor.buildIndentString(delta));
        } else {
          return this.insertText(this.editor.buildIndentString(1, this.cursor.getBufferColumn()));
        }
      } else {
        return this.indentSelectedRows();
      }
    }

    // Public: If the selection spans multiple rows, indent all of them.
    indentSelectedRows() {
      const [start, end] = Array.from(this.getBufferRowRange());
      for (let row = start, end1 = end, asc = start <= end1; asc ? row <= end1 : row >= end1; asc ? row++ : row--) {
        if (this.editor.buffer.lineLengthForRow(row) !== 0) { this.editor.buffer.insert([row, 0], this.editor.getTabText()); }
      }
    }

    /*
    Section: Managing multiple selections
    */

    // Public: Moves the selection down one row.
    addSelectionBelow() {
      const range = this.getGoalScreenRange().copy();
      const nextRow = range.end.row + 1;

      for (let row = nextRow, end = this.editor.getLastScreenRow(), asc = nextRow <= end; asc ? row <= end : row >= end; asc ? row++ : row--) {
        range.start.row = row;
        range.end.row = row;
        const clippedRange = this.editor.clipScreenRange(range, {skipSoftWrapIndentation: true});

        if (range.isEmpty()) {
          if ((range.end.column > 0) && (clippedRange.end.column === 0)) { continue; }
        } else {
          if (clippedRange.isEmpty()) { continue; }
        }

        const selection = this.editor.addSelectionForScreenRange(clippedRange);
        selection.setGoalScreenRange(range);
        break;
      }

    }

    // Public: Moves the selection up one row.
    addSelectionAbove() {
      const range = this.getGoalScreenRange().copy();
      const previousRow = range.end.row - 1;

      for (let row = previousRow, asc = previousRow <= 0; asc ? row <= 0 : row >= 0; asc ? row++ : row--) {
        range.start.row = row;
        range.end.row = row;
        const clippedRange = this.editor.clipScreenRange(range, {skipSoftWrapIndentation: true});

        if (range.isEmpty()) {
          if ((range.end.column > 0) && (clippedRange.end.column === 0)) { continue; }
        } else {
          if (clippedRange.isEmpty()) { continue; }
        }

        const selection = this.editor.addSelectionForScreenRange(clippedRange);
        selection.setGoalScreenRange(range);
        break;
      }

    }

    // Public: Combines the given selection into this selection and then destroys
    // the given selection.
    //
    // * `otherSelection` A {Selection} to merge with.
    // * `options` (optional) {Object} options matching those found in {::setBufferRange}.
    merge(otherSelection, options) {
      const myGoalScreenRange = this.getGoalScreenRange();
      const otherGoalScreenRange = otherSelection.getGoalScreenRange();

      if ((myGoalScreenRange != null) && (otherGoalScreenRange != null)) {
        options.goalScreenRange = myGoalScreenRange.union(otherGoalScreenRange);
      } else {
        options.goalScreenRange = myGoalScreenRange != null ? myGoalScreenRange : otherGoalScreenRange;
      }

      this.setBufferRange(this.getBufferRange().union(otherSelection.getBufferRange()), Object.assign({autoscroll: false}, options));
      return otherSelection.destroy();
    }

    /*
    Section: Comparing to other selections
    */

    // Public: Compare this selection's buffer range to another selection's buffer
    // range.
    //
    // See {Range::compare} for more details.
    //
    // * `otherSelection` A {Selection} to compare against
    compare(otherSelection) {
      return this.marker.compare(otherSelection.marker);
    }

    /*
    Section: Private Utilities
    */

    setGoalScreenRange(range) {
      return this.goalScreenRange = Range.fromObject(range);
    }

    getGoalScreenRange() {
      return this.goalScreenRange != null ? this.goalScreenRange : this.getScreenRange();
    }

    markerDidChange(e) {
      const {oldHeadBufferPosition, oldTailBufferPosition, newHeadBufferPosition} = e;
      const {oldHeadScreenPosition, oldTailScreenPosition, newHeadScreenPosition} = e;
      const {textChanged} = e;

      if (!oldHeadScreenPosition.isEqual(newHeadScreenPosition)) {
        this.cursor.goalColumn = null;
        const cursorMovedEvent = {
          oldBufferPosition: oldHeadBufferPosition,
          oldScreenPosition: oldHeadScreenPosition,
          newBufferPosition: newHeadBufferPosition,
          newScreenPosition: newHeadScreenPosition,
          textChanged,
          cursor: this.cursor
        };
        this.cursor.emitter.emit('did-change-position', cursorMovedEvent);
        this.editor.cursorMoved(cursorMovedEvent);
      }

      this.emitter.emit('did-change-range');
      return this.editor.selectionRangeChanged({
        oldBufferRange: new Range(oldHeadBufferPosition, oldTailBufferPosition),
        oldScreenRange: new Range(oldHeadScreenPosition, oldTailScreenPosition),
        newBufferRange: this.getBufferRange(),
        newScreenRange: this.getScreenRange(),
        selection: this
      });
    }

    markerDidDestroy() {
      if (this.editor.isDestroyed()) { return; }

      this.destroyed = true;
      this.cursor.destroyed = true;

      this.editor.removeSelection(this);

      this.cursor.emitter.emit('did-destroy');
      this.emitter.emit('did-destroy');

      this.cursor.emitter.dispose();
      return this.emitter.dispose();
    }

    finalize() {
      if (!(this.initialScreenRange != null ? this.initialScreenRange.isEqual(this.getScreenRange()) : undefined)) { this.initialScreenRange = null; }
      if (this.isEmpty()) {
        this.wordwise = false;
        return this.linewise = false;
      }
    }

    autoscroll(options) {
      if (this.marker.hasTail()) {
        return this.editor.scrollToScreenRange(this.getScreenRange(), Object.assign({reversed: this.isReversed()}, options));
      } else {
        return this.cursor.autoscroll(options);
      }
    }

    clearAutoscroll() {}

    modifySelection(fn) {
      this.retainSelection = true;
      this.plantTail();
      fn();
      return this.retainSelection = false;
    }

    // Sets the marker's tail to the same position as the marker's head.
    //
    // This only works if there isn't already a tail position.
    //
    // Returns a {Point} representing the new tail position.
    plantTail() {
      return this.marker.plantTail();
    }
  };
  Selection.initClass();
  return Selection;
})());

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}