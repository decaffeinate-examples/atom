/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS202: Simplify dynamic range loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const clipboard = require('../src/safe-clipboard');
const TextEditor = require('../src/text-editor');
const TextBuffer = require('text-buffer');

describe("TextEditor", function() {
  let [buffer, editor, lineLengths] = Array.from([]);

  const convertToHardTabs = buffer => buffer.setText(buffer.getText().replace(/[ ]{2}/g, "\t"));

  beforeEach(function() {
    waitsForPromise(() => atom.workspace.open('sample.js', {autoIndent: false}).then(o => editor = o));

    runs(function() {
      ({ buffer } = editor);
      editor.update({autoIndent: false});
      return lineLengths = buffer.getLines().map(line => line.length);
    });

    return waitsForPromise(() => atom.packages.activatePackage('language-javascript'));
  });

  describe("when the editor is deserialized", function() {
    it("restores selections and folds based on markers in the buffer", function() {
      editor.setSelectedBufferRange([[1, 2], [3, 4]]);
      editor.addSelectionForBufferRange([[5, 6], [7, 5]], {reversed: true});
      editor.foldBufferRow(4);
      expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();

      return waitsForPromise(() =>
        TextBuffer.deserialize(editor.buffer.serialize()).then(function(buffer2) {
          const editor2 = TextEditor.deserialize(editor.serialize(), {
            assert: atom.assert,
            textEditors: atom.textEditors,
            project: {bufferForIdSync() { return buffer2; }}
          });

          expect(editor2.id).toBe(editor.id);
          expect(editor2.getBuffer().getPath()).toBe(editor.getBuffer().getPath());
          expect(editor2.getSelectedBufferRanges()).toEqual([[[1, 2], [3, 4]], [[5, 6], [7, 5]]]);
          expect(editor2.getSelections()[1].isReversed()).toBeTruthy();
          expect(editor2.isFoldedAtBufferRow(4)).toBeTruthy();
          return editor2.destroy();
        })
      );
    });

    return it("restores the editor's layout configuration", function() {
      editor.update({
        softTabs: true,
        atomicSoftTabs: false,
        tabLength: 12,
        softWrapped: true,
        softWrapAtPreferredLineLength: true,
        softWrapHangingIndentLength: 8,
        invisibles: {space: 'S'},
        showInvisibles: true,
        editorWidthInChars: 120
      });

      // Force buffer and display layer to be deserialized as well, rather than
      // reusing the same buffer instance
      return waitsForPromise(() =>
        TextBuffer.deserialize(editor.buffer.serialize()).then(function(buffer2) {
          const editor2 = TextEditor.deserialize(editor.serialize(), {
            assert: atom.assert,
            textEditors: atom.textEditors,
            project: {bufferForIdSync() { return buffer2; }}
          });

          expect(editor2.getSoftTabs()).toBe(editor.getSoftTabs());
          expect(editor2.hasAtomicSoftTabs()).toBe(editor.hasAtomicSoftTabs());
          expect(editor2.getTabLength()).toBe(editor.getTabLength());
          expect(editor2.getSoftWrapColumn()).toBe(editor.getSoftWrapColumn());
          expect(editor2.getSoftWrapHangingIndentLength()).toBe(editor.getSoftWrapHangingIndentLength());
          expect(editor2.getInvisibles()).toEqual(editor.getInvisibles());
          expect(editor2.getEditorWidthInChars()).toBe(editor.getEditorWidthInChars());
          return expect(editor2.displayLayer.tabLength).toBe(editor2.getTabLength());
        })
      );
    });
  });

  describe("when the editor is constructed with the largeFileMode option set to true", () =>
    it("loads the editor but doesn't tokenize", function() {
      editor = null;

      waitsForPromise(() => atom.workspace.openTextFile('sample.js', {largeFileMode: true}).then(o => editor = o));

      return runs(function() {
        buffer = editor.getBuffer();
        expect(editor.lineTextForScreenRow(0)).toBe(buffer.lineForRow(0));
        expect(editor.tokensForScreenRow(0).length).toBe(1);
        expect(editor.tokensForScreenRow(1).length).toBe(2); // soft tab
        expect(editor.lineTextForScreenRow(12)).toBe(buffer.lineForRow(12));
        expect(editor.getCursorScreenPosition()).toEqual([0, 0]);
        editor.insertText('hey"');
        expect(editor.tokensForScreenRow(0).length).toBe(1);
        return expect(editor.tokensForScreenRow(1).length).toBe(2);
      });
    })
  ); // soft tab

  describe(".copy()", () =>
    it("returns a different editor with the same initial state", function() {
      expect(editor.getAutoHeight()).toBeFalsy();
      expect(editor.getAutoWidth()).toBeFalsy();
      expect(editor.getShowCursorOnSelection()).toBeTruthy();

      const element = editor.getElement();
      element.setHeight(100);
      element.setWidth(100);
      jasmine.attachToDOM(element);

      editor.update({showCursorOnSelection: false});
      editor.setSelectedBufferRange([[1, 2], [3, 4]]);
      editor.addSelectionForBufferRange([[5, 6], [7, 8]], {reversed: true});
      editor.setScrollTopRow(3);
      expect(editor.getScrollTopRow()).toBe(3);
      editor.setScrollLeftColumn(4);
      expect(editor.getScrollLeftColumn()).toBe(4);
      editor.foldBufferRow(4);
      expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();

      const editor2 = editor.copy();
      const element2 = editor2.getElement();
      element2.setHeight(100);
      element2.setWidth(100);
      jasmine.attachToDOM(element2);
      expect(editor2.id).not.toBe(editor.id);
      expect(editor2.getSelectedBufferRanges()).toEqual(editor.getSelectedBufferRanges());
      expect(editor2.getSelections()[1].isReversed()).toBeTruthy();
      expect(editor2.getScrollTopRow()).toBe(3);
      expect(editor2.getScrollLeftColumn()).toBe(4);
      expect(editor2.isFoldedAtBufferRow(4)).toBeTruthy();
      expect(editor2.getAutoWidth()).toBe(false);
      expect(editor2.getAutoHeight()).toBe(false);
      expect(editor2.getShowCursorOnSelection()).toBeFalsy();

      // editor2 can now diverge from its origin edit session
      editor2.getLastSelection().setBufferRange([[2, 1], [4, 3]]);
      expect(editor2.getSelectedBufferRanges()).not.toEqual(editor.getSelectedBufferRanges());
      editor2.unfoldBufferRow(4);
      return expect(editor2.isFoldedAtBufferRow(4)).not.toBe(editor.isFoldedAtBufferRow(4));
    })
  );

  describe(".update()", () =>
    it("updates the editor with the supplied config parameters", function() {
      let changeSpy;
      const { element } = editor; // force element initialization
      element.setUpdatedSynchronously(false);
      editor.update({showInvisibles: true});
      editor.onDidChange(changeSpy = jasmine.createSpy('onDidChange'));

      const returnedPromise = editor.update({
        tabLength: 6, softTabs: false, softWrapped: true, editorWidthInChars: 40,
        showInvisibles: false, mini: false, lineNumberGutterVisible: false, scrollPastEnd: true,
        autoHeight: false
      });

      expect(returnedPromise).toBe(element.component.getNextUpdatePromise());
      expect(changeSpy.callCount).toBe(1);
      expect(editor.getTabLength()).toBe(6);
      expect(editor.getSoftTabs()).toBe(false);
      expect(editor.isSoftWrapped()).toBe(true);
      expect(editor.getEditorWidthInChars()).toBe(40);
      expect(editor.getInvisibles()).toEqual({});
      expect(editor.isMini()).toBe(false);
      expect(editor.isLineNumberGutterVisible()).toBe(false);
      expect(editor.getScrollPastEnd()).toBe(true);
      return expect(editor.getAutoHeight()).toBe(false);
    })
  );

  describe("title", function() {
    describe(".getTitle()", () =>
      it("uses the basename of the buffer's path as its title, or 'untitled' if the path is undefined", function() {
        expect(editor.getTitle()).toBe('sample.js');
        buffer.setPath(undefined);
        return expect(editor.getTitle()).toBe('untitled');
      })
    );

    describe(".getLongTitle()", function() {
      it("returns file name when there is no opened file with identical name", function() {
        expect(editor.getLongTitle()).toBe('sample.js');
        buffer.setPath(undefined);
        return expect(editor.getLongTitle()).toBe('untitled');
      });

      it("returns '<filename> — <parent-directory>' when opened files have identical file names", function() {
        let editor1 = null;
        let editor2 = null;
        waitsForPromise(() =>
          atom.workspace.open(path.join('sample-theme-1', 'readme')).then(function(o) {
            editor1 = o;
            return atom.workspace.open(path.join('sample-theme-2', 'readme')).then(o => editor2 = o);
          })
        );
        return runs(function() {
          expect(editor1.getLongTitle()).toBe("readme \u2014 sample-theme-1");
          return expect(editor2.getLongTitle()).toBe("readme \u2014 sample-theme-2");
        });
      });

      it("returns '<filename> — <parent-directories>' when opened files have identical file names in subdirectories", function() {
        let editor1 = null;
        let editor2 = null;
        const path1 = path.join('sample-theme-1', 'src', 'js');
        const path2 = path.join('sample-theme-2', 'src', 'js');
        waitsForPromise(() =>
          atom.workspace.open(path.join(path1, 'main.js')).then(function(o) {
            editor1 = o;
            return atom.workspace.open(path.join(path2, 'main.js')).then(o => editor2 = o);
          })
        );
        return runs(function() {
          expect(editor1.getLongTitle()).toBe(`main.js \u2014 ${path1}`);
          return expect(editor2.getLongTitle()).toBe(`main.js \u2014 ${path2}`);
        });
      });

      return it("returns '<filename> — <parent-directories>' when opened files have identical file and same parent dir name", function() {
        let editor1 = null;
        let editor2 = null;
        waitsForPromise(() =>
          atom.workspace.open(path.join('sample-theme-2', 'src', 'js', 'main.js')).then(function(o) {
            editor1 = o;
            return atom.workspace.open(path.join('sample-theme-2', 'src', 'js', 'plugin', 'main.js')).then(o => editor2 = o);
          })
        );
        return runs(function() {
          expect(editor1.getLongTitle()).toBe("main.js \u2014 js");
          return expect(editor2.getLongTitle()).toBe(`main.js \u2014 ${path.join('js', 'plugin')}`);
        });
      });
    });

    return it("notifies ::onDidChangeTitle observers when the underlying buffer path changes", function() {
      const observed = [];
      editor.onDidChangeTitle(title => observed.push(title));

      buffer.setPath('/foo/bar/baz.txt');
      buffer.setPath(undefined);

      return expect(observed).toEqual(['baz.txt', 'untitled']);
  });
});

  describe("path", () =>
    it("notifies ::onDidChangePath observers when the underlying buffer path changes", function() {
      const observed = [];
      editor.onDidChangePath(filePath => observed.push(filePath));

      buffer.setPath(__filename);
      buffer.setPath(undefined);

      return expect(observed).toEqual([__filename, undefined]);
  })
);

  describe("encoding", () =>
    it("notifies ::onDidChangeEncoding observers when the editor encoding changes", function() {
      const observed = [];
      editor.onDidChangeEncoding(encoding => observed.push(encoding));

      editor.setEncoding('utf16le');
      editor.setEncoding('utf16le');
      editor.setEncoding('utf16be');
      editor.setEncoding();
      editor.setEncoding();

      return expect(observed).toEqual(['utf16le', 'utf16be', 'utf8']);
  })
);

  describe("cursor", function() {
    describe(".getLastCursor()", function() {
      it("returns the most recently created cursor", function() {
        editor.addCursorAtScreenPosition([1, 0]);
        const lastCursor = editor.addCursorAtScreenPosition([2, 0]);
        return expect(editor.getLastCursor()).toBe(lastCursor);
      });

      return it("creates a new cursor at (0, 0) if the last cursor has been destroyed", function() {
        editor.getLastCursor().destroy();
        return expect(editor.getLastCursor().getBufferPosition()).toEqual([0, 0]);
      });
    });

    describe(".getCursors()", () =>
      it("creates a new cursor at (0, 0) if the last cursor has been destroyed", function() {
        editor.getLastCursor().destroy();
        return expect(editor.getCursors()[0].getBufferPosition()).toEqual([0, 0]);
      })
    );

    describe("when the cursor moves", function() {
      it("clears a goal column established by vertical movement", function() {
        editor.setText('b');
        editor.setCursorBufferPosition([0, 0]);
        editor.insertNewline();
        editor.moveUp();
        editor.insertText('a');
        editor.moveDown();
        return expect(editor.getCursorBufferPosition()).toEqual([1, 1]);
    });

      return it("emits an event with the old position, new position, and the cursor that moved", function() {
        const cursorCallback = jasmine.createSpy('cursor-changed-position');
        const editorCallback = jasmine.createSpy('editor-changed-cursor-position');

        editor.getLastCursor().onDidChangePosition(cursorCallback);
        editor.onDidChangeCursorPosition(editorCallback);

        editor.setCursorBufferPosition([2, 4]);

        expect(editorCallback).toHaveBeenCalled();
        expect(cursorCallback).toHaveBeenCalled();
        const eventObject = editorCallback.mostRecentCall.args[0];
        expect(cursorCallback.mostRecentCall.args[0]).toEqual(eventObject);

        expect(eventObject.oldBufferPosition).toEqual([0, 0]);
        expect(eventObject.oldScreenPosition).toEqual([0, 0]);
        expect(eventObject.newBufferPosition).toEqual([2, 4]);
        expect(eventObject.newScreenPosition).toEqual([2, 4]);
        return expect(eventObject.cursor).toBe(editor.getLastCursor());
      });
    });

    describe(".setCursorScreenPosition(screenPosition)", function() {
      it("clears a goal column established by vertical movement", function() {
        // set a goal column by moving down
        editor.setCursorScreenPosition({row: 3, column: lineLengths[3]});
        editor.moveDown();
        expect(editor.getCursorScreenPosition().column).not.toBe(6);

        // clear the goal column by explicitly setting the cursor position
        editor.setCursorScreenPosition([4, 6]);
        expect(editor.getCursorScreenPosition().column).toBe(6);

        editor.moveDown();
        return expect(editor.getCursorScreenPosition().column).toBe(6);
      });

      it("merges multiple cursors", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.addCursorAtScreenPosition([0, 1]);
        const [cursor1, cursor2] = Array.from(editor.getCursors());
        editor.setCursorScreenPosition([4, 7]);
        expect(editor.getCursors().length).toBe(1);
        expect(editor.getCursors()).toEqual([cursor1]);
        return expect(editor.getCursorScreenPosition()).toEqual([4, 7]);
    });

      return describe("when soft-wrap is enabled and code is folded", function() {
        beforeEach(function() {
          editor.setSoftWrapped(true);
          editor.setDefaultCharWidth(1);
          editor.setEditorWidthInChars(50);
          return editor.foldBufferRowRange(2, 3);
        });

        return it("positions the cursor at the buffer position that corresponds to the given screen position", function() {
          editor.setCursorScreenPosition([9, 0]);
          return expect(editor.getCursorBufferPosition()).toEqual([8, 11]);
      });
    });
  });

    describe(".moveUp()", function() {
      it("moves the cursor up", function() {
        editor.setCursorScreenPosition([2, 2]);
        editor.moveUp();
        return expect(editor.getCursorScreenPosition()).toEqual([1, 2]);
    });

      it("retains the goal column across lines of differing length", function() {
        expect(lineLengths[6]).toBeGreaterThan(32);
        editor.setCursorScreenPosition({row: 6, column: 32});

        editor.moveUp();
        expect(editor.getCursorScreenPosition().column).toBe(lineLengths[5]);

        editor.moveUp();
        expect(editor.getCursorScreenPosition().column).toBe(lineLengths[4]);

        editor.moveUp();
        return expect(editor.getCursorScreenPosition().column).toBe(32);
      });

      describe("when the cursor is on the first line", () =>
        it("moves the cursor to the beginning of the line, but retains the goal column", function() {
          editor.setCursorScreenPosition([0, 4]);
          editor.moveUp();
          expect(editor.getCursorScreenPosition()).toEqual([0, 0]);

          editor.moveDown();
          return expect(editor.getCursorScreenPosition()).toEqual([1, 4]);
        })
      );

      describe("when there is a selection", function() {
        beforeEach(() => editor.setSelectedBufferRange([[4, 9], [5, 10]]));

        return it("moves above the selection", function() {
          const cursor = editor.getLastCursor();
          editor.moveUp();
          return expect(cursor.getBufferPosition()).toEqual([3, 9]);
      });
    });

      it("merges cursors when they overlap", function() {
        editor.addCursorAtScreenPosition([1, 0]);
        const [cursor1, cursor2] = Array.from(editor.getCursors());

        editor.moveUp();
        expect(editor.getCursors()).toEqual([cursor1]);
        return expect(cursor1.getBufferPosition()).toEqual([0, 0]);
    });

      return describe("when the cursor was moved down from the beginning of an indented soft-wrapped line", () =>
        it("moves to the beginning of the previous line", function() {
          editor.setSoftWrapped(true);
          editor.setDefaultCharWidth(1);
          editor.setEditorWidthInChars(50);

          editor.setCursorScreenPosition([3, 0]);
          editor.moveDown();
          editor.moveDown();
          editor.moveUp();
          return expect(editor.getCursorScreenPosition()).toEqual([4, 4]);
      })
    );
  });

    describe(".moveDown()", function() {
      it("moves the cursor down", function() {
        editor.setCursorScreenPosition([2, 2]);
        editor.moveDown();
        return expect(editor.getCursorScreenPosition()).toEqual([3, 2]);
    });

      it("retains the goal column across lines of differing length", function() {
        editor.setCursorScreenPosition({row: 3, column: lineLengths[3]});

        editor.moveDown();
        expect(editor.getCursorScreenPosition().column).toBe(lineLengths[4]);

        editor.moveDown();
        expect(editor.getCursorScreenPosition().column).toBe(lineLengths[5]);

        editor.moveDown();
        return expect(editor.getCursorScreenPosition().column).toBe(lineLengths[3]);
    });

      describe("when the cursor is on the last line", function() {
        it("moves the cursor to the end of line, but retains the goal column when moving back up", function() {
          const lastLineIndex = buffer.getLines().length - 1;
          const lastLine = buffer.lineForRow(lastLineIndex);
          expect(lastLine.length).toBeGreaterThan(0);

          editor.setCursorScreenPosition({row: lastLineIndex, column: editor.getTabLength()});
          editor.moveDown();
          expect(editor.getCursorScreenPosition()).toEqual({row: lastLineIndex, column: lastLine.length});

          editor.moveUp();
          return expect(editor.getCursorScreenPosition().column).toBe(editor.getTabLength());
        });

        return it("retains a goal column of 0 when moving back up", function() {
          const lastLineIndex = buffer.getLines().length - 1;
          const lastLine = buffer.lineForRow(lastLineIndex);
          expect(lastLine.length).toBeGreaterThan(0);

          editor.setCursorScreenPosition({row: lastLineIndex, column: 0});
          editor.moveDown();
          editor.moveUp();
          return expect(editor.getCursorScreenPosition().column).toBe(0);
        });
      });

      describe("when the cursor is at the beginning of an indented soft-wrapped line", () =>
        it("moves to the beginning of the line's continuation on the next screen row", function() {
          editor.setSoftWrapped(true);
          editor.setDefaultCharWidth(1);
          editor.setEditorWidthInChars(50);

          editor.setCursorScreenPosition([3, 0]);
          editor.moveDown();
          return expect(editor.getCursorScreenPosition()).toEqual([4, 4]);
      })
    );


      describe("when there is a selection", function() {
        beforeEach(() => editor.setSelectedBufferRange([[4, 9], [5, 10]]));

        return it("moves below the selection", function() {
          const cursor = editor.getLastCursor();
          editor.moveDown();
          return expect(cursor.getBufferPosition()).toEqual([6, 10]);
      });
    });

      return it("merges cursors when they overlap", function() {
        editor.setCursorScreenPosition([12, 2]);
        editor.addCursorAtScreenPosition([11, 2]);
        const [cursor1, cursor2] = Array.from(editor.getCursors());

        editor.moveDown();
        expect(editor.getCursors()).toEqual([cursor1]);
        return expect(cursor1.getBufferPosition()).toEqual([12, 2]);
    });
  });

    describe(".moveLeft()", function() {
      it("moves the cursor by one column to the left", function() {
        editor.setCursorScreenPosition([1, 8]);
        editor.moveLeft();
        return expect(editor.getCursorScreenPosition()).toEqual([1, 7]);
    });

      it("moves the cursor by n columns to the left", function() {
        editor.setCursorScreenPosition([1, 8]);
        editor.moveLeft(4);
        return expect(editor.getCursorScreenPosition()).toEqual([1, 4]);
    });

      it("moves the cursor by two rows up when the columnCount is longer than an entire line", function() {
        editor.setCursorScreenPosition([2, 2]);
        editor.moveLeft(34);
        return expect(editor.getCursorScreenPosition()).toEqual([0, 29]);
    });

      it("moves the cursor to the beginning columnCount is longer than the position in the buffer", function() {
        editor.setCursorScreenPosition([1, 0]);
        editor.moveLeft(100);
        return expect(editor.getCursorScreenPosition()).toEqual([0, 0]);
    });

      describe("when the cursor is in the first column", function() {
        describe("when there is a previous line", function() {
          it("wraps to the end of the previous line", function() {
            editor.setCursorScreenPosition({row: 1, column: 0});
            editor.moveLeft();
            return expect(editor.getCursorScreenPosition()).toEqual({row: 0, column: buffer.lineForRow(0).length});
          });

          return it("moves the cursor by one row up and n columns to the left", function() {
            editor.setCursorScreenPosition([1, 0]);
            editor.moveLeft(4);
            return expect(editor.getCursorScreenPosition()).toEqual([0, 26]);
        });
      });

        describe("when the next line is empty", () =>
          it("wraps to the beginning of the previous line", function() {
            editor.setCursorScreenPosition([11, 0]);
            editor.moveLeft();
            return expect(editor.getCursorScreenPosition()).toEqual([10, 0]);
        })
      );

        describe("when line is wrapped and follow previous line indentation", function() {
          beforeEach(function() {
            editor.setSoftWrapped(true);
            editor.setDefaultCharWidth(1);
            return editor.setEditorWidthInChars(50);
          });

          return it("wraps to the end of the previous line", function() {
            editor.setCursorScreenPosition([4, 4]);
            editor.moveLeft();
            return expect(editor.getCursorScreenPosition()).toEqual([3, 46]);
        });
      });

        return describe("when the cursor is on the first line", function() {
          it("remains in the same position (0,0)", function() {
            editor.setCursorScreenPosition({row: 0, column: 0});
            editor.moveLeft();
            return expect(editor.getCursorScreenPosition()).toEqual({row: 0, column: 0});
          });

          return it("remains in the same position (0,0) when columnCount is specified", function() {
            editor.setCursorScreenPosition([0, 0]);
            editor.moveLeft(4);
            return expect(editor.getCursorScreenPosition()).toEqual([0, 0]);
        });
      });
    });

      describe("when softTabs is enabled and the cursor is preceded by leading whitespace", () =>
        it("skips tabLength worth of whitespace at a time", function() {
          editor.setCursorBufferPosition([5, 6]);

          editor.moveLeft();
          return expect(editor.getCursorBufferPosition()).toEqual([5, 4]);
      })
    );

      describe("when there is a selection", function() {
        beforeEach(() => editor.setSelectedBufferRange([[5, 22], [5, 27]]));

        return it("moves to the left of the selection", function() {
          const cursor = editor.getLastCursor();
          editor.moveLeft();
          expect(cursor.getBufferPosition()).toEqual([5, 22]);

          editor.moveLeft();
          return expect(cursor.getBufferPosition()).toEqual([5, 21]);
      });
    });

      return it("merges cursors when they overlap", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.addCursorAtScreenPosition([0, 1]);

        const [cursor1, cursor2] = Array.from(editor.getCursors());
        editor.moveLeft();
        expect(editor.getCursors()).toEqual([cursor1]);
        return expect(cursor1.getBufferPosition()).toEqual([0, 0]);
    });
  });

    describe(".moveRight()", function() {
      it("moves the cursor by one column to the right", function() {
        editor.setCursorScreenPosition([3, 3]);
        editor.moveRight();
        return expect(editor.getCursorScreenPosition()).toEqual([3, 4]);
    });

      it("moves the cursor by n columns to the right", function() {
        editor.setCursorScreenPosition([3, 7]);
        editor.moveRight(4);
        return expect(editor.getCursorScreenPosition()).toEqual([3, 11]);
    });

      it("moves the cursor by two rows down when the columnCount is longer than an entire line", function() {
        editor.setCursorScreenPosition([0, 29]);
        editor.moveRight(34);
        return expect(editor.getCursorScreenPosition()).toEqual([2, 2]);
    });

      it("moves the cursor to the end of the buffer when columnCount is longer than the number of characters following the cursor position", function() {
        editor.setCursorScreenPosition([11, 5]);
        editor.moveRight(100);
        return expect(editor.getCursorScreenPosition()).toEqual([12, 2]);
    });

      describe("when the cursor is on the last column of a line", function() {
        describe("when there is a subsequent line", function() {
          it("wraps to the beginning of the next line", function() {
            editor.setCursorScreenPosition([0, buffer.lineForRow(0).length]);
            editor.moveRight();
            return expect(editor.getCursorScreenPosition()).toEqual([1, 0]);
        });

          return it("moves the cursor by one row down and n columns to the right", function() {
            editor.setCursorScreenPosition([0, buffer.lineForRow(0).length]);
            editor.moveRight(4);
            return expect(editor.getCursorScreenPosition()).toEqual([1, 3]);
        });
      });

        describe("when the next line is empty", () =>
          it("wraps to the beginning of the next line", function() {
            editor.setCursorScreenPosition([9, 4]);
            editor.moveRight();
            return expect(editor.getCursorScreenPosition()).toEqual([10, 0]);
        })
      );

        return describe("when the cursor is on the last line", () =>
          it("remains in the same position", function() {
            const lastLineIndex = buffer.getLines().length - 1;
            const lastLine = buffer.lineForRow(lastLineIndex);
            expect(lastLine.length).toBeGreaterThan(0);

            const lastPosition = {row: lastLineIndex, column: lastLine.length};
            editor.setCursorScreenPosition(lastPosition);
            editor.moveRight();

            return expect(editor.getCursorScreenPosition()).toEqual(lastPosition);
          })
        );
      });

      describe("when there is a selection", function() {
        beforeEach(() => editor.setSelectedBufferRange([[5, 22], [5, 27]]));

        return it("moves to the left of the selection", function() {
          const cursor = editor.getLastCursor();
          editor.moveRight();
          expect(cursor.getBufferPosition()).toEqual([5, 27]);

          editor.moveRight();
          return expect(cursor.getBufferPosition()).toEqual([5, 28]);
      });
    });

      return it("merges cursors when they overlap", function() {
        editor.setCursorScreenPosition([12, 2]);
        editor.addCursorAtScreenPosition([12, 1]);
        const [cursor1, cursor2] = Array.from(editor.getCursors());

        editor.moveRight();
        expect(editor.getCursors()).toEqual([cursor1]);
        return expect(cursor1.getBufferPosition()).toEqual([12, 2]);
    });
  });

    describe(".moveToTop()", () =>
      it("moves the cursor to the top of the buffer", function() {
        editor.setCursorScreenPosition([11, 1]);
        editor.addCursorAtScreenPosition([12, 0]);
        editor.moveToTop();
        expect(editor.getCursors().length).toBe(1);
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
    })
  );

    describe(".moveToBottom()", () =>
      it("moves the cusor to the bottom of the buffer", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.addCursorAtScreenPosition([1, 0]);
        editor.moveToBottom();
        expect(editor.getCursors().length).toBe(1);
        return expect(editor.getCursorBufferPosition()).toEqual([12, 2]);
    })
  );

    describe(".moveToBeginningOfScreenLine()", function() {
      describe("when soft wrap is on", () =>
        it("moves cursor to the beginning of the screen line", function() {
          editor.setSoftWrapped(true);
          editor.setEditorWidthInChars(10);
          editor.setCursorScreenPosition([1, 2]);
          editor.moveToBeginningOfScreenLine();
          const cursor = editor.getLastCursor();
          return expect(cursor.getScreenPosition()).toEqual([1, 0]);
      })
    );

      return describe("when soft wrap is off", () =>
        it("moves cursor to the beginning of the line", function() {
          editor.setCursorScreenPosition([0, 5]);
          editor.addCursorAtScreenPosition([1, 7]);
          editor.moveToBeginningOfScreenLine();
          expect(editor.getCursors().length).toBe(2);
          const [cursor1, cursor2] = Array.from(editor.getCursors());
          expect(cursor1.getBufferPosition()).toEqual([0, 0]);
          return expect(cursor2.getBufferPosition()).toEqual([1, 0]);
      })
    );
  });

    describe(".moveToEndOfScreenLine()", function() {
      describe("when soft wrap is on", () =>
        it("moves cursor to the beginning of the screen line", function() {
          editor.setSoftWrapped(true);
          editor.setDefaultCharWidth(1);
          editor.setEditorWidthInChars(10);
          editor.setCursorScreenPosition([1, 2]);
          editor.moveToEndOfScreenLine();
          const cursor = editor.getLastCursor();
          return expect(cursor.getScreenPosition()).toEqual([1, 9]);
      })
    );

      return describe("when soft wrap is off", () =>
        it("moves cursor to the end of line", function() {
          editor.setCursorScreenPosition([0, 0]);
          editor.addCursorAtScreenPosition([1, 0]);
          editor.moveToEndOfScreenLine();
          expect(editor.getCursors().length).toBe(2);
          const [cursor1, cursor2] = Array.from(editor.getCursors());
          expect(cursor1.getBufferPosition()).toEqual([0, 29]);
          return expect(cursor2.getBufferPosition()).toEqual([1, 30]);
      })
    );
  });

    describe(".moveToBeginningOfLine()", () =>
      it("moves cursor to the beginning of the buffer line", function() {
        editor.setSoftWrapped(true);
        editor.setDefaultCharWidth(1);
        editor.setEditorWidthInChars(10);
        editor.setCursorScreenPosition([1, 2]);
        editor.moveToBeginningOfLine();
        const cursor = editor.getLastCursor();
        return expect(cursor.getScreenPosition()).toEqual([0, 0]);
    })
  );

    describe(".moveToEndOfLine()", () =>
      it("moves cursor to the end of the buffer line", function() {
        editor.setSoftWrapped(true);
        editor.setDefaultCharWidth(1);
        editor.setEditorWidthInChars(10);
        editor.setCursorScreenPosition([0, 2]);
        editor.moveToEndOfLine();
        const cursor = editor.getLastCursor();
        return expect(cursor.getScreenPosition()).toEqual([4, 4]);
    })
  );

    describe(".moveToFirstCharacterOfLine()", function() {
      describe("when soft wrap is on", () =>
        it("moves to the first character of the current screen line or the beginning of the screen line if it's already on the first character", function() {
          editor.setSoftWrapped(true);
          editor.setDefaultCharWidth(1);
          editor.setEditorWidthInChars(10);
          editor.setCursorScreenPosition([2, 5]);
          editor.addCursorAtScreenPosition([8, 7]);

          editor.moveToFirstCharacterOfLine();
          const [cursor1, cursor2] = Array.from(editor.getCursors());
          expect(cursor1.getScreenPosition()).toEqual([2, 0]);
          expect(cursor2.getScreenPosition()).toEqual([8, 2]);

          editor.moveToFirstCharacterOfLine();
          expect(cursor1.getScreenPosition()).toEqual([2, 0]);
          return expect(cursor2.getScreenPosition()).toEqual([8, 2]);
      })
    );

      return describe("when soft wrap is off", function() {
        it("moves to the first character of the current line or the beginning of the line if it's already on the first character", function() {
          editor.setCursorScreenPosition([0, 5]);
          editor.addCursorAtScreenPosition([1, 7]);

          editor.moveToFirstCharacterOfLine();
          const [cursor1, cursor2] = Array.from(editor.getCursors());
          expect(cursor1.getBufferPosition()).toEqual([0, 0]);
          expect(cursor2.getBufferPosition()).toEqual([1, 2]);

          editor.moveToFirstCharacterOfLine();
          expect(cursor1.getBufferPosition()).toEqual([0, 0]);
          return expect(cursor2.getBufferPosition()).toEqual([1, 0]);
      });

        it("moves to the beginning of the line if it only contains whitespace ", function() {
          editor.setText("first\n    \nthird");
          editor.setCursorScreenPosition([1, 2]);
          editor.moveToFirstCharacterOfLine();
          const cursor = editor.getLastCursor();
          return expect(cursor.getBufferPosition()).toEqual([1, 0]);
      });

        describe("when invisible characters are enabled with soft tabs", () =>
          it("moves to the first character of the current line without being confused by the invisible characters", function() {
            editor.update({showInvisibles: true});
            editor.setCursorScreenPosition([1, 7]);
            editor.moveToFirstCharacterOfLine();
            expect(editor.getCursorBufferPosition()).toEqual([1, 2]);
            editor.moveToFirstCharacterOfLine();
            return expect(editor.getCursorBufferPosition()).toEqual([1, 0]);
        })
      );

        return describe("when invisible characters are enabled with hard tabs", () =>
          it("moves to the first character of the current line without being confused by the invisible characters", function() {
            editor.update({showInvisibles: true});
            buffer.setTextInRange([[1, 0], [1, Infinity]], '\t\t\ta', {normalizeLineEndings: false});

            editor.setCursorScreenPosition([1, 7]);
            editor.moveToFirstCharacterOfLine();
            expect(editor.getCursorBufferPosition()).toEqual([1, 3]);
            editor.moveToFirstCharacterOfLine();
            return expect(editor.getCursorBufferPosition()).toEqual([1, 0]);
        })
      );
    });
  });

    describe(".moveToBeginningOfWord()", function() {
      it("moves the cursor to the beginning of the word", function() {
        editor.setCursorBufferPosition([0, 8]);
        editor.addCursorAtBufferPosition([1, 12]);
        editor.addCursorAtBufferPosition([3, 0]);
        const [cursor1, cursor2, cursor3] = Array.from(editor.getCursors());

        editor.moveToBeginningOfWord();

        expect(cursor1.getBufferPosition()).toEqual([0, 4]);
        expect(cursor2.getBufferPosition()).toEqual([1, 11]);
        return expect(cursor3.getBufferPosition()).toEqual([2, 39]);
    });

      it("does not fail at position [0, 0]", function() {
        editor.setCursorBufferPosition([0, 0]);
        return editor.moveToBeginningOfWord();
      });

      it("treats lines with only whitespace as a word", function() {
        editor.setCursorBufferPosition([11, 0]);
        editor.moveToBeginningOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([10, 0]);
    });

      it("treats lines with only whitespace as a word (CRLF line ending)", function() {
        editor.buffer.setText(buffer.getText().replace(/\n/g, "\r\n"));
        editor.setCursorBufferPosition([11, 0]);
        editor.moveToBeginningOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([10, 0]);
    });

      it("works when the current line is blank", function() {
        editor.setCursorBufferPosition([10, 0]);
        editor.moveToBeginningOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([9, 2]);
    });

      return it("works when the current line is blank (CRLF line ending)", function() {
        editor.buffer.setText(buffer.getText().replace(/\n/g, "\r\n"));
        editor.setCursorBufferPosition([10, 0]);
        editor.moveToBeginningOfWord();
        expect(editor.getCursorBufferPosition()).toEqual([9, 2]);
        return editor.buffer.setText(buffer.getText().replace(/\r\n/g, "\n"));
      });
    });

    describe(".moveToPreviousWordBoundary()", () =>
      it("moves the cursor to the previous word boundary", function() {
        editor.setCursorBufferPosition([0, 8]);
        editor.addCursorAtBufferPosition([2, 0]);
        editor.addCursorAtBufferPosition([2, 4]);
        editor.addCursorAtBufferPosition([3, 14]);
        const [cursor1, cursor2, cursor3, cursor4] = Array.from(editor.getCursors());

        editor.moveToPreviousWordBoundary();

        expect(cursor1.getBufferPosition()).toEqual([0, 4]);
        expect(cursor2.getBufferPosition()).toEqual([1, 30]);
        expect(cursor3.getBufferPosition()).toEqual([2, 0]);
        return expect(cursor4.getBufferPosition()).toEqual([3, 13]);
    })
  );

    describe(".moveToNextWordBoundary()", () =>
      it("moves the cursor to the previous word boundary", function() {
        editor.setCursorBufferPosition([0, 8]);
        editor.addCursorAtBufferPosition([2, 40]);
        editor.addCursorAtBufferPosition([3, 0]);
        editor.addCursorAtBufferPosition([3, 30]);
        const [cursor1, cursor2, cursor3, cursor4] = Array.from(editor.getCursors());

        editor.moveToNextWordBoundary();

        expect(cursor1.getBufferPosition()).toEqual([0, 13]);
        expect(cursor2.getBufferPosition()).toEqual([3, 0]);
        expect(cursor3.getBufferPosition()).toEqual([3, 4]);
        return expect(cursor4.getBufferPosition()).toEqual([3, 31]);
    })
  );

    describe(".moveToEndOfWord()", function() {
      it("moves the cursor to the end of the word", function() {
        editor.setCursorBufferPosition([0, 6]);
        editor.addCursorAtBufferPosition([1, 10]);
        editor.addCursorAtBufferPosition([2, 40]);
        const [cursor1, cursor2, cursor3] = Array.from(editor.getCursors());

        editor.moveToEndOfWord();

        expect(cursor1.getBufferPosition()).toEqual([0, 13]);
        expect(cursor2.getBufferPosition()).toEqual([1, 12]);
        return expect(cursor3.getBufferPosition()).toEqual([3, 7]);
    });

      it("does not blow up when there is no next word", function() {
        editor.setCursorBufferPosition([Infinity, Infinity]);
        const endPosition = editor.getCursorBufferPosition();
        editor.moveToEndOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual(endPosition);
      });

      it("treats lines with only whitespace as a word", function() {
        editor.setCursorBufferPosition([9, 4]);
        editor.moveToEndOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([10, 0]);
    });

      it("treats lines with only whitespace as a word (CRLF line ending)", function() {
        editor.buffer.setText(buffer.getText().replace(/\n/g, "\r\n"));
        editor.setCursorBufferPosition([9, 4]);
        editor.moveToEndOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([10, 0]);
    });

      it("works when the current line is blank", function() {
        editor.setCursorBufferPosition([10, 0]);
        editor.moveToEndOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([11, 8]);
    });

      return it("works when the current line is blank (CRLF line ending)", function() {
        editor.buffer.setText(buffer.getText().replace(/\n/g, "\r\n"));
        editor.setCursorBufferPosition([10, 0]);
        editor.moveToEndOfWord();
        return expect(editor.getCursorBufferPosition()).toEqual([11, 8]);
    });
  });

    describe(".moveToBeginningOfNextWord()", function() {
      it("moves the cursor before the first character of the next word", function() {
        editor.setCursorBufferPosition([0, 6]);
        editor.addCursorAtBufferPosition([1, 11]);
        editor.addCursorAtBufferPosition([2, 0]);
        const [cursor1, cursor2, cursor3] = Array.from(editor.getCursors());

        editor.moveToBeginningOfNextWord();

        expect(cursor1.getBufferPosition()).toEqual([0, 14]);
        expect(cursor2.getBufferPosition()).toEqual([1, 13]);
        expect(cursor3.getBufferPosition()).toEqual([2, 4]);

        // When the cursor is on whitespace
        editor.setText("ab cde- ");
        editor.setCursorBufferPosition([0, 2]);
        const cursor = editor.getLastCursor();
        editor.moveToBeginningOfNextWord();

        return expect(cursor.getBufferPosition()).toEqual([0, 3]);
    });

      it("does not blow up when there is no next word", function() {
        editor.setCursorBufferPosition([Infinity, Infinity]);
        const endPosition = editor.getCursorBufferPosition();
        editor.moveToBeginningOfNextWord();
        return expect(editor.getCursorBufferPosition()).toEqual(endPosition);
      });

      it("treats lines with only whitespace as a word", function() {
        editor.setCursorBufferPosition([9, 4]);
        editor.moveToBeginningOfNextWord();
        return expect(editor.getCursorBufferPosition()).toEqual([10, 0]);
    });

      return it("works when the current line is blank", function() {
        editor.setCursorBufferPosition([10, 0]);
        editor.moveToBeginningOfNextWord();
        return expect(editor.getCursorBufferPosition()).toEqual([11, 9]);
    });
  });

    describe(".moveToPreviousSubwordBoundary", function() {
      it("does not move the cursor when there is no previous subword boundary", function() {
        editor.setText('');
        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
      });

      it("stops at word and underscore boundaries", function() {
        editor.setText("sub_word \n");
        editor.setCursorBufferPosition([0, 9]);
        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 8]);

        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 4]);

        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 0]);

        editor.setText(" word\n");
        editor.setCursorBufferPosition([0, 3]);
        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 1]);
      });

      it("stops at camelCase boundaries", function() {
        editor.setText(" getPreviousWord\n");
        editor.setCursorBufferPosition([0, 16]);

        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 12]);

        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 4]);

        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 1]);
      });

      it("skips consecutive non-word characters", function() {
        editor.setText("e, => \n");
        editor.setCursorBufferPosition([0, 6]);
        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 3]);

        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 1]);
      });

      it("skips consecutive uppercase characters", function() {
        editor.setText(" AAADF \n");
        editor.setCursorBufferPosition([0, 7]);
        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 6]);

        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 1]);

        editor.setText("ALPhA\n");
        editor.setCursorBufferPosition([0, 4]);
        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      });

      it("skips consecutive numbers", function() {
        editor.setText(" 88 \n");
        editor.setCursorBufferPosition([0, 4]);
        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 3]);

        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 1]);
      });

      it("works with multiple cursors", function() {
        editor.setText("curOp\ncursorOptions\n");
        editor.setCursorBufferPosition([0, 8]);
        editor.addCursorAtBufferPosition([1, 13]);
        const [cursor1, cursor2] = Array.from(editor.getCursors());

        editor.moveToPreviousSubwordBoundary();

        expect(cursor1.getBufferPosition()).toEqual([0, 3]);
        return expect(cursor2.getBufferPosition()).toEqual([1, 6]);
      });

      return it("works with non-English characters", function() {
        editor.setText("supåTøåst \n");
        editor.setCursorBufferPosition([0, 9]);
        editor.moveToPreviousSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 4]);

        editor.setText("supaÖast \n");
        editor.setCursorBufferPosition([0, 8]);
        editor.moveToPreviousSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      });
    });

    describe(".moveToNextSubwordBoundary", function() {
      it("does not move the cursor when there is no next subword boundary", function() {
        editor.setText('');
        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
      });

      it("stops at word and underscore boundaries", function() {
        editor.setText(" sub_word \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 1]);

        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 4]);

        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 9]);

        editor.setText("word \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      });

      it("stops at camelCase boundaries", function() {
        editor.setText("getPreviousWord \n");
        editor.setCursorBufferPosition([0, 0]);

        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 3]);

        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 11]);

        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 15]);
      });

      it("skips consecutive non-word characters", function() {
        editor.setText(", => \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 1]);

        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      });

      it("skips consecutive uppercase characters", function() {
        editor.setText(" AAADF \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 1]);

        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 6]);

        editor.setText("ALPhA\n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      });

      it("skips consecutive numbers", function() {
        editor.setText(" 88 \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 1]);

        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 3]);
      });

      it("works with multiple cursors", function() {
        editor.setText("curOp\ncursorOptions\n");
        editor.setCursorBufferPosition([0, 0]);
        editor.addCursorAtBufferPosition([1, 0]);
        const [cursor1, cursor2] = Array.from(editor.getCursors());

        editor.moveToNextSubwordBoundary();
        expect(cursor1.getBufferPosition()).toEqual([0, 3]);
        return expect(cursor2.getBufferPosition()).toEqual([1, 6]);
      });

      return it("works with non-English characters", function() {
        editor.setText("supåTøåst \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        expect(editor.getCursorBufferPosition()).toEqual([0, 4]);

        editor.setText("supaÖast \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToNextSubwordBoundary();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      });
    });

    describe(".moveToBeginningOfNextParagraph()", function() {
      it("moves the cursor before the first line of the next paragraph", function() {
        editor.setCursorBufferPosition([0, 6]);
        editor.foldBufferRow(4);

        editor.moveToBeginningOfNextParagraph();
        expect(editor.getCursorBufferPosition()).toEqual([10, 0]);

        editor.setText("");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToBeginningOfNextParagraph();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
    });

      return it("moves the cursor before the first line of the next paragraph (CRLF line endings)", function() {
        editor.setText(editor.getText().replace(/\n/g, '\r\n'));

        editor.setCursorBufferPosition([0, 6]);
        editor.foldBufferRow(4);

        editor.moveToBeginningOfNextParagraph();
        expect(editor.getCursorBufferPosition()).toEqual([10, 0]);

        editor.setText("");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToBeginningOfNextParagraph();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
    });
  });

    describe(".moveToBeginningOfPreviousParagraph()", function() {
      it("moves the cursor before the first line of the previous paragraph", function() {
        editor.setCursorBufferPosition([10, 0]);
        editor.foldBufferRow(4);

        editor.moveToBeginningOfPreviousParagraph();
        expect(editor.getCursorBufferPosition()).toEqual([0, 0]);

        editor.setText("");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToBeginningOfPreviousParagraph();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
    });

      return it("moves the cursor before the first line of the previous paragraph (CRLF line endings)", function() {
        editor.setText(editor.getText().replace(/\n/g, '\r\n'));

        editor.setCursorBufferPosition([10, 0]);
        editor.foldBufferRow(4);

        editor.moveToBeginningOfPreviousParagraph();
        expect(editor.getCursorBufferPosition()).toEqual([0, 0]);

        editor.setText("");
        editor.setCursorBufferPosition([0, 0]);
        editor.moveToBeginningOfPreviousParagraph();
        return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
    });
  });

    describe(".getCurrentParagraphBufferRange()", () =>
      it("returns the buffer range of the current paragraph, delimited by blank lines or the beginning / end of the file", function() {
        buffer.setText(`\
  I am the first paragraph,
bordered by the beginning of
the file
${'   '}

  I am the second paragraph
with blank lines above and below
me.

I am the last paragraph,
bordered by the end of the file.\
`
        );

        // in a paragraph
        editor.setCursorBufferPosition([1, 7]);
        expect(editor.getCurrentParagraphBufferRange()).toEqual([[0, 0], [2, 8]]);

        editor.setCursorBufferPosition([7, 1]);
        expect(editor.getCurrentParagraphBufferRange()).toEqual([[5, 0], [7, 3]]);

        editor.setCursorBufferPosition([9, 10]);
        expect(editor.getCurrentParagraphBufferRange()).toEqual([[9, 0], [10, 32]]);

        // between paragraphs
        editor.setCursorBufferPosition([3, 1]);
        return expect(editor.getCurrentParagraphBufferRange()).toBeUndefined();
      })
    );

    describe("getCursorAtScreenPosition(screenPosition)", () =>
      it("returns the cursor at the given screenPosition", function() {
        const cursor1 = editor.addCursorAtScreenPosition([0, 2]);
        const cursor2 = editor.getCursorAtScreenPosition(cursor1.getScreenPosition());
        return expect(cursor2).toBe(cursor1);
      })
    );

    describe("::getCursorScreenPositions()", () =>
      it("returns the cursor positions in the order they were added", function() {
        editor.foldBufferRow(4);
        const cursor1 = editor.addCursorAtBufferPosition([8, 5]);
        const cursor2 = editor.addCursorAtBufferPosition([3, 5]);
        return expect(editor.getCursorScreenPositions()).toEqual([[0, 0], [5, 5], [3, 5]]);
    })
  );

    describe("::getCursorsOrderedByBufferPosition()", () =>
      it("returns all cursors ordered by buffer positions", function() {
        const originalCursor = editor.getLastCursor();
        const cursor1 = editor.addCursorAtBufferPosition([8, 5]);
        const cursor2 = editor.addCursorAtBufferPosition([4, 5]);
        return expect(editor.getCursorsOrderedByBufferPosition()).toEqual([originalCursor, cursor2, cursor1]);
    })
  );

    describe("addCursorAtScreenPosition(screenPosition)", () =>
      describe("when a cursor already exists at the position", () =>
        it("returns the existing cursor", function() {
          const cursor1 = editor.addCursorAtScreenPosition([0, 2]);
          const cursor2 = editor.addCursorAtScreenPosition([0, 2]);
          return expect(cursor2).toBe(cursor1);
        })
      )
    );

    describe("addCursorAtBufferPosition(bufferPosition)", () =>
      describe("when a cursor already exists at the position", () =>
        it("returns the existing cursor", function() {
          const cursor1 = editor.addCursorAtBufferPosition([1, 4]);
          const cursor2 = editor.addCursorAtBufferPosition([1, 4]);
          return expect(cursor2.marker).toBe(cursor1.marker);
        })
      )
    );

    return describe('.getCursorScope()', () =>
      it('returns the current scope', function() {
        const descriptor = editor.getCursorScope();
        return expect(descriptor.scopes).toContain('source.js');
      })
    );
  });

  describe("selection", function() {
    let selection = null;

    beforeEach(() => selection = editor.getLastSelection());

    describe(".getLastSelection()", function() {
      it("creates a new selection at (0, 0) if the last selection has been destroyed", function() {
        editor.getLastSelection().destroy();
        return expect(editor.getLastSelection().getBufferRange()).toEqual([[0, 0], [0, 0]]);
      });

      return it("doesn't get stuck in a infinite loop when called from ::onDidAddCursor after the last selection has been destroyed (regression)", function() {
        let callCount = 0;
        editor.getLastSelection().destroy();
        editor.onDidAddCursor(function(cursor) {
          callCount++;
          return editor.getLastSelection();
        });
        expect(editor.getLastSelection().getBufferRange()).toEqual([[0, 0], [0, 0]]);
        return expect(callCount).toBe(1);
      });
    });

    describe(".getSelections()", () =>
      it("creates a new selection at (0, 0) if the last selection has been destroyed", function() {
        editor.getLastSelection().destroy();
        return expect(editor.getSelections()[0].getBufferRange()).toEqual([[0, 0], [0, 0]]);
      })
    );

    describe("when the selection range changes", () =>
      it("emits an event with the old range, new range, and the selection that moved", function() {
        let rangeChangedHandler;
        editor.setSelectedBufferRange([[3, 0], [4, 5]]);

        editor.onDidChangeSelectionRange(rangeChangedHandler = jasmine.createSpy());
        editor.selectToBufferPosition([6, 2]);

        expect(rangeChangedHandler).toHaveBeenCalled();
        const eventObject = rangeChangedHandler.mostRecentCall.args[0];

        expect(eventObject.oldBufferRange).toEqual([[3, 0], [4, 5]]);
        expect(eventObject.oldScreenRange).toEqual([[3, 0], [4, 5]]);
        expect(eventObject.newBufferRange).toEqual([[3, 0], [6, 2]]);
        expect(eventObject.newScreenRange).toEqual([[3, 0], [6, 2]]);
        return expect(eventObject.selection).toBe(selection);
      })
    );

    describe(".selectUp/Down/Left/Right()", function() {
      it("expands each selection to its cursor's new location", function() {
        editor.setSelectedBufferRanges([[[0, 9], [0, 13]], [[3, 16], [3, 21]]]);
        const [selection1, selection2] = Array.from(editor.getSelections());

        editor.selectRight();
        expect(selection1.getBufferRange()).toEqual([[0, 9], [0, 14]]);
        expect(selection2.getBufferRange()).toEqual([[3, 16], [3, 22]]);

        editor.selectLeft();
        editor.selectLeft();
        expect(selection1.getBufferRange()).toEqual([[0, 9], [0, 12]]);
        expect(selection2.getBufferRange()).toEqual([[3, 16], [3, 20]]);

        editor.selectDown();
        expect(selection1.getBufferRange()).toEqual([[0, 9], [1, 12]]);
        expect(selection2.getBufferRange()).toEqual([[3, 16], [4, 20]]);

        editor.selectUp();
        expect(selection1.getBufferRange()).toEqual([[0, 9], [0, 12]]);
        return expect(selection2.getBufferRange()).toEqual([[3, 16], [3, 20]]);
    });

      it("merges selections when they intersect when moving down", function() {
        editor.setSelectedBufferRanges([[[0, 9], [0, 13]], [[1, 10], [1, 20]], [[2, 15], [3, 25]]]);
        const [selection1, selection2, selection3] = Array.from(editor.getSelections());

        editor.selectDown();
        expect(editor.getSelections()).toEqual([selection1]);
        expect(selection1.getScreenRange()).toEqual([[0, 9], [4, 25]]);
        return expect(selection1.isReversed()).toBeFalsy();
      });

      it("merges selections when they intersect when moving up", function() {
        editor.setSelectedBufferRanges([[[0, 9], [0, 13]], [[1, 10], [1, 20]]], {reversed: true});
        const [selection1, selection2] = Array.from(editor.getSelections());

        editor.selectUp();
        expect(editor.getSelections().length).toBe(1);
        expect(editor.getSelections()).toEqual([selection1]);
        expect(selection1.getScreenRange()).toEqual([[0, 0], [1, 20]]);
        return expect(selection1.isReversed()).toBeTruthy();
      });

      it("merges selections when they intersect when moving left", function() {
        editor.setSelectedBufferRanges([[[0, 9], [0, 13]], [[0, 13], [1, 20]]], {reversed: true});
        const [selection1, selection2] = Array.from(editor.getSelections());

        editor.selectLeft();
        expect(editor.getSelections()).toEqual([selection1]);
        expect(selection1.getScreenRange()).toEqual([[0, 8], [1, 20]]);
        return expect(selection1.isReversed()).toBeTruthy();
      });

      it("merges selections when they intersect when moving right", function() {
        editor.setSelectedBufferRanges([[[0, 9], [0, 14]], [[0, 14], [1, 20]]]);
        const [selection1, selection2] = Array.from(editor.getSelections());

        editor.selectRight();
        expect(editor.getSelections()).toEqual([selection1]);
        expect(selection1.getScreenRange()).toEqual([[0, 9], [1, 21]]);
        return expect(selection1.isReversed()).toBeFalsy();
      });

      return describe("when counts are passed into the selection functions", () =>
        it("expands each selection to its cursor's new location", function() {
          editor.setSelectedBufferRanges([[[0, 9], [0, 13]], [[3, 16], [3, 21]]]);
          const [selection1, selection2] = Array.from(editor.getSelections());

          editor.selectRight(2);
          expect(selection1.getBufferRange()).toEqual([[0, 9], [0, 15]]);
          expect(selection2.getBufferRange()).toEqual([[3, 16], [3, 23]]);

          editor.selectLeft(3);
          expect(selection1.getBufferRange()).toEqual([[0, 9], [0, 12]]);
          expect(selection2.getBufferRange()).toEqual([[3, 16], [3, 20]]);

          editor.selectDown(3);
          expect(selection1.getBufferRange()).toEqual([[0, 9], [3, 12]]);
          expect(selection2.getBufferRange()).toEqual([[3, 16], [6, 20]]);

          editor.selectUp(2);
          expect(selection1.getBufferRange()).toEqual([[0, 9], [1, 12]]);
          return expect(selection2.getBufferRange()).toEqual([[3, 16], [4, 20]]);
      })
    );
  });

    describe(".selectToBufferPosition(bufferPosition)", () =>
      it("expands the last selection to the given position", function() {
        editor.setSelectedBufferRange([[3, 0], [4, 5]]);
        editor.addCursorAtBufferPosition([5, 6]);
        editor.selectToBufferPosition([6, 2]);

        const selections = editor.getSelections();
        expect(selections.length).toBe(2);
        const [selection1, selection2] = Array.from(selections);
        expect(selection1.getBufferRange()).toEqual([[3, 0], [4, 5]]);
        return expect(selection2.getBufferRange()).toEqual([[5, 6], [6, 2]]);
    })
  );

    describe(".selectToScreenPosition(screenPosition)", function() {
      it("expands the last selection to the given position", function() {
        editor.setSelectedBufferRange([[3, 0], [4, 5]]);
        editor.addCursorAtScreenPosition([5, 6]);
        editor.selectToScreenPosition([6, 2]);

        const selections = editor.getSelections();
        expect(selections.length).toBe(2);
        const [selection1, selection2] = Array.from(selections);
        expect(selection1.getScreenRange()).toEqual([[3, 0], [4, 5]]);
        return expect(selection2.getScreenRange()).toEqual([[5, 6], [6, 2]]);
    });

      return describe("when selecting with an initial screen range", () =>
        it("switches the direction of the selection when selecting to positions before/after the start of the initial range", function() {
          editor.setCursorScreenPosition([5, 10]);
          editor.selectWordsContainingCursors();
          editor.selectToScreenPosition([3, 0]);
          expect(editor.getLastSelection().isReversed()).toBe(true);
          editor.selectToScreenPosition([9, 0]);
          return expect(editor.getLastSelection().isReversed()).toBe(false);
        })
      );
    });

    describe(".selectToBeginningOfNextParagraph()", () =>
      it("selects from the cursor to first line of the next paragraph", function() {
        editor.setSelectedBufferRange([[3, 0], [4, 5]]);
        editor.addCursorAtScreenPosition([5, 6]);
        editor.selectToScreenPosition([6, 2]);

        editor.selectToBeginningOfNextParagraph();

        const selections = editor.getSelections();
        expect(selections.length).toBe(1);
        return expect(selections[0].getScreenRange()).toEqual([[3, 0], [10, 0]]);
    })
  );

    describe(".selectToBeginningOfPreviousParagraph()", function() {
      it("selects from the cursor to the first line of the pevious paragraph", function() {
        editor.setSelectedBufferRange([[3, 0], [4, 5]]);
        editor.addCursorAtScreenPosition([5, 6]);
        editor.selectToScreenPosition([6, 2]);

        editor.selectToBeginningOfPreviousParagraph();

        const selections = editor.getSelections();
        expect(selections.length).toBe(1);
        return expect(selections[0].getScreenRange()).toEqual([[0, 0], [5, 6]]);
    });

      return it("merges selections if they intersect, maintaining the directionality of the last selection", function() {
        editor.setCursorScreenPosition([4, 10]);
        editor.selectToScreenPosition([5, 27]);
        editor.addCursorAtScreenPosition([3, 10]);
        editor.selectToScreenPosition([6, 27]);

        let selections = editor.getSelections();
        expect(selections.length).toBe(1);
        let [selection1] = Array.from(selections);
        expect(selection1.getScreenRange()).toEqual([[3, 10], [6, 27]]);
        expect(selection1.isReversed()).toBeFalsy();

        editor.addCursorAtScreenPosition([7, 4]);
        editor.selectToScreenPosition([4, 11]);

        selections = editor.getSelections();
        expect(selections.length).toBe(1);
        [selection1] = Array.from(selections);
        expect(selection1.getScreenRange()).toEqual([[3, 10], [7, 4]]);
        return expect(selection1.isReversed()).toBeTruthy();
      });
    });

    describe(".selectToTop()", () =>
      it("selects text from cusor position to the top of the buffer", function() {
        editor.setCursorScreenPosition([11, 2]);
        editor.addCursorAtScreenPosition([10, 0]);
        editor.selectToTop();
        expect(editor.getCursors().length).toBe(1);
        expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
        expect(editor.getLastSelection().getBufferRange()).toEqual([[0, 0], [11, 2]]);
        return expect(editor.getLastSelection().isReversed()).toBeTruthy();
      })
    );

    describe(".selectToBottom()", () =>
      it("selects text from cusor position to the bottom of the buffer", function() {
        editor.setCursorScreenPosition([10, 0]);
        editor.addCursorAtScreenPosition([9, 3]);
        editor.selectToBottom();
        expect(editor.getCursors().length).toBe(1);
        expect(editor.getCursorBufferPosition()).toEqual([12, 2]);
        expect(editor.getLastSelection().getBufferRange()).toEqual([[9, 3], [12, 2]]);
        return expect(editor.getLastSelection().isReversed()).toBeFalsy();
      })
    );

    describe(".selectAll()", () =>
      it("selects the entire buffer", function() {
        editor.selectAll();
        return expect(editor.getLastSelection().getBufferRange()).toEqual(buffer.getRange());
      })
    );

    describe(".selectToBeginningOfLine()", () =>
      it("selects text from cusor position to beginning of line", function() {
        editor.setCursorScreenPosition([12, 2]);
        editor.addCursorAtScreenPosition([11, 3]);

        editor.selectToBeginningOfLine();

        expect(editor.getCursors().length).toBe(2);
        const [cursor1, cursor2] = Array.from(editor.getCursors());
        expect(cursor1.getBufferPosition()).toEqual([12, 0]);
        expect(cursor2.getBufferPosition()).toEqual([11, 0]);

        expect(editor.getSelections().length).toBe(2);
        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[12, 0], [12, 2]]);
        expect(selection1.isReversed()).toBeTruthy();
        expect(selection2.getBufferRange()).toEqual([[11, 0], [11, 3]]);
        return expect(selection2.isReversed()).toBeTruthy();
      })
    );

    describe(".selectToEndOfLine()", () =>
      it("selects text from cusor position to end of line", function() {
        editor.setCursorScreenPosition([12, 0]);
        editor.addCursorAtScreenPosition([11, 3]);

        editor.selectToEndOfLine();

        expect(editor.getCursors().length).toBe(2);
        const [cursor1, cursor2] = Array.from(editor.getCursors());
        expect(cursor1.getBufferPosition()).toEqual([12, 2]);
        expect(cursor2.getBufferPosition()).toEqual([11, 44]);

        expect(editor.getSelections().length).toBe(2);
        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[12, 0], [12, 2]]);
        expect(selection1.isReversed()).toBeFalsy();
        expect(selection2.getBufferRange()).toEqual([[11, 3], [11, 44]]);
        return expect(selection2.isReversed()).toBeFalsy();
      })
    );

    describe(".selectLinesContainingCursors()", function() {
      it("selects to the entire line (including newlines) at given row", function() {
        editor.setCursorScreenPosition([1, 2]);
        editor.selectLinesContainingCursors();
        expect(editor.getSelectedBufferRange()).toEqual([[1, 0], [2, 0]]);
        expect(editor.getSelectedText()).toBe("  var sort = function(items) {\n");

        editor.setCursorScreenPosition([12, 2]);
        editor.selectLinesContainingCursors();
        expect(editor.getSelectedBufferRange()).toEqual([[12, 0], [12, 2]]);

        editor.setCursorBufferPosition([0, 2]);
        editor.selectLinesContainingCursors();
        editor.selectLinesContainingCursors();
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [2, 0]]);
    });

      return describe("when the selection spans multiple row", () =>
        it("selects from the beginning of the first line to the last line", function() {
          selection = editor.getLastSelection();
          selection.setBufferRange([[1, 10], [3, 20]]);
          editor.selectLinesContainingCursors();
          return expect(editor.getSelectedBufferRange()).toEqual([[1, 0], [4, 0]]);
      })
    );
  });

    describe(".selectToBeginningOfWord()", () =>
      it("selects text from cusor position to beginning of word", function() {
        editor.setCursorScreenPosition([0, 13]);
        editor.addCursorAtScreenPosition([3, 49]);

        editor.selectToBeginningOfWord();

        expect(editor.getCursors().length).toBe(2);
        const [cursor1, cursor2] = Array.from(editor.getCursors());
        expect(cursor1.getBufferPosition()).toEqual([0, 4]);
        expect(cursor2.getBufferPosition()).toEqual([3, 47]);

        expect(editor.getSelections().length).toBe(2);
        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 4], [0, 13]]);
        expect(selection1.isReversed()).toBeTruthy();
        expect(selection2.getBufferRange()).toEqual([[3, 47], [3, 49]]);
        return expect(selection2.isReversed()).toBeTruthy();
      })
    );

    describe(".selectToEndOfWord()", () =>
      it("selects text from cusor position to end of word", function() {
        editor.setCursorScreenPosition([0, 4]);
        editor.addCursorAtScreenPosition([3, 48]);

        editor.selectToEndOfWord();

        expect(editor.getCursors().length).toBe(2);
        const [cursor1, cursor2] = Array.from(editor.getCursors());
        expect(cursor1.getBufferPosition()).toEqual([0, 13]);
        expect(cursor2.getBufferPosition()).toEqual([3, 50]);

        expect(editor.getSelections().length).toBe(2);
        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 4], [0, 13]]);
        expect(selection1.isReversed()).toBeFalsy();
        expect(selection2.getBufferRange()).toEqual([[3, 48], [3, 50]]);
        return expect(selection2.isReversed()).toBeFalsy();
      })
    );

    describe(".selectToBeginningOfNextWord()", () =>
      it("selects text from cusor position to beginning of next word", function() {
        editor.setCursorScreenPosition([0, 4]);
        editor.addCursorAtScreenPosition([3, 48]);

        editor.selectToBeginningOfNextWord();

        expect(editor.getCursors().length).toBe(2);
        const [cursor1, cursor2] = Array.from(editor.getCursors());
        expect(cursor1.getBufferPosition()).toEqual([0, 14]);
        expect(cursor2.getBufferPosition()).toEqual([3, 51]);

        expect(editor.getSelections().length).toBe(2);
        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 4], [0, 14]]);
        expect(selection1.isReversed()).toBeFalsy();
        expect(selection2.getBufferRange()).toEqual([[3, 48], [3, 51]]);
        return expect(selection2.isReversed()).toBeFalsy();
      })
    );

    describe(".selectToPreviousWordBoundary()", () =>
      it("select to the previous word boundary", function() {
        editor.setCursorBufferPosition([0, 8]);
        editor.addCursorAtBufferPosition([2, 0]);
        editor.addCursorAtBufferPosition([3, 4]);
        editor.addCursorAtBufferPosition([3, 14]);

        editor.selectToPreviousWordBoundary();

        expect(editor.getSelections().length).toBe(4);
        const [selection1, selection2, selection3, selection4] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 8], [0, 4]]);
        expect(selection1.isReversed()).toBeTruthy();
        expect(selection2.getBufferRange()).toEqual([[2, 0], [1, 30]]);
        expect(selection2.isReversed()).toBeTruthy();
        expect(selection3.getBufferRange()).toEqual([[3, 4], [3, 0]]);
        expect(selection3.isReversed()).toBeTruthy();
        expect(selection4.getBufferRange()).toEqual([[3, 14], [3, 13]]);
        return expect(selection4.isReversed()).toBeTruthy();
      })
    );

    describe(".selectToNextWordBoundary()", () =>
      it("select to the next word boundary", function() {
        editor.setCursorBufferPosition([0, 8]);
        editor.addCursorAtBufferPosition([2, 40]);
        editor.addCursorAtBufferPosition([4, 0]);
        editor.addCursorAtBufferPosition([3, 30]);

        editor.selectToNextWordBoundary();

        expect(editor.getSelections().length).toBe(4);
        const [selection1, selection2, selection3, selection4] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 8], [0, 13]]);
        expect(selection1.isReversed()).toBeFalsy();
        expect(selection2.getBufferRange()).toEqual([[2, 40], [3, 0]]);
        expect(selection2.isReversed()).toBeFalsy();
        expect(selection3.getBufferRange()).toEqual([[4, 0], [4, 4]]);
        expect(selection3.isReversed()).toBeFalsy();
        expect(selection4.getBufferRange()).toEqual([[3, 30], [3, 31]]);
        return expect(selection4.isReversed()).toBeFalsy();
      })
    );

    describe(".selectToPreviousSubwordBoundary", () =>
      it("selects subwords", function() {
        editor.setText("");
        editor.insertText("_word\n");
        editor.insertText(" getPreviousWord\n");
        editor.insertText("e, => \n");
        editor.insertText(" 88 \n");
        editor.setCursorBufferPosition([0, 5]);
        editor.addCursorAtBufferPosition([1, 7]);
        editor.addCursorAtBufferPosition([2, 5]);
        editor.addCursorAtBufferPosition([3, 3]);
        const [selection1, selection2, selection3, selection4] = Array.from(editor.getSelections());

        editor.selectToPreviousSubwordBoundary();
        expect(selection1.getBufferRange()).toEqual([[0, 1], [0, 5]]);
        expect(selection1.isReversed()).toBeTruthy();
        expect(selection2.getBufferRange()).toEqual([[1, 4], [1, 7]]);
        expect(selection2.isReversed()).toBeTruthy();
        expect(selection3.getBufferRange()).toEqual([[2, 3], [2, 5]]);
        expect(selection3.isReversed()).toBeTruthy();
        expect(selection4.getBufferRange()).toEqual([[3, 1], [3, 3]]);
        return expect(selection4.isReversed()).toBeTruthy();
      })
    );

    describe(".selectToNextSubwordBoundary", () =>
      it("selects subwords", function() {
        editor.setText("");
        editor.insertText("word_\n");
        editor.insertText("getPreviousWord\n");
        editor.insertText("e, => \n");
        editor.insertText(" 88 \n");
        editor.setCursorBufferPosition([0, 1]);
        editor.addCursorAtBufferPosition([1, 7]);
        editor.addCursorAtBufferPosition([2, 2]);
        editor.addCursorAtBufferPosition([3, 1]);
        const [selection1, selection2, selection3, selection4] = Array.from(editor.getSelections());

        editor.selectToNextSubwordBoundary();
        expect(selection1.getBufferRange()).toEqual([[0, 1], [0, 4]]);
        expect(selection1.isReversed()).toBeFalsy();
        expect(selection2.getBufferRange()).toEqual([[1, 7], [1, 11]]);
        expect(selection2.isReversed()).toBeFalsy();
        expect(selection3.getBufferRange()).toEqual([[2, 2], [2, 5]]);
        expect(selection3.isReversed()).toBeFalsy();
        expect(selection4.getBufferRange()).toEqual([[3, 1], [3, 3]]);
        return expect(selection4.isReversed()).toBeFalsy();
      })
    );

    describe(".deleteToBeginningOfSubword", () =>
      it("deletes subwords", function() {
        editor.setText("");
        editor.insertText("_word\n");
        editor.insertText(" getPreviousWord\n");
        editor.insertText("e, => \n");
        editor.insertText(" 88 \n");
        editor.setCursorBufferPosition([0, 5]);
        editor.addCursorAtBufferPosition([1, 7]);
        editor.addCursorAtBufferPosition([2, 5]);
        editor.addCursorAtBufferPosition([3, 3]);
        const [cursor1, cursor2, cursor3, cursor4] = Array.from(editor.getCursors());

        editor.deleteToBeginningOfSubword();
        expect(buffer.lineForRow(0)).toBe('_');
        expect(buffer.lineForRow(1)).toBe(' getviousWord');
        expect(buffer.lineForRow(2)).toBe('e,  ');
        expect(buffer.lineForRow(3)).toBe('  ');
        expect(cursor1.getBufferPosition()).toEqual([0, 1]);
        expect(cursor2.getBufferPosition()).toEqual([1, 4]);
        expect(cursor3.getBufferPosition()).toEqual([2, 3]);
        expect(cursor4.getBufferPosition()).toEqual([3, 1]);

        editor.deleteToBeginningOfSubword();
        expect(buffer.lineForRow(0)).toBe('');
        expect(buffer.lineForRow(1)).toBe(' viousWord');
        expect(buffer.lineForRow(2)).toBe('e ');
        expect(buffer.lineForRow(3)).toBe(' ');
        expect(cursor1.getBufferPosition()).toEqual([0, 0]);
        expect(cursor2.getBufferPosition()).toEqual([1, 1]);
        expect(cursor3.getBufferPosition()).toEqual([2, 1]);
        expect(cursor4.getBufferPosition()).toEqual([3, 0]);

        editor.deleteToBeginningOfSubword();
        expect(buffer.lineForRow(0)).toBe('');
        expect(buffer.lineForRow(1)).toBe('viousWord');
        expect(buffer.lineForRow(2)).toBe('  ');
        expect(buffer.lineForRow(3)).toBe('');
        expect(cursor1.getBufferPosition()).toEqual([0, 0]);
        expect(cursor2.getBufferPosition()).toEqual([1, 0]);
        expect(cursor3.getBufferPosition()).toEqual([2, 0]);
        return expect(cursor4.getBufferPosition()).toEqual([2, 1]);
      })
    );

    describe(".deleteToEndOfSubword", () =>
      it("deletes subwords", function() {
        editor.setText("");
        editor.insertText("word_\n");
        editor.insertText("getPreviousWord \n");
        editor.insertText("e, => \n");
        editor.insertText(" 88 \n");
        editor.setCursorBufferPosition([0, 0]);
        editor.addCursorAtBufferPosition([1, 0]);
        editor.addCursorAtBufferPosition([2, 2]);
        editor.addCursorAtBufferPosition([3, 0]);
        const [cursor1, cursor2, cursor3, cursor4] = Array.from(editor.getCursors());

        editor.deleteToEndOfSubword();
        expect(buffer.lineForRow(0)).toBe('_');
        expect(buffer.lineForRow(1)).toBe('PreviousWord ');
        expect(buffer.lineForRow(2)).toBe('e, ');
        expect(buffer.lineForRow(3)).toBe('88 ');
        expect(cursor1.getBufferPosition()).toEqual([0, 0]);
        expect(cursor2.getBufferPosition()).toEqual([1, 0]);
        expect(cursor3.getBufferPosition()).toEqual([2, 2]);
        expect(cursor4.getBufferPosition()).toEqual([3, 0]);

        editor.deleteToEndOfSubword();
        expect(buffer.lineForRow(0)).toBe('');
        expect(buffer.lineForRow(1)).toBe('Word ');
        expect(buffer.lineForRow(2)).toBe('e,');
        expect(buffer.lineForRow(3)).toBe(' ');
        expect(cursor1.getBufferPosition()).toEqual([0, 0]);
        expect(cursor2.getBufferPosition()).toEqual([1, 0]);
        expect(cursor3.getBufferPosition()).toEqual([2, 2]);
        return expect(cursor4.getBufferPosition()).toEqual([3, 0]);
      })
    );

    describe(".selectWordsContainingCursors()", function() {
      describe("when the cursor is inside a word", () =>
        it("selects the entire word", function() {
          editor.setCursorScreenPosition([0, 8]);
          editor.selectWordsContainingCursors();
          return expect(editor.getSelectedText()).toBe('quicksort');
        })
      );

      describe("when the cursor is between two words", () =>
        it("selects the word the cursor is on", function() {
          editor.setCursorScreenPosition([0, 4]);
          editor.selectWordsContainingCursors();
          expect(editor.getSelectedText()).toBe('quicksort');

          editor.setCursorScreenPosition([0, 3]);
          editor.selectWordsContainingCursors();
          return expect(editor.getSelectedText()).toBe('var');
        })
      );

      describe("when the cursor is inside a region of whitespace", () =>
        it("selects the whitespace region", function() {
          editor.setCursorScreenPosition([5, 2]);
          editor.selectWordsContainingCursors();
          expect(editor.getSelectedBufferRange()).toEqual([[5, 0], [5, 6]]);

          editor.setCursorScreenPosition([5, 0]);
          editor.selectWordsContainingCursors();
          return expect(editor.getSelectedBufferRange()).toEqual([[5, 0], [5, 6]]);
      })
    );

      describe("when the cursor is at the end of the text", () =>
        it("select the previous word", function() {
          editor.buffer.append('word');
          editor.moveToBottom();
          editor.selectWordsContainingCursors();
          return expect(editor.getSelectedBufferRange()).toEqual([[12, 2], [12, 6]]);
      })
    );

      return it("selects words based on the non-word characters configured at the cursor's current scope", function() {
        editor.setText("one-one; 'two-two'; three-three");

        editor.setCursorBufferPosition([0, 1]);
        editor.addCursorAtBufferPosition([0, 12]);

        const scopeDescriptors = editor.getCursors().map(c => c.getScopeDescriptor());
        expect(scopeDescriptors[0].getScopesArray()).toEqual(['source.js']);
        expect(scopeDescriptors[1].getScopesArray()).toEqual(['source.js', 'string.quoted.single.js']);

        editor.setScopedSettingsDelegate({
          getNonWordCharacters(scopes) {
            const result = '/\()"\':,.;<>~!@#$%^&*|+=[]{}`?';
            if (scopes.some(scope => scope.startsWith('string'))) {
              return result;
            } else {
              return result + '-';
            }
          }
        });

        editor.selectWordsContainingCursors();

        expect(editor.getSelections()[0].getText()).toBe('one');
        return expect(editor.getSelections()[1].getText()).toBe('two-two');
      });
    });

    describe(".selectToFirstCharacterOfLine()", () =>
      it("moves to the first character of the current line or the beginning of the line if it's already on the first character", function() {
        editor.setCursorScreenPosition([0, 5]);
        editor.addCursorAtScreenPosition([1, 7]);

        editor.selectToFirstCharacterOfLine();

        const [cursor1, cursor2] = Array.from(editor.getCursors());
        expect(cursor1.getBufferPosition()).toEqual([0, 0]);
        expect(cursor2.getBufferPosition()).toEqual([1, 2]);

        expect(editor.getSelections().length).toBe(2);
        let [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 0], [0, 5]]);
        expect(selection1.isReversed()).toBeTruthy();
        expect(selection2.getBufferRange()).toEqual([[1, 2], [1, 7]]);
        expect(selection2.isReversed()).toBeTruthy();

        editor.selectToFirstCharacterOfLine();
        [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1.getBufferRange()).toEqual([[0, 0], [0, 5]]);
        expect(selection1.isReversed()).toBeTruthy();
        expect(selection2.getBufferRange()).toEqual([[1, 0], [1, 7]]);
        return expect(selection2.isReversed()).toBeTruthy();
      })
    );

    describe(".setSelectedBufferRanges(ranges)", function() {
      it("clears existing selections and creates selections for each of the given ranges", function() {
        editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[4, 4], [5, 5]]]);
        expect(editor.getSelectedBufferRanges()).toEqual([[[2, 2], [3, 3]], [[4, 4], [5, 5]]]);

        editor.setSelectedBufferRanges([[[5, 5], [6, 6]]]);
        return expect(editor.getSelectedBufferRanges()).toEqual([[[5, 5], [6, 6]]]);
    });

      it("merges intersecting selections", function() {
        editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[3, 0], [5, 5]]]);
        return expect(editor.getSelectedBufferRanges()).toEqual([[[2, 2], [5, 5]]]);
    });

      it("does not merge non-empty adjacent selections", function() {
        editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[3, 3], [5, 5]]]);
        return expect(editor.getSelectedBufferRanges()).toEqual([[[2, 2], [3, 3]], [[3, 3], [5, 5]]]);
    });

      it("recyles existing selection instances", function() {
        selection = editor.getLastSelection();
        editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[4, 4], [5, 5]]]);

        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1).toBe(selection);
        return expect(selection1.getBufferRange()).toEqual([[2, 2], [3, 3]]);
    });

      describe("when the 'preserveFolds' option is false (the default)", () =>
        it("removes folds that contain the selections", function() {
          editor.setSelectedBufferRange([[0, 0], [0, 0]]);
          editor.foldBufferRowRange(1, 4);
          editor.foldBufferRowRange(2, 3);
          editor.foldBufferRowRange(6, 8);
          editor.foldBufferRowRange(10, 11);

          editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[6, 6], [7, 7]]]);
          expect(editor.isFoldedAtScreenRow(1)).toBeFalsy();
          expect(editor.isFoldedAtScreenRow(2)).toBeFalsy();
          expect(editor.isFoldedAtScreenRow(6)).toBeFalsy();
          return expect(editor.isFoldedAtScreenRow(10)).toBeTruthy();
        })
      );

      return describe("when the 'preserveFolds' option is true", () =>
        it("does not remove folds that contain the selections", function() {
          editor.setSelectedBufferRange([[0, 0], [0, 0]]);
          editor.foldBufferRowRange(1, 4);
          editor.foldBufferRowRange(6, 8);
          editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[6, 0], [6, 1]]], {preserveFolds: true});
          expect(editor.isFoldedAtBufferRow(1)).toBeTruthy();
          return expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
        })
      );
    });

    describe(".setSelectedScreenRanges(ranges)", function() {
      beforeEach(() => editor.foldBufferRow(4));

      it("clears existing selections and creates selections for each of the given ranges", function() {
        editor.setSelectedScreenRanges([[[3, 4], [3, 7]], [[5, 4], [5, 7]]]);
        expect(editor.getSelectedBufferRanges()).toEqual([[[3, 4], [3, 7]], [[8, 4], [8, 7]]]);

        editor.setSelectedScreenRanges([[[6, 2], [6, 4]]]);
        return expect(editor.getSelectedScreenRanges()).toEqual([[[6, 2], [6, 4]]]);
    });

      it("merges intersecting selections and unfolds the fold which contain them", function() {
        editor.foldBufferRow(0);

        // Use buffer ranges because only the first line is on screen
        editor.setSelectedBufferRanges([[[2, 2], [3, 3]], [[3, 0], [5, 5]]]);
        return expect(editor.getSelectedBufferRanges()).toEqual([[[2, 2], [5, 5]]]);
    });

      return it("recyles existing selection instances", function() {
        selection = editor.getLastSelection();
        editor.setSelectedScreenRanges([[[2, 2], [3, 4]], [[4, 4], [5, 5]]]);

        const [selection1, selection2] = Array.from(editor.getSelections());
        expect(selection1).toBe(selection);
        return expect(selection1.getScreenRange()).toEqual([[2, 2], [3, 4]]);
    });
  });

    describe(".selectMarker(marker)", function() {
      describe("if the marker is valid", () =>
        it("selects the marker's range and returns the selected range", function() {
          const marker = editor.markBufferRange([[0, 1], [3, 3]]);
          expect(editor.selectMarker(marker)).toEqual([[0, 1], [3, 3]]);
          return expect(editor.getSelectedBufferRange()).toEqual([[0, 1], [3, 3]]);
      })
    );

      return describe("if the marker is invalid", () =>
        it("does not change the selection and returns a falsy value", function() {
          const marker = editor.markBufferRange([[0, 1], [3, 3]]);
          marker.destroy();
          expect(editor.selectMarker(marker)).toBeFalsy();
          return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 0]]);
      })
    );
  });

    describe(".addSelectionForBufferRange(bufferRange)", () =>
      it("adds a selection for the specified buffer range", function() {
        editor.addSelectionForBufferRange([[3, 4], [5, 6]]);
        return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [0, 0]], [[3, 4], [5, 6]]]);
    })
  );

    describe(".addSelectionBelow()", function() {
      describe("when the selection is non-empty", function() {
        it("selects the same region of the line below current selections if possible", function() {
          editor.setSelectedBufferRange([[3, 16], [3, 21]]);
          editor.addSelectionForBufferRange([[3, 25], [3, 34]]);
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 16], [3, 21]],
            [[3, 25], [3, 34]],
            [[4, 16], [4, 21]],
            [[4, 25], [4, 29]]
          ]);
      });

        it("skips lines that are too short to create a non-empty selection", function() {
          editor.setSelectedBufferRange([[3, 31], [3, 38]]);
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 31], [3, 38]],
            [[6, 31], [6, 38]]
          ]);
      });

        it("honors the original selection's range (goal range) when adding across shorter lines", function() {
          editor.setSelectedBufferRange([[3, 22], [3, 38]]);
          editor.addSelectionBelow();
          editor.addSelectionBelow();
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 22], [3, 38]],
            [[4, 22], [4, 29]],
            [[5, 22], [5, 30]],
            [[6, 22], [6, 38]]
          ]);
      });

        it("clears selection goal ranges when the selection changes", function() {
          editor.setSelectedBufferRange([[3, 22], [3, 38]]);
          editor.addSelectionBelow();
          editor.selectLeft();
          editor.addSelectionBelow();
          expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 22], [3, 37]],
            [[4, 22], [4, 29]],
            [[5, 22], [5, 28]]
          ]);

          // goal range from previous add selection is honored next time
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 22], [3, 37]],
            [[4, 22], [4, 29]],
            [[5, 22], [5, 30]], // select to end of line 5 because line 4's goal range was reset by line 3 previously
            [[6, 22], [6, 28]]
          ]);
      });

        it("can add selections to soft-wrapped line segments", function() {
          editor.setSoftWrapped(true);
          editor.setEditorWidthInChars(40);
          editor.setDefaultCharWidth(1);

          editor.setSelectedScreenRange([[3, 10], [3, 15]]);
          editor.addSelectionBelow();
          return expect(editor.getSelectedScreenRanges()).toEqual([
            [[3, 10], [3, 15]],
            [[4, 10], [4, 15]]
          ]);
      });

        return it("takes atomic tokens into account", function() {
          waitsForPromise(() => atom.workspace.open('sample-with-tabs-and-leading-comment.coffee', {autoIndent: false}).then(o => editor = o));

          return runs(function() {
            editor.setSelectedBufferRange([[2, 1], [2, 3]]);
            editor.addSelectionBelow();

            return expect(editor.getSelectedBufferRanges()).toEqual([
              [[2, 1], [2, 3]],
              [[3, 1], [3, 2]]
            ]);});
      });
    });

      return describe("when the selection is empty", function() {
        describe("when lines are soft-wrapped", function() {
          beforeEach(function() {
            editor.setSoftWrapped(true);
            editor.setDefaultCharWidth(1);
            return editor.setEditorWidthInChars(40);
          });

          it("skips soft-wrap indentation tokens", function() {
            editor.setCursorScreenPosition([3, 0]);
            editor.addSelectionBelow();

            return expect(editor.getSelectedScreenRanges()).toEqual([
              [[3, 0], [3, 0]],
              [[4, 4], [4, 4]]
            ]);
        });

          return it("does not skip them if they're shorter than the current column", function() {
            editor.setCursorScreenPosition([3, 37]);
            editor.addSelectionBelow();

            return expect(editor.getSelectedScreenRanges()).toEqual([
              [[3, 37], [3, 37]],
              [[4, 26], [4, 26]]
            ]);
        });
      });

        it("does not skip lines that are shorter than the current column", function() {
          editor.setCursorBufferPosition([3, 36]);
          editor.addSelectionBelow();
          editor.addSelectionBelow();
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 36], [3, 36]],
            [[4, 29], [4, 29]],
            [[5, 30], [5, 30]],
            [[6, 36], [6, 36]]
          ]);
      });

        it("skips empty lines when the column is non-zero", function() {
          editor.setCursorBufferPosition([9, 4]);
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[9, 4], [9, 4]],
            [[11, 4], [11, 4]]
          ]);
      });

        return it("does not skip empty lines when the column is zero", function() {
          editor.setCursorBufferPosition([9, 0]);
          editor.addSelectionBelow();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[9, 0], [9, 0]],
            [[10, 0], [10, 0]]
          ]);
      });
    });
  });

    describe(".addSelectionAbove()", function() {
      describe("when the selection is non-empty", function() {
        it("selects the same region of the line above current selections if possible", function() {
          editor.setSelectedBufferRange([[3, 16], [3, 21]]);
          editor.addSelectionForBufferRange([[3, 37], [3, 44]]);
          editor.addSelectionAbove();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[3, 16], [3, 21]],
            [[3, 37], [3, 44]],
            [[2, 16], [2, 21]],
            [[2, 37], [2, 40]]
          ]);
      });

        it("skips lines that are too short to create a non-empty selection", function() {
          editor.setSelectedBufferRange([[6, 31], [6, 38]]);
          editor.addSelectionAbove();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[6, 31], [6, 38]],
            [[3, 31], [3, 38]]
          ]);
      });

        it("honors the original selection's range (goal range) when adding across shorter lines", function() {
          editor.setSelectedBufferRange([[6, 22], [6, 38]]);
          editor.addSelectionAbove();
          editor.addSelectionAbove();
          editor.addSelectionAbove();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[6, 22], [6, 38]],
            [[5, 22], [5, 30]],
            [[4, 22], [4, 29]],
            [[3, 22], [3, 38]]
          ]);
      });

        it("can add selections to soft-wrapped line segments", function() {
          editor.setSoftWrapped(true);
          editor.setDefaultCharWidth(1);
          editor.setEditorWidthInChars(40);

          editor.setSelectedScreenRange([[4, 10], [4, 15]]);
          editor.addSelectionAbove();
          return expect(editor.getSelectedScreenRanges()).toEqual([
            [[4, 10], [4, 15]],
            [[3, 10], [3, 15]]
          ]);
      });

        return it("takes atomic tokens into account", function() {
          waitsForPromise(() => atom.workspace.open('sample-with-tabs-and-leading-comment.coffee', {autoIndent: false}).then(o => editor = o));

          return runs(function() {
            editor.setSelectedBufferRange([[3, 1], [3, 2]]);
            editor.addSelectionAbove();

            return expect(editor.getSelectedBufferRanges()).toEqual([
              [[3, 1], [3, 2]],
              [[2, 1], [2, 3]]
            ]);});
      });
    });

      return describe("when the selection is empty", function() {
        describe("when lines are soft-wrapped", function() {
          beforeEach(function() {
            editor.setSoftWrapped(true);
            editor.setDefaultCharWidth(1);
            return editor.setEditorWidthInChars(40);
          });

          it("skips soft-wrap indentation tokens", function() {
            editor.setCursorScreenPosition([5, 0]);
            editor.addSelectionAbove();

            return expect(editor.getSelectedScreenRanges()).toEqual([
              [[5, 0], [5, 0]],
              [[4, 4], [4, 4]]
            ]);
        });

          return it("does not skip them if they're shorter than the current column", function() {
            editor.setCursorScreenPosition([5, 29]);
            editor.addSelectionAbove();

            return expect(editor.getSelectedScreenRanges()).toEqual([
              [[5, 29], [5, 29]],
              [[4, 26], [4, 26]]
            ]);
        });
      });

        it("does not skip lines that are shorter than the current column", function() {
          editor.setCursorBufferPosition([6, 36]);
          editor.addSelectionAbove();
          editor.addSelectionAbove();
          editor.addSelectionAbove();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[6, 36], [6, 36]],
            [[5, 30], [5, 30]],
            [[4, 29], [4, 29]],
            [[3, 36], [3, 36]]
          ]);
      });

        it("skips empty lines when the column is non-zero", function() {
          editor.setCursorBufferPosition([11, 4]);
          editor.addSelectionAbove();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[11, 4], [11, 4]],
            [[9, 4], [9, 4]]
          ]);
      });

        return it("does not skip empty lines when the column is zero", function() {
          editor.setCursorBufferPosition([10, 0]);
          editor.addSelectionAbove();
          return expect(editor.getSelectedBufferRanges()).toEqual([
            [[10, 0], [10, 0]],
            [[9, 0], [9, 0]]
          ]);
      });
    });
  });

    describe(".splitSelectionsIntoLines()", () =>
      it("splits all multi-line selections into one selection per line", function() {
        editor.setSelectedBufferRange([[0, 3], [2, 4]]);
        editor.splitSelectionsIntoLines();
        expect(editor.getSelectedBufferRanges()).toEqual([
          [[0, 3], [0, 29]],
          [[1, 0], [1, 30]],
          [[2, 0], [2, 4]]
        ]);

        editor.setSelectedBufferRange([[0, 3], [1, 10]]);
        editor.splitSelectionsIntoLines();
        expect(editor.getSelectedBufferRanges()).toEqual([
          [[0, 3], [0, 29]],
          [[1, 0], [1, 10]]
        ]);

        editor.setSelectedBufferRange([[0, 0], [0, 3]]);
        editor.splitSelectionsIntoLines();
        return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [0, 3]]]);
    })
  );

    describe("::consolidateSelections()", function() {
      const makeMultipleSelections = function() {
        selection.setBufferRange([[3, 16], [3, 21]]);
        const selection2 = editor.addSelectionForBufferRange([[3, 25], [3, 34]]);
        const selection3 = editor.addSelectionForBufferRange([[8, 4], [8, 10]]);
        const selection4 = editor.addSelectionForBufferRange([[1, 6], [1, 10]]);
        expect(editor.getSelections()).toEqual([selection, selection2, selection3, selection4]);
        return [selection, selection2, selection3, selection4];
      };

      return it("destroys all selections but the oldest selection and autoscrolls to it, returning true if any selections were destroyed", function() {
        const [selection1] = Array.from(makeMultipleSelections());

        const autoscrollEvents = [];
        editor.onDidRequestAutoscroll(event => autoscrollEvents.push(event));

        expect(editor.consolidateSelections()).toBeTruthy();
        expect(editor.getSelections()).toEqual([selection1]);
        expect(selection1.isEmpty()).toBeFalsy();
        expect(editor.consolidateSelections()).toBeFalsy();
        expect(editor.getSelections()).toEqual([selection1]);

        return expect(autoscrollEvents).toEqual([
          {screenRange: selection1.getScreenRange(), options: {center: true, reversed: false}}
        ]);
      });
    });

    describe("when the cursor is moved while there is a selection", function() {
      const makeSelection = () => selection.setBufferRange([[1, 2], [1, 5]]);

      return it("clears the selection", function() {
        makeSelection();
        editor.moveDown();
        expect(selection.isEmpty()).toBeTruthy();

        makeSelection();
        editor.moveUp();
        expect(selection.isEmpty()).toBeTruthy();

        makeSelection();
        editor.moveLeft();
        expect(selection.isEmpty()).toBeTruthy();

        makeSelection();
        editor.moveRight();
        expect(selection.isEmpty()).toBeTruthy();

        makeSelection();
        editor.setCursorScreenPosition([3, 3]);
        return expect(selection.isEmpty()).toBeTruthy();
      });
    });

    return it("does not share selections between different edit sessions for the same buffer", function() {
      let editor2 = null;
      waitsForPromise(function() {
        atom.workspace.getActivePane().splitRight();
        return atom.workspace.open(editor.getPath()).then(o => editor2 = o);
      });

      return runs(function() {
        expect(editor2.getText()).toBe(editor.getText());
        editor.setSelectedBufferRanges([[[1, 2], [3, 4]], [[5, 6], [7, 8]]]);
        editor2.setSelectedBufferRanges([[[8, 7], [6, 5]], [[4, 3], [2, 1]]]);
        return expect(editor2.getSelectedBufferRanges()).not.toEqual(editor.getSelectedBufferRanges());
      });
    });
  });

  describe("buffer manipulation", function() {
    describe(".moveLineUp", function() {
      it("moves the line under the cursor up", function() {
        editor.setCursorBufferPosition([1, 0]);
        editor.moveLineUp();
        expect(editor.getTextInBufferRange([[0, 0], [0, 30]])).toBe("  var sort = function(items) {");
        expect(editor.indentationForBufferRow(0)).toBe(1);
        return expect(editor.indentationForBufferRow(1)).toBe(0);
      });

      it("updates the line's indentation when the the autoIndent setting is true", function() {
        editor.update({autoIndent: true});
        editor.setCursorBufferPosition([1, 0]);
        editor.moveLineUp();
        expect(editor.indentationForBufferRow(0)).toBe(0);
        return expect(editor.indentationForBufferRow(1)).toBe(0);
      });

      describe("when there is a single selection", function() {
        describe("when the selection spans a single line", function() {
          describe("when there is no fold in the preceeding row", () =>
            it("moves the line to the preceding row", function() {
              expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

              editor.setSelectedBufferRange([[3, 2], [3, 9]]);
              editor.moveLineUp();

              expect(editor.getSelectedBufferRange()).toEqual([[2, 2], [2, 9]]);
              expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              return expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
            })
          );

          describe("when the cursor is at the beginning of a fold", () =>
            it("moves the line to the previous row without breaking the fold", function() {
              expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

              editor.foldBufferRowRange(4, 7);
              editor.setSelectedBufferRange([[4, 2], [4, 9]], {preserveFolds: true});
              expect(editor.getSelectedBufferRange()).toEqual([[4, 2], [4, 9]]);

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.moveLineUp();

              expect(editor.getSelectedBufferRange()).toEqual([[3, 2], [3, 9]]);
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.lineTextForBufferRow(7)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              return expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();
            })
          );


          return describe("when the preceding row consists of folded code", () =>
            it("moves the line above the folded row and preseveres the correct folds", function() {
              expect(editor.lineTextForBufferRow(8)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
              expect(editor.lineTextForBufferRow(9)).toBe("  };");

              editor.foldBufferRowRange(4, 7);

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.setSelectedBufferRange([[8, 0], [8, 4]]);
              editor.moveLineUp();

              expect(editor.getSelectedBufferRange()).toEqual([[4, 0], [4, 4]]);
              expect(editor.lineTextForBufferRow(4)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
              expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
              return expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
            })
          );
        });

        describe("when the selection spans multiple lines", function() {
          it("moves the lines spanned by the selection to the preceding row", function() {
            expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.setSelectedBufferRange([[3, 2], [4, 9]]);
            editor.moveLineUp();

            expect(editor.getSelectedBufferRange()).toEqual([[2, 2], [3, 9]]);
            expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
            return expect(editor.lineTextForBufferRow(4)).toBe("    if (items.length <= 1) return items;");
          });

          describe("when the selection's end intersects a fold", () =>
            it("moves the lines to the previous row without breaking the fold", function() {
              expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

              editor.foldBufferRowRange(4, 7);
              editor.setSelectedBufferRange([[3, 2], [4, 9]], {preserveFolds: true});

              expect(editor.isFoldedAtBufferRow(3)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.moveLineUp();

              expect(editor.getSelectedBufferRange()).toEqual([[2, 2], [3, 9]]);
              expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.lineTextForBufferRow(7)).toBe("    if (items.length <= 1) return items;");

              expect(editor.isFoldedAtBufferRow(2)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              return expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();
            })
          );

          return describe("when the selection's start intersects a fold", () =>
            it("moves the lines to the previous row without breaking the fold", function() {
              expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

              editor.foldBufferRowRange(4, 7);
              editor.setSelectedBufferRange([[4, 2], [8, 9]], {preserveFolds: true});

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();

              editor.moveLineUp();

              expect(editor.getSelectedBufferRange()).toEqual([[3, 2], [7, 9]]);
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.lineTextForBufferRow(7)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
              expect(editor.lineTextForBufferRow(8)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();
              return expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();
            })
          );
        });


        describe("when the selection spans multiple lines, but ends at column 0", () =>
          it("does not move the last line of the selection", function() {
            expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.setSelectedBufferRange([[3, 2], [4, 0]]);
            editor.moveLineUp();

            expect(editor.getSelectedBufferRange()).toEqual([[2, 2], [3, 0]]);
            expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
            return expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");
          })
        );

        return describe("when the preceeding row is a folded row", () =>
          it("moves the lines spanned by the selection to the preceeding row, but preserves the folded code", function() {
            expect(editor.lineTextForBufferRow(8)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
            expect(editor.lineTextForBufferRow(9)).toBe("  };");

            editor.foldBufferRowRange(4, 7);
            expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

            editor.setSelectedBufferRange([[8, 0], [9, 2]]);
            editor.moveLineUp();

            expect(editor.getSelectedBufferRange()).toEqual([[4, 0], [5, 2]]);
            expect(editor.lineTextForBufferRow(4)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
            expect(editor.lineTextForBufferRow(5)).toBe("  };");
            expect(editor.lineTextForBufferRow(6)).toBe("    while(items.length > 0) {");
            expect(editor.isFoldedAtBufferRow(5)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(9)).toBeTruthy();
            return expect(editor.isFoldedAtBufferRow(10)).toBeFalsy();
          })
        );
      });

      return describe("when there are multiple selections", function() {
        describe("when all the selections span different lines", function() {
          describe("when there is no folds", () =>
            it("moves all lines that are spanned by a selection to the preceding row", function() {
              editor.setSelectedBufferRanges([[[1, 2], [1, 9]], [[3, 2], [3, 9]], [[5, 2], [5, 9]]]);
              editor.moveLineUp();

              expect(editor.getSelectedBufferRanges()).toEqual([[[0, 2], [0, 9]], [[2, 2], [2, 9]], [[4, 2], [4, 9]]]);
              expect(editor.lineTextForBufferRow(0)).toBe("  var sort = function(items) {");
              expect(editor.lineTextForBufferRow(1)).toBe("var quicksort = function () {");
              expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(4)).toBe("      current = items.shift();");
              return expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");
            })
          );

          describe("when one selection intersects a fold", () =>
            it("moves the lines to the previous row without breaking the fold", function() {
              expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

              editor.foldBufferRowRange(4, 7);
              editor.setSelectedBufferRanges([
                [[2, 2], [2, 9]],
                [[4, 2], [4, 9]]
              ], {preserveFolds: true});

              expect(editor.isFoldedAtBufferRow(2)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(3)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();

              editor.moveLineUp();

              expect(editor.getSelectedBufferRanges()).toEqual([
                [[1, 2], [1, 9]],
                [[3, 2], [3, 9]]
              ]);

              expect(editor.lineTextForBufferRow(1)).toBe("    if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(2)).toBe("  var sort = function(items) {");
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.lineTextForBufferRow(7)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

              expect(editor.isFoldedAtBufferRow(1)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(2)).toBeFalsy();
              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();
              return expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();
            })
          );

          return describe("when there is a fold", () =>
            it("moves all lines that spanned by a selection to preceding row, preserving all folds", function() {
              editor.foldBufferRowRange(4, 7);

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.setSelectedBufferRanges([[[8, 0], [8, 3]], [[11, 0], [11, 5]]]);
              editor.moveLineUp();

              expect(editor.getSelectedBufferRanges()).toEqual([[[4, 0], [4, 3]], [[10, 0], [10, 5]]]);
              expect(editor.lineTextForBufferRow(4)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
              expect(editor.lineTextForBufferRow(10)).toBe("  return sort(Array.apply(this, arguments));");
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
              return expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
            })
          );
        });

        describe('when there are many folds', function() {
          beforeEach(() =>
            waitsForPromise(() => atom.workspace.open('sample-with-many-folds.js', {autoIndent: false}).then(o => editor = o))
          );

          return describe('and many selections intersects folded rows', () =>
            it('moves and preserves all the folds', function() {
              editor.foldBufferRowRange(2, 4);
              editor.foldBufferRowRange(7, 9);

              editor.setSelectedBufferRanges([
                [[1, 0], [5, 4]],
                [[7, 0], [7, 4]]
              ], {preserveFolds: true});

              editor.moveLineUp();

              expect(editor.lineTextForBufferRow(1)).toEqual("function f3() {");
              expect(editor.lineTextForBufferRow(4)).toEqual("6;");
              expect(editor.lineTextForBufferRow(5)).toEqual("1;");
              expect(editor.lineTextForBufferRow(6)).toEqual("function f8() {");
              expect(editor.lineTextForBufferRow(9)).toEqual("7;");

              expect(editor.isFoldedAtBufferRow(1)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(2)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeFalsy();

              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
              return expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
            })
          );
        });

        describe("when some of the selections span the same lines", () =>
          it("moves lines that contain multiple selections correctly", function() {
            editor.setSelectedBufferRanges([[[3, 2], [3, 9]], [[3, 12], [3, 13]]]);
            editor.moveLineUp();

            expect(editor.getSelectedBufferRanges()).toEqual([[[2, 2], [2, 9]], [[2, 12], [2, 13]]]);
            return expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
          })
        );

        describe("when one of the selections spans line 0", () =>
          it("doesn't move any lines, since line 0 can't move", function() {
            editor.setSelectedBufferRanges([[[0, 2], [1, 9]], [[2, 2], [2, 9]], [[4, 2], [4, 9]]]);

            editor.moveLineUp();

            expect(editor.getSelectedBufferRanges()).toEqual([[[0, 2], [1, 9]], [[2, 2], [2, 9]], [[4, 2], [4, 9]]]);
            return expect(buffer.isModified()).toBe(false);
          })
        );

        return describe("when one of the selections spans the last line, and it is empty", () =>
          it("doesn't move any lines, since the last line can't move", function() {
            buffer.append('\n');
            editor.setSelectedBufferRanges([[[0, 2], [1, 9]], [[2, 2], [2, 9]], [[13, 0], [13, 0]]]);

            editor.moveLineUp();

            return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 2], [1, 9]], [[2, 2], [2, 9]], [[13, 0], [13, 0]]]);
        })
      );
    });
  });

    describe(".moveLineDown", function() {
      it("moves the line under the cursor down", function() {
        editor.setCursorBufferPosition([0, 0]);
        editor.moveLineDown();
        expect(editor.getTextInBufferRange([[1, 0], [1, 31]])).toBe("var quicksort = function () {");
        expect(editor.indentationForBufferRow(0)).toBe(1);
        return expect(editor.indentationForBufferRow(1)).toBe(0);
      });

      it("updates the line's indentation when the editor.autoIndent setting is true", function() {
        editor.update({autoIndent: true});
        editor.setCursorBufferPosition([0, 0]);
        editor.moveLineDown();
        expect(editor.indentationForBufferRow(0)).toBe(1);
        return expect(editor.indentationForBufferRow(1)).toBe(2);
      });

      describe("when there is a single selection", function() {
        describe("when the selection spans a single line", function() {
          describe("when there is no fold in the following row", () =>
            it("moves the line to the following row", function() {
              expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

              editor.setSelectedBufferRange([[2, 2], [2, 9]]);
              editor.moveLineDown();

              expect(editor.getSelectedBufferRange()).toEqual([[3, 2], [3, 9]]);
              expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              return expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
            })
          );

          describe("when the cursor is at the beginning of a fold", () =>
            it("moves the line to the following row without breaking the fold", function() {
              expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

              editor.foldBufferRowRange(4, 7);
              editor.setSelectedBufferRange([[4, 2], [4, 9]], {preserveFolds: true});

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.moveLineDown();

              expect(editor.getSelectedBufferRange()).toEqual([[5, 2], [5, 9]]);
              expect(editor.lineTextForBufferRow(4)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
              expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");

              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
              return expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
            })
          );

          return describe("when the following row is a folded row", () =>
            it("moves the line below the folded row and preserves the fold", function() {
              expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

              editor.foldBufferRowRange(4, 7);

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.setSelectedBufferRange([[3, 0], [3, 4]]);
              editor.moveLineDown();

              expect(editor.getSelectedBufferRange()).toEqual([[7, 0], [7, 4]]);
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();


              return expect(editor.lineTextForBufferRow(7)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            })
          );
        });

        describe("when the selection spans multiple lines", () =>
          it("moves the lines spanned by the selection to the following row", function() {
            expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.setSelectedBufferRange([[2, 2], [3, 9]]);
            editor.moveLineDown();

            expect(editor.getSelectedBufferRange()).toEqual([[3, 2], [4, 9]]);
            expect(editor.lineTextForBufferRow(2)).toBe("    while(items.length > 0) {");
            expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
            return expect(editor.lineTextForBufferRow(4)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
          })
        );

        describe("when the selection spans multiple lines, but ends at column 0", () =>
          it("does not move the last line of the selection", function() {
            expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.setSelectedBufferRange([[2, 2], [3, 0]]);
            editor.moveLineDown();

            expect(editor.getSelectedBufferRange()).toEqual([[3, 2], [4, 0]]);
            expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
            return expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");
          })
        );

        describe("when the selection's end intersects a fold", () =>
          it("moves the lines to the following row without breaking the fold", function() {
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.foldBufferRowRange(4, 7);
            editor.setSelectedBufferRange([[3, 2], [4, 9]], {preserveFolds: true});

            expect(editor.isFoldedAtBufferRow(3)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

            editor.moveLineDown();

            expect(editor.getSelectedBufferRange()).toEqual([[4, 2], [5, 9]]);
            expect(editor.lineTextForBufferRow(3)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
            expect(editor.lineTextForBufferRow(4)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");

            expect(editor.isFoldedAtBufferRow(4)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
            return expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
          })
        );

        describe("when the selection's start intersects a fold", () =>
          it("moves the lines to the following row without breaking the fold", function() {
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.foldBufferRowRange(4, 7);
            editor.setSelectedBufferRange([[4, 2], [8, 9]], {preserveFolds: true});

            expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();

            editor.moveLineDown();

            expect(editor.getSelectedBufferRange()).toEqual([[5, 2], [9, 9]]);
            expect(editor.lineTextForBufferRow(4)).toBe("  };");
            expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");
            expect(editor.lineTextForBufferRow(9)).toBe("    return sort(left).concat(pivot).concat(sort(right));");

            expect(editor.isFoldedAtBufferRow(4)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
            return expect(editor.isFoldedAtBufferRow(10)).toBeFalsy();
          })
        );

        describe("when the following row is a folded row", () =>
          it("moves the lines spanned by the selection to the following row, but preserves the folded code", function() {
            expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

            editor.foldBufferRowRange(4, 7);
            expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

            editor.setSelectedBufferRange([[2, 0], [3, 2]]);
            editor.moveLineDown();

            expect(editor.getSelectedBufferRange()).toEqual([[6, 0], [7, 2]]);
            expect(editor.lineTextForBufferRow(2)).toBe("    while(items.length > 0) {");
            expect(editor.isFoldedAtBufferRow(1)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(2)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeFalsy();
            return expect(editor.lineTextForBufferRow(6)).toBe("    if (items.length <= 1) return items;");
          })
        );

        return describe("when the last line of selection does not end with a valid line ending", () =>
          it("appends line ending to last line and moves the lines spanned by the selection to the preceeding row", function() {
            expect(editor.lineTextForBufferRow(9)).toBe("  };");
            expect(editor.lineTextForBufferRow(10)).toBe("");
            expect(editor.lineTextForBufferRow(11)).toBe("  return sort(Array.apply(this, arguments));");
            expect(editor.lineTextForBufferRow(12)).toBe("};");

            editor.setSelectedBufferRange([[10, 0], [12, 2]]);
            editor.moveLineUp();

            expect(editor.getSelectedBufferRange()).toEqual([[9, 0], [11, 2]]);
            expect(editor.lineTextForBufferRow(9)).toBe("");
            expect(editor.lineTextForBufferRow(10)).toBe("  return sort(Array.apply(this, arguments));");
            expect(editor.lineTextForBufferRow(11)).toBe("};");
            return expect(editor.lineTextForBufferRow(12)).toBe("  };");
          })
        );
      });

      describe("when there are multiple selections", function() {
        describe("when all the selections span different lines", function() {
          describe("when there is no folds", () =>
            it("moves all lines that are spanned by a selection to the following row", function() {
              editor.setSelectedBufferRanges([[[1, 2], [1, 9]], [[3, 2], [3, 9]], [[5, 2], [5, 9]]]);
              editor.moveLineDown();

              expect(editor.getSelectedBufferRanges()).toEqual([[[6, 2], [6, 9]], [[4, 2], [4, 9]], [[2, 2], [2, 9]]]);
              expect(editor.lineTextForBufferRow(1)).toBe("    if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(2)).toBe("  var sort = function(items) {");
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.lineTextForBufferRow(4)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(5)).toBe("      current < pivot ? left.push(current) : right.push(current);");
              return expect(editor.lineTextForBufferRow(6)).toBe("      current = items.shift();");
            })
          );

          describe('when there are many folds', function() {
            beforeEach(() =>
              waitsForPromise(() => atom.workspace.open('sample-with-many-folds.js', {autoIndent: false}).then(o => editor = o))
            );

            return describe('and many selections intersects folded rows', () =>
              it('moves and preserves all the folds', function() {
                editor.foldBufferRowRange(2, 4);
                editor.foldBufferRowRange(7, 9);

                editor.setSelectedBufferRanges([
                  [[2, 0], [2, 4]],
                  [[6, 0], [10, 4]]
                ], {preserveFolds: true});

                editor.moveLineDown();

                expect(editor.lineTextForBufferRow(2)).toEqual("6;");
                expect(editor.lineTextForBufferRow(3)).toEqual("function f3() {");
                expect(editor.lineTextForBufferRow(6)).toEqual("12;");
                expect(editor.lineTextForBufferRow(7)).toEqual("7;");
                expect(editor.lineTextForBufferRow(8)).toEqual("function f8() {");
                expect(editor.lineTextForBufferRow(11)).toEqual("11;");

                expect(editor.isFoldedAtBufferRow(2)).toBeFalsy();
                expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
                expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
                expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
                expect(editor.isFoldedAtBufferRow(6)).toBeFalsy();
                expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();
                expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
                expect(editor.isFoldedAtBufferRow(9)).toBeTruthy();
                expect(editor.isFoldedAtBufferRow(10)).toBeTruthy();
                return expect(editor.isFoldedAtBufferRow(11)).toBeFalsy();
              })
            );
          });

          describe("when there is a fold below one of the selected row", () =>
            it("moves all lines spanned by a selection to the following row, preserving the fold", function() {
              editor.foldBufferRowRange(4, 7);

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.setSelectedBufferRanges([[[1, 2], [1, 6]], [[3, 0], [3, 4]], [[8, 0], [8, 3]]]);
              editor.moveLineDown();

              expect(editor.getSelectedBufferRanges()).toEqual([[[9, 0], [9, 3]], [[7, 0], [7, 4]], [[2, 2], [2, 6]]]);
              expect(editor.lineTextForBufferRow(2)).toBe("  var sort = function(items) {");
              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeFalsy();
              expect(editor.lineTextForBufferRow(7)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
              return expect(editor.lineTextForBufferRow(9)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
            })
          );

          return describe("when there is a fold below a group of multiple selections without any lines with no selection in-between", () =>
            it("moves all the lines below the fold, preserving the fold", function() {
              editor.foldBufferRowRange(4, 7);

              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();

              editor.setSelectedBufferRanges([[[2, 2], [2, 6]], [[3, 0], [3, 4]]]);
              editor.moveLineDown();

              expect(editor.getSelectedBufferRanges()).toEqual([[[7, 0], [7, 4]], [[6, 2], [6, 6]]]);
              expect(editor.lineTextForBufferRow(2)).toBe("    while(items.length > 0) {");
              expect(editor.isFoldedAtBufferRow(2)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(3)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
              expect(editor.isFoldedAtBufferRow(6)).toBeFalsy();
              expect(editor.lineTextForBufferRow(6)).toBe("    if (items.length <= 1) return items;");
              return expect(editor.lineTextForBufferRow(7)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            })
          );
        });

        describe("when one selection intersects a fold", () =>
          it("moves the lines to the previous row without breaking the fold", function() {
            expect(editor.lineTextForBufferRow(4)).toBe("    while(items.length > 0) {");

            editor.foldBufferRowRange(4, 7);
            editor.setSelectedBufferRanges([
              [[2, 2], [2, 9]],
              [[4, 2], [4, 9]]
            ], {preserveFolds: true});

            expect(editor.isFoldedAtBufferRow(2)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(3)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(4)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();

            editor.moveLineDown();

            expect(editor.getSelectedBufferRanges()).toEqual([
              [[5, 2], [5, 9]],
              [[3, 2], [3, 9]],
            ]);

            expect(editor.lineTextForBufferRow(2)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(4)).toBe("    return sort(left).concat(pivot).concat(sort(right));");

            expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");
            expect(editor.lineTextForBufferRow(9)).toBe("  };");

            expect(editor.isFoldedAtBufferRow(2)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(3)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(4)).toBeFalsy();
            expect(editor.isFoldedAtBufferRow(5)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(6)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(7)).toBeTruthy();
            expect(editor.isFoldedAtBufferRow(8)).toBeTruthy();
            return expect(editor.isFoldedAtBufferRow(9)).toBeFalsy();
          })
        );

        describe("when some of the selections span the same lines", () =>
          it("moves lines that contain multiple selections correctly", function() {
            editor.setSelectedBufferRanges([[[3, 2], [3, 9]], [[3, 12], [3, 13]]]);
            editor.moveLineDown();

            expect(editor.getSelectedBufferRanges()).toEqual([[[4, 12], [4, 13]], [[4, 2], [4, 9]]]);
            return expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
          })
        );

        return describe("when the selections are above a wrapped line", function() {
          beforeEach(function() {
            editor.setSoftWrapped(true);
            editor.setEditorWidthInChars(80);
            return editor.setText(`\
1
2
Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.
3
4\
`);
          });

          return it('moves the lines past the soft wrapped line', function() {
            editor.setSelectedBufferRanges([[[0, 0], [0, 0]], [[1, 0], [1, 0]]]);

            editor.moveLineDown();

            expect(editor.lineTextForBufferRow(0)).not.toBe("2");
            expect(editor.lineTextForBufferRow(1)).toBe("1");
            return expect(editor.lineTextForBufferRow(2)).toBe("2");
          });
        });
      });

      return describe("when the line is the last buffer row", () =>
        it("doesn't move it", function() {
          editor.setText("abc\ndef");
          editor.setCursorBufferPosition([1, 0]);
          editor.moveLineDown();
          return expect(editor.getText()).toBe("abc\ndef");
        })
      );
    });

    describe(".insertText(text)", function() {
      describe("when there is a single selection", function() {
        beforeEach(() => editor.setSelectedBufferRange([[1, 0], [1, 2]]));

        return it("replaces the selection with the given text", function() {
          const range = editor.insertText('xxx');
          expect(range).toEqual([ [[1, 0], [1, 3]] ]);
          return expect(buffer.lineForRow(1)).toBe('xxxvar sort = function(items) {');
        });
      });

      describe("when there are multiple empty selections", function() {
        describe("when the cursors are on the same line", () =>
          it("inserts the given text at the location of each cursor and moves the cursors to the end of each cursor's inserted text", function() {
            editor.setCursorScreenPosition([1, 2]);
            editor.addCursorAtScreenPosition([1, 5]);

            editor.insertText('xxx');

            expect(buffer.lineForRow(1)).toBe('  xxxvarxxx sort = function(items) {');
            const [cursor1, cursor2] = Array.from(editor.getCursors());

            expect(cursor1.getBufferPosition()).toEqual([1, 5]);
            return expect(cursor2.getBufferPosition()).toEqual([1, 11]);
        })
      );

        return describe("when the cursors are on different lines", () =>
          it("inserts the given text at the location of each cursor and moves the cursors to the end of each cursor's inserted text", function() {
            editor.setCursorScreenPosition([1, 2]);
            editor.addCursorAtScreenPosition([2, 4]);

            editor.insertText('xxx');

            expect(buffer.lineForRow(1)).toBe('  xxxvar sort = function(items) {');
            expect(buffer.lineForRow(2)).toBe('    xxxif (items.length <= 1) return items;');
            const [cursor1, cursor2] = Array.from(editor.getCursors());

            expect(cursor1.getBufferPosition()).toEqual([1, 5]);
            return expect(cursor2.getBufferPosition()).toEqual([2, 7]);
        })
      );
    });

      describe("when there are multiple non-empty selections", function() {
        describe("when the selections are on the same line", () =>
          it("replaces each selection range with the inserted characters", function() {
            editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[0, 22], [0, 24]]]);
            editor.insertText("x");

            const [cursor1, cursor2] = Array.from(editor.getCursors());
            const [selection1, selection2] = Array.from(editor.getSelections());

            expect(cursor1.getScreenPosition()).toEqual([0, 5]);
            expect(cursor2.getScreenPosition()).toEqual([0, 15]);
            expect(selection1.isEmpty()).toBeTruthy();
            expect(selection2.isEmpty()).toBeTruthy();

            return expect(editor.lineTextForBufferRow(0)).toBe("var x = functix () {");
          })
        );

        return describe("when the selections are on different lines", () =>
          it("replaces each selection with the given text, clears the selections, and places the cursor at the end of each selection's inserted text", function() {
            editor.setSelectedBufferRanges([[[1, 0], [1, 2]], [[2, 0], [2, 4]]]);

            editor.insertText('xxx');

            expect(buffer.lineForRow(1)).toBe('xxxvar sort = function(items) {');
            expect(buffer.lineForRow(2)).toBe('xxxif (items.length <= 1) return items;');
            const [selection1, selection2] = Array.from(editor.getSelections());

            expect(selection1.isEmpty()).toBeTruthy();
            expect(selection1.cursor.getBufferPosition()).toEqual([1, 3]);
            expect(selection2.isEmpty()).toBeTruthy();
            return expect(selection2.cursor.getBufferPosition()).toEqual([2, 3]);
        })
      );
    });

      describe("when there is a selection that ends on a folded line", () =>
        it("destroys the selection", function() {
          editor.foldBufferRowRange(2, 4);
          editor.setSelectedBufferRange([[1, 0], [2, 0]]);
          editor.insertText('holy cow');
          return expect(editor.isFoldedAtScreenRow(2)).toBeFalsy();
        })
      );

      describe("when there are ::onWillInsertText and ::onDidInsertText observers", function() {
        beforeEach(() => editor.setSelectedBufferRange([[1, 0], [1, 2]]));

        it("notifies the observers when inserting text", function() {
          const willInsertSpy = jasmine.createSpy().andCallFake(() => expect(buffer.lineForRow(1)).toBe('  var sort = function(items) {'));

          const didInsertSpy = jasmine.createSpy().andCallFake(() => expect(buffer.lineForRow(1)).toBe('xxxvar sort = function(items) {'));

          editor.onWillInsertText(willInsertSpy);
          editor.onDidInsertText(didInsertSpy);

          expect(editor.insertText('xxx')).toBeTruthy();
          expect(buffer.lineForRow(1)).toBe('xxxvar sort = function(items) {');

          expect(willInsertSpy).toHaveBeenCalled();
          expect(didInsertSpy).toHaveBeenCalled();

          let options = willInsertSpy.mostRecentCall.args[0];
          expect(options.text).toBe('xxx');
          expect(options.cancel).toBeDefined();

          options = didInsertSpy.mostRecentCall.args[0];
          return expect(options.text).toBe('xxx');
        });

        return it("cancels text insertion when an ::onWillInsertText observer calls cancel on an event", function() {
          const willInsertSpy = jasmine.createSpy().andCallFake(({cancel}) => cancel());

          const didInsertSpy = jasmine.createSpy();

          editor.onWillInsertText(willInsertSpy);
          editor.onDidInsertText(didInsertSpy);

          expect(editor.insertText('xxx')).toBe(false);
          expect(buffer.lineForRow(1)).toBe('  var sort = function(items) {');

          expect(willInsertSpy).toHaveBeenCalled();
          return expect(didInsertSpy).not.toHaveBeenCalled();
        });
      });

      return describe("when the undo option is set to 'skip'", function() {
        beforeEach(() => editor.setSelectedBufferRange([[1, 2], [1, 2]]));

        return it("does not undo the skipped operation", function() {
          let range = editor.insertText('x');
          range = editor.insertText('y', {undo: 'skip'});
          editor.undo();
          return expect(buffer.lineForRow(1)).toBe('  yvar sort = function(items) {');
        });
      });
    });

    describe(".insertNewline()", function() {
      describe("when there is a single cursor", function() {
        describe("when the cursor is at the beginning of a line", () =>
          it("inserts an empty line before it", function() {
            editor.setCursorScreenPosition({row: 1, column: 0});

            editor.insertNewline();

            expect(buffer.lineForRow(1)).toBe('');
            return expect(editor.getCursorScreenPosition()).toEqual({row: 2, column: 0});
          })
        );

        describe("when the cursor is in the middle of a line", () =>
          it("splits the current line to form a new line", function() {
            editor.setCursorScreenPosition({row: 1, column: 6});
            const originalLine = buffer.lineForRow(1);
            const lineBelowOriginalLine = buffer.lineForRow(2);

            editor.insertNewline();

            expect(buffer.lineForRow(1)).toBe(originalLine.slice(0, 6));
            expect(buffer.lineForRow(2)).toBe(originalLine.slice(6));
            expect(buffer.lineForRow(3)).toBe(lineBelowOriginalLine);
            return expect(editor.getCursorScreenPosition()).toEqual({row: 2, column: 0});
          })
        );

        return describe("when the cursor is on the end of a line", () =>
          it("inserts an empty line after it", function() {
            editor.setCursorScreenPosition({row: 1, column: buffer.lineForRow(1).length});

            editor.insertNewline();

            expect(buffer.lineForRow(2)).toBe('');
            return expect(editor.getCursorScreenPosition()).toEqual({row: 2, column: 0});
          })
        );
      });

      return describe("when there are multiple cursors", function() {
        describe("when the cursors are on the same line", () =>
          it("breaks the line at the cursor locations", function() {
            editor.setCursorScreenPosition([3, 13]);
            editor.addCursorAtScreenPosition([3, 38]);

            editor.insertNewline();

            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot");
            expect(editor.lineTextForBufferRow(4)).toBe(" = items.shift(), current");
            expect(editor.lineTextForBufferRow(5)).toBe(", left = [], right = [];");
            expect(editor.lineTextForBufferRow(6)).toBe("    while(items.length > 0) {");

            const [cursor1, cursor2] = Array.from(editor.getCursors());
            expect(cursor1.getBufferPosition()).toEqual([4, 0]);
            return expect(cursor2.getBufferPosition()).toEqual([5, 0]);
        })
      );

        return describe("when the cursors are on different lines", () =>
          it("inserts newlines at each cursor location", function() {
            editor.setCursorScreenPosition([3, 0]);
            editor.addCursorAtScreenPosition([6, 0]);

            editor.insertText("\n");
            expect(editor.lineTextForBufferRow(3)).toBe("");
            expect(editor.lineTextForBufferRow(4)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            expect(editor.lineTextForBufferRow(5)).toBe("    while(items.length > 0) {");
            expect(editor.lineTextForBufferRow(6)).toBe("      current = items.shift();");
            expect(editor.lineTextForBufferRow(7)).toBe("");
            expect(editor.lineTextForBufferRow(8)).toBe("      current < pivot ? left.push(current) : right.push(current);");
            expect(editor.lineTextForBufferRow(9)).toBe("    }");

            const [cursor1, cursor2] = Array.from(editor.getCursors());
            expect(cursor1.getBufferPosition()).toEqual([4, 0]);
            return expect(cursor2.getBufferPosition()).toEqual([8, 0]);
        })
      );
    });
  });

    describe(".insertNewlineBelow()", function() {
      describe("when the operation is undone", () =>
        it("places the cursor back at the previous location", function() {
          editor.setCursorBufferPosition([0, 2]);
          editor.insertNewlineBelow();
          expect(editor.getCursorBufferPosition()).toEqual([1, 0]);
          editor.undo();
          return expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      })
    );

      return it("inserts a newline below the cursor's current line, autoindents it, and moves the cursor to the end of the line", function() {
        editor.update({autoIndent: true});
        editor.insertNewlineBelow();
        expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
        expect(buffer.lineForRow(1)).toBe("  ");
        return expect(editor.getCursorBufferPosition()).toEqual([1, 2]);
    });
  });

    describe(".insertNewlineAbove()", function() {
      describe("when the cursor is on first line", () =>
        it("inserts a newline on the first line and moves the cursor to the first line", function() {
          editor.setCursorBufferPosition([0]);
          editor.insertNewlineAbove();
          expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
          expect(editor.lineTextForBufferRow(0)).toBe('');
          expect(editor.lineTextForBufferRow(1)).toBe('var quicksort = function () {');
          return expect(editor.buffer.getLineCount()).toBe(14);
        })
      );

      describe("when the cursor is not on the first line", () =>
        it("inserts a newline above the current line and moves the cursor to the inserted line", function() {
          editor.setCursorBufferPosition([3, 4]);
          editor.insertNewlineAbove();
          expect(editor.getCursorBufferPosition()).toEqual([3, 0]);
          expect(editor.lineTextForBufferRow(3)).toBe('');
          expect(editor.lineTextForBufferRow(4)).toBe('    var pivot = items.shift(), current, left = [], right = [];');
          expect(editor.buffer.getLineCount()).toBe(14);

          editor.undo();
          return expect(editor.getCursorBufferPosition()).toEqual([3, 4]);
      })
    );

      return it("indents the new line to the correct level when editor.autoIndent is true", function() {
        editor.update({autoIndent: true});

        editor.setText('  var test');
        editor.setCursorBufferPosition([0, 2]);
        editor.insertNewlineAbove();

        expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
        expect(editor.lineTextForBufferRow(0)).toBe('  ');
        expect(editor.lineTextForBufferRow(1)).toBe('  var test');

        editor.setText('\n  var test');
        editor.setCursorBufferPosition([1, 2]);
        editor.insertNewlineAbove();

        expect(editor.getCursorBufferPosition()).toEqual([1, 2]);
        expect(editor.lineTextForBufferRow(0)).toBe('');
        expect(editor.lineTextForBufferRow(1)).toBe('  ');
        expect(editor.lineTextForBufferRow(2)).toBe('  var test');

        editor.setText('function() {\n}');
        editor.setCursorBufferPosition([1, 1]);
        editor.insertNewlineAbove();

        expect(editor.getCursorBufferPosition()).toEqual([1, 2]);
        expect(editor.lineTextForBufferRow(0)).toBe('function() {');
        expect(editor.lineTextForBufferRow(1)).toBe('  ');
        return expect(editor.lineTextForBufferRow(2)).toBe('}');
      });
    });

    describe(".insertNewLine()", function() {
      describe("when a new line is appended before a closing tag (e.g. by pressing enter before a selection)", () =>
        it("moves the line down and keeps the indentation level the same when editor.autoIndent is true", function() {
          editor.update({autoIndent: true});
          editor.setCursorBufferPosition([9, 2]);
          editor.insertNewline();
          return expect(editor.lineTextForBufferRow(10)).toBe('  };');
        })
      );

      describe("when a newline is appended with a trailing closing tag behind the cursor (e.g. by pressing enter in the middel of a line)", function() {
        it("indents the new line to the correct level when editor.autoIndent is true and using a curly-bracket language", function() {
          waitsForPromise(() => atom.packages.activatePackage('language-javascript'));

          return runs(function() {
            editor.update({autoIndent: true});
            editor.setGrammar(atom.grammars.selectGrammar("file.js"));
            editor.setText('var test = function () {\n  return true;};');
            editor.setCursorBufferPosition([1, 14]);
            editor.insertNewline();
            expect(editor.indentationForBufferRow(1)).toBe(1);
            return expect(editor.indentationForBufferRow(2)).toBe(0);
          });
        });

        it("indents the new line to the current level when editor.autoIndent is true and no increaseIndentPattern is specified", () =>
          runs(function() {
            editor.setGrammar(atom.grammars.selectGrammar("file"));
            editor.update({autoIndent: true});
            editor.setText('  if true');
            editor.setCursorBufferPosition([0, 8]);
            editor.insertNewline();
            expect(editor.getGrammar()).toBe(atom.grammars.nullGrammar);
            expect(editor.indentationForBufferRow(0)).toBe(1);
            return expect(editor.indentationForBufferRow(1)).toBe(1);
          })
        );

        return it("indents the new line to the correct level when editor.autoIndent is true and using an off-side rule language", function() {
          waitsForPromise(() => atom.packages.activatePackage('language-coffee-script'));

          return runs(function() {
            editor.update({autoIndent: true});
            editor.setGrammar(atom.grammars.selectGrammar("file.coffee"));
            editor.setText('if true\n  return trueelse\n  return false');
            editor.setCursorBufferPosition([1, 13]);
            editor.insertNewline();
            expect(editor.indentationForBufferRow(1)).toBe(1);
            expect(editor.indentationForBufferRow(2)).toBe(0);
            return expect(editor.indentationForBufferRow(3)).toBe(1);
          });
        });
      });

      return describe("when a newline is appended on a line that matches the decreaseNextIndentPattern", () =>
        it("indents the new line to the correct level when editor.autoIndent is true", function() {
          waitsForPromise(() => atom.packages.activatePackage('language-go'));

          return runs(function() {
            editor.update({autoIndent: true});
            editor.setGrammar(atom.grammars.selectGrammar("file.go"));
            editor.setText('fmt.Printf("some%s",\n	"thing")');
            editor.setCursorBufferPosition([1, 10]);
            editor.insertNewline();
            expect(editor.indentationForBufferRow(1)).toBe(1);
            return expect(editor.indentationForBufferRow(2)).toBe(0);
          });
        })
      );
    });

    describe(".backspace()", function() {
      describe("when there is a single cursor", function() {
        let changeScreenRangeHandler = null;

        beforeEach(function() {
          const selection = editor.getLastSelection();
          changeScreenRangeHandler = jasmine.createSpy('changeScreenRangeHandler');
          return selection.onDidChangeRange(changeScreenRangeHandler);
        });

        describe("when the cursor is on the middle of the line", () =>
          it("removes the character before the cursor", function() {
            editor.setCursorScreenPosition({row: 1, column: 7});
            expect(buffer.lineForRow(1)).toBe("  var sort = function(items) {");

            editor.backspace();

            const line = buffer.lineForRow(1);
            expect(line).toBe("  var ort = function(items) {");
            expect(editor.getCursorScreenPosition()).toEqual({row: 1, column: 6});
            return expect(changeScreenRangeHandler).toHaveBeenCalled();
          })
        );

        describe("when the cursor is at the beginning of a line", () =>
          it("joins it with the line above", function() {
            const originalLine0 = buffer.lineForRow(0);
            expect(originalLine0).toBe("var quicksort = function () {");
            expect(buffer.lineForRow(1)).toBe("  var sort = function(items) {");

            editor.setCursorScreenPosition({row: 1, column: 0});
            editor.backspace();

            const line0 = buffer.lineForRow(0);
            const line1 = buffer.lineForRow(1);
            expect(line0).toBe("var quicksort = function () {  var sort = function(items) {");
            expect(line1).toBe("    if (items.length <= 1) return items;");
            expect(editor.getCursorScreenPosition()).toEqual([0, originalLine0.length]);

            return expect(changeScreenRangeHandler).toHaveBeenCalled();
          })
        );

        describe("when the cursor is at the first column of the first line", () =>
          it("does nothing, but doesn't raise an error", function() {
            editor.setCursorScreenPosition({row: 0, column: 0});
            return editor.backspace();
          })
        );

        describe("when the cursor is after a fold", () =>
          it("deletes the folded range", function() {
            editor.foldBufferRange([[4, 7], [5, 8]]);
            editor.setCursorBufferPosition([5, 8]);
            editor.backspace();

            expect(buffer.lineForRow(4)).toBe("    whirrent = items.shift();");
            return expect(editor.isFoldedAtBufferRow(4)).toBe(false);
          })
        );

        describe("when the cursor is in the middle of a line below a fold", () =>
          it("backspaces as normal", function() {
            editor.setCursorScreenPosition([4, 0]);
            editor.foldCurrentRow();
            editor.setCursorScreenPosition([5, 5]);
            editor.backspace();

            expect(buffer.lineForRow(7)).toBe("    }");
            return expect(buffer.lineForRow(8)).toBe("    eturn sort(left).concat(pivot).concat(sort(right));");
          })
        );

        return describe("when the cursor is on a folded screen line", () =>
          it("deletes the contents of the fold before the cursor", function() {
            editor.setCursorBufferPosition([3, 0]);
            editor.foldCurrentRow();
            editor.backspace();

            expect(buffer.lineForRow(1)).toBe("  var sort = function(items)     var pivot = items.shift(), current, left = [], right = [];");
            return expect(editor.getCursorScreenPosition()).toEqual([1, 29]);
        })
      );
    });

      describe("when there are multiple cursors", function() {
        describe("when cursors are on the same line", () =>
          it("removes the characters preceding each cursor", function() {
            editor.setCursorScreenPosition([3, 13]);
            editor.addCursorAtScreenPosition([3, 38]);

            editor.backspace();

            expect(editor.lineTextForBufferRow(3)).toBe("    var pivo = items.shift(), curren, left = [], right = [];");

            const [cursor1, cursor2] = Array.from(editor.getCursors());
            expect(cursor1.getBufferPosition()).toEqual([3, 12]);
            expect(cursor2.getBufferPosition()).toEqual([3, 36]);

            const [selection1, selection2] = Array.from(editor.getSelections());
            expect(selection1.isEmpty()).toBeTruthy();
            return expect(selection2.isEmpty()).toBeTruthy();
          })
        );

        return describe("when cursors are on different lines", function() {
          describe("when the cursors are in the middle of their lines", () =>
            it("removes the characters preceding each cursor", function() {
              editor.setCursorScreenPosition([3, 13]);
              editor.addCursorAtScreenPosition([4, 10]);

              editor.backspace();

              expect(editor.lineTextForBufferRow(3)).toBe("    var pivo = items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(4)).toBe("    whileitems.length > 0) {");

              const [cursor1, cursor2] = Array.from(editor.getCursors());
              expect(cursor1.getBufferPosition()).toEqual([3, 12]);
              expect(cursor2.getBufferPosition()).toEqual([4, 9]);

              const [selection1, selection2] = Array.from(editor.getSelections());
              expect(selection1.isEmpty()).toBeTruthy();
              return expect(selection2.isEmpty()).toBeTruthy();
            })
          );

          return describe("when the cursors are on the first column of their lines", () =>
            it("removes the newlines preceding each cursor", function() {
              editor.setCursorScreenPosition([3, 0]);
              editor.addCursorAtScreenPosition([6, 0]);

              editor.backspace();
              expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;    var pivot = items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(3)).toBe("    while(items.length > 0) {");
              expect(editor.lineTextForBufferRow(4)).toBe("      current = items.shift();      current < pivot ? left.push(current) : right.push(current);");
              expect(editor.lineTextForBufferRow(5)).toBe("    }");

              const [cursor1, cursor2] = Array.from(editor.getCursors());
              expect(cursor1.getBufferPosition()).toEqual([2, 40]);
              return expect(cursor2.getBufferPosition()).toEqual([4, 30]);
          })
        );
      });
    });

      describe("when there is a single selection", function() {
        it("deletes the selection, but not the character before it", function() {
          editor.setSelectedBufferRange([[0, 5], [0, 9]]);
          editor.backspace();
          return expect(editor.buffer.lineForRow(0)).toBe('var qsort = function () {');
        });

        return describe("when the selection ends on a folded line", () =>
          it("preserves the fold", function() {
            editor.setSelectedBufferRange([[3, 0], [4, 0]]);
            editor.foldBufferRow(4);
            editor.backspace();

            expect(buffer.lineForRow(3)).toBe("    while(items.length > 0) {");
            return expect(editor.isFoldedAtScreenRow(3)).toBe(true);
          })
        );
      });

      return describe("when there are multiple selections", () =>
        it("removes all selected text", function() {
          editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[0, 16], [0, 24]]]);
          editor.backspace();
          return expect(editor.lineTextForBufferRow(0)).toBe('var  =  () {');
        })
      );
    });

    describe(".deleteToPreviousWordBoundary()", function() {
      describe("when no text is selected", () =>
        it("deletes to the previous word boundary", function() {
          editor.setCursorBufferPosition([0, 16]);
          editor.addCursorAtBufferPosition([1, 21]);
          const [cursor1, cursor2] = Array.from(editor.getCursors());

          editor.deleteToPreviousWordBoundary();
          expect(buffer.lineForRow(0)).toBe('var quicksort =function () {');
          expect(buffer.lineForRow(1)).toBe('  var sort = (items) {');
          expect(cursor1.getBufferPosition()).toEqual([0, 15]);
          expect(cursor2.getBufferPosition()).toEqual([1, 13]);

          editor.deleteToPreviousWordBoundary();
          expect(buffer.lineForRow(0)).toBe('var quicksort function () {');
          expect(buffer.lineForRow(1)).toBe('  var sort =(items) {');
          expect(cursor1.getBufferPosition()).toEqual([0, 14]);
          return expect(cursor2.getBufferPosition()).toEqual([1, 12]);
      })
    );

      return describe("when text is selected", () =>
        it("deletes only selected text", function() {
          editor.setSelectedBufferRange([[1, 24], [1, 27]]);
          editor.deleteToPreviousWordBoundary();
          return expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
        })
      );
    });

    describe(".deleteToNextWordBoundary()", function() {
      describe("when no text is selected", () =>
        it("deletes to the next word boundary", function() {
          editor.setCursorBufferPosition([0, 15]);
          editor.addCursorAtBufferPosition([1, 24]);
          const [cursor1, cursor2] = Array.from(editor.getCursors());

          editor.deleteToNextWordBoundary();
          expect(buffer.lineForRow(0)).toBe('var quicksort =function () {');
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
          expect(cursor1.getBufferPosition()).toEqual([0, 15]);
          expect(cursor2.getBufferPosition()).toEqual([1, 24]);

          editor.deleteToNextWordBoundary();
          expect(buffer.lineForRow(0)).toBe('var quicksort = () {');
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it {');
          expect(cursor1.getBufferPosition()).toEqual([0, 15]);
          expect(cursor2.getBufferPosition()).toEqual([1, 24]);

          editor.deleteToNextWordBoundary();
          expect(buffer.lineForRow(0)).toBe('var quicksort =() {');
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it{');
          expect(cursor1.getBufferPosition()).toEqual([0, 15]);
          return expect(cursor2.getBufferPosition()).toEqual([1, 24]);
      })
    );

      return describe("when text is selected", () =>
        it("deletes only selected text", function() {
          editor.setSelectedBufferRange([[1, 24], [1, 27]]);
          editor.deleteToNextWordBoundary();
          return expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
        })
      );
    });

    describe(".deleteToBeginningOfWord()", function() {
      describe("when no text is selected", () =>
        it("deletes all text between the cursor and the beginning of the word", function() {
          editor.setCursorBufferPosition([1, 24]);
          editor.addCursorAtBufferPosition([3, 5]);
          const [cursor1, cursor2] = Array.from(editor.getCursors());

          editor.deleteToBeginningOfWord();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(ems) {');
          expect(buffer.lineForRow(3)).toBe('    ar pivot = items.shift(), current, left = [], right = [];');
          expect(cursor1.getBufferPosition()).toEqual([1, 22]);
          expect(cursor2.getBufferPosition()).toEqual([3, 4]);

          editor.deleteToBeginningOfWord();
          expect(buffer.lineForRow(1)).toBe('  var sort = functionems) {');
          expect(buffer.lineForRow(2)).toBe('    if (items.length <= 1) return itemsar pivot = items.shift(), current, left = [], right = [];');
          expect(cursor1.getBufferPosition()).toEqual([1, 21]);
          expect(cursor2.getBufferPosition()).toEqual([2, 39]);

          editor.deleteToBeginningOfWord();
          expect(buffer.lineForRow(1)).toBe('  var sort = ems) {');
          expect(buffer.lineForRow(2)).toBe('    if (items.length <= 1) return ar pivot = items.shift(), current, left = [], right = [];');
          expect(cursor1.getBufferPosition()).toEqual([1, 13]);
          expect(cursor2.getBufferPosition()).toEqual([2, 34]);

          editor.setText('  var sort');
          editor.setCursorBufferPosition([0, 2]);
          editor.deleteToBeginningOfWord();
          return expect(buffer.lineForRow(0)).toBe('var sort');
        })
      );

      return describe("when text is selected", () =>
        it("deletes only selected text", function() {
          editor.setSelectedBufferRanges([[[1, 24], [1, 27]], [[2, 0], [2, 4]]]);
          editor.deleteToBeginningOfWord();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
          return expect(buffer.lineForRow(2)).toBe('if (items.length <= 1) return items;');
        })
      );
    });

    describe('.deleteToEndOfLine()', function() {
      describe('when no text is selected', function() {
        it('deletes all text between the cursor and the end of the line', function() {
          editor.setCursorBufferPosition([1, 24]);
          editor.addCursorAtBufferPosition([2, 5]);
          const [cursor1, cursor2] = Array.from(editor.getCursors());

          editor.deleteToEndOfLine();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it');
          expect(buffer.lineForRow(2)).toBe('    i');
          expect(cursor1.getBufferPosition()).toEqual([1, 24]);
          return expect(cursor2.getBufferPosition()).toEqual([2, 5]);
      });

        return describe('when at the end of the line', () =>
          it('deletes the next newline', function() {
            editor.setCursorBufferPosition([1, 30]);
            editor.deleteToEndOfLine();
            return expect(buffer.lineForRow(1)).toBe('  var sort = function(items) {    if (items.length <= 1) return items;');
          })
        );
      });

      return describe('when text is selected', () =>
        it('deletes only the text in the selection', function() {
          editor.setSelectedBufferRanges([[[1, 24], [1, 27]], [[2, 0], [2, 4]]]);
          editor.deleteToEndOfLine();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
          return expect(buffer.lineForRow(2)).toBe('if (items.length <= 1) return items;');
        })
      );
    });

    describe(".deleteToBeginningOfLine()", function() {
      describe("when no text is selected", function() {
        it("deletes all text between the cursor and the beginning of the line", function() {
          editor.setCursorBufferPosition([1, 24]);
          editor.addCursorAtBufferPosition([2, 5]);
          const [cursor1, cursor2] = Array.from(editor.getCursors());

          editor.deleteToBeginningOfLine();
          expect(buffer.lineForRow(1)).toBe('ems) {');
          expect(buffer.lineForRow(2)).toBe('f (items.length <= 1) return items;');
          expect(cursor1.getBufferPosition()).toEqual([1, 0]);
          return expect(cursor2.getBufferPosition()).toEqual([2, 0]);
      });

        return describe("when at the beginning of the line", () =>
          it("deletes the newline", function() {
            editor.setCursorBufferPosition([2]);
            editor.deleteToBeginningOfLine();
            return expect(buffer.lineForRow(1)).toBe('  var sort = function(items) {    if (items.length <= 1) return items;');
          })
        );
      });

      return describe("when text is selected", () =>
        it("still deletes all text to begginning of the line", function() {
          editor.setSelectedBufferRanges([[[1, 24], [1, 27]], [[2, 0], [2, 4]]]);
          editor.deleteToBeginningOfLine();
          expect(buffer.lineForRow(1)).toBe('ems) {');
          return expect(buffer.lineForRow(2)).toBe('    if (items.length <= 1) return items;');
        })
      );
    });

    describe(".delete()", function() {
      describe("when there is a single cursor", function() {
        describe("when the cursor is on the middle of a line", () =>
          it("deletes the character following the cursor", function() {
            editor.setCursorScreenPosition([1, 6]);
            editor.delete();
            return expect(buffer.lineForRow(1)).toBe('  var ort = function(items) {');
          })
        );

        describe("when the cursor is on the end of a line", () =>
          it("joins the line with the following line", function() {
            editor.setCursorScreenPosition([1, buffer.lineForRow(1).length]);
            editor.delete();
            return expect(buffer.lineForRow(1)).toBe('  var sort = function(items) {    if (items.length <= 1) return items;');
          })
        );

        describe("when the cursor is on the last column of the last line", () =>
          it("does nothing, but doesn't raise an error", function() {
            editor.setCursorScreenPosition([12, buffer.lineForRow(12).length]);
            editor.delete();
            return expect(buffer.lineForRow(12)).toBe('};');
          })
        );

        describe("when the cursor is before a fold", () =>
          it("only deletes the lines inside the fold", function() {
            editor.foldBufferRange([[3, 6], [4, 8]]);
            editor.setCursorScreenPosition([3, 6]);
            const cursorPositionBefore = editor.getCursorScreenPosition();

            editor.delete();

            expect(buffer.lineForRow(3)).toBe("    vae(items.length > 0) {");
            expect(buffer.lineForRow(4)).toBe("      current = items.shift();");
            return expect(editor.getCursorScreenPosition()).toEqual(cursorPositionBefore);
          })
        );

        describe("when the cursor is in the middle a line above a fold", () =>
          it("deletes as normal", function() {
            editor.foldBufferRow(4);
            editor.setCursorScreenPosition([3, 4]);
            const cursorPositionBefore = editor.getCursorScreenPosition();

            editor.delete();

            expect(buffer.lineForRow(3)).toBe("    ar pivot = items.shift(), current, left = [], right = [];");
            expect(editor.isFoldedAtScreenRow(4)).toBe(true);
            return expect(editor.getCursorScreenPosition()).toEqual([3, 4]);
        })
      );

        return describe("when the cursor is inside a fold", () =>
          it("removes the folded content after the cursor", function() {
            editor.foldBufferRange([[2, 6], [6, 21]]);
            editor.setCursorBufferPosition([4, 9]);

            editor.delete();

            expect(buffer.lineForRow(2)).toBe('    if (items.length <= 1) return items;');
            expect(buffer.lineForRow(3)).toBe('    var pivot = items.shift(), current, left = [], right = [];');
            expect(buffer.lineForRow(4)).toBe('    while ? left.push(current) : right.push(current);');
            expect(buffer.lineForRow(5)).toBe('    }');
            return expect(editor.getCursorBufferPosition()).toEqual([4, 9]);
        })
      );
    });

      describe("when there are multiple cursors", function() {
        describe("when cursors are on the same line", () =>
          it("removes the characters following each cursor", function() {
            editor.setCursorScreenPosition([3, 13]);
            editor.addCursorAtScreenPosition([3, 38]);

            editor.delete();

            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot= items.shift(), current left = [], right = [];");

            const [cursor1, cursor2] = Array.from(editor.getCursors());
            expect(cursor1.getBufferPosition()).toEqual([3, 13]);
            expect(cursor2.getBufferPosition()).toEqual([3, 37]);

            const [selection1, selection2] = Array.from(editor.getSelections());
            expect(selection1.isEmpty()).toBeTruthy();
            return expect(selection2.isEmpty()).toBeTruthy();
          })
        );

        return describe("when cursors are on different lines", function() {
          describe("when the cursors are in the middle of the lines", () =>
            it("removes the characters following each cursor", function() {
              editor.setCursorScreenPosition([3, 13]);
              editor.addCursorAtScreenPosition([4, 10]);

              editor.delete();

              expect(editor.lineTextForBufferRow(3)).toBe("    var pivot= items.shift(), current, left = [], right = [];");
              expect(editor.lineTextForBufferRow(4)).toBe("    while(tems.length > 0) {");

              const [cursor1, cursor2] = Array.from(editor.getCursors());
              expect(cursor1.getBufferPosition()).toEqual([3, 13]);
              expect(cursor2.getBufferPosition()).toEqual([4, 10]);

              const [selection1, selection2] = Array.from(editor.getSelections());
              expect(selection1.isEmpty()).toBeTruthy();
              return expect(selection2.isEmpty()).toBeTruthy();
            })
          );

          return describe("when the cursors are at the end of their lines", () =>
            it("removes the newlines following each cursor", function() {
              editor.setCursorScreenPosition([0, 29]);
              editor.addCursorAtScreenPosition([1, 30]);

              editor.delete();

              expect(editor.lineTextForBufferRow(0)).toBe("var quicksort = function () {  var sort = function(items) {    if (items.length <= 1) return items;");

              const [cursor1, cursor2] = Array.from(editor.getCursors());
              expect(cursor1.getBufferPosition()).toEqual([0, 29]);
              return expect(cursor2.getBufferPosition()).toEqual([0, 59]);
          })
        );
      });
    });

      describe("when there is a single selection", () =>
        it("deletes the selection, but not the character following it", function() {
          editor.setSelectedBufferRanges([[[1, 24], [1, 27]], [[2, 0], [2, 4]]]);
          editor.delete();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
          expect(buffer.lineForRow(2)).toBe('if (items.length <= 1) return items;');
          return expect(editor.getLastSelection().isEmpty()).toBeTruthy();
        })
      );

      return describe("when there are multiple selections", () =>
        describe("when selections are on the same line", () =>
          it("removes all selected text", function() {
            editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[0, 16], [0, 24]]]);
            editor.delete();
            return expect(editor.lineTextForBufferRow(0)).toBe('var  =  () {');
          })
        )
      );
    });

    describe(".deleteToEndOfWord()", function() {
      describe("when no text is selected", () =>
        it("deletes to the end of the word", function() {
          editor.setCursorBufferPosition([1, 24]);
          editor.addCursorAtBufferPosition([2, 5]);
          const [cursor1, cursor2] = Array.from(editor.getCursors());

          editor.deleteToEndOfWord();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
          expect(buffer.lineForRow(2)).toBe('    i (items.length <= 1) return items;');
          expect(cursor1.getBufferPosition()).toEqual([1, 24]);
          expect(cursor2.getBufferPosition()).toEqual([2, 5]);

          editor.deleteToEndOfWord();
          expect(buffer.lineForRow(1)).toBe('  var sort = function(it {');
          expect(buffer.lineForRow(2)).toBe('    iitems.length <= 1) return items;');
          expect(cursor1.getBufferPosition()).toEqual([1, 24]);
          return expect(cursor2.getBufferPosition()).toEqual([2, 5]);
      })
    );

      return describe("when text is selected", () =>
        it("deletes only selected text", function() {
          editor.setSelectedBufferRange([[1, 24], [1, 27]]);
          editor.deleteToEndOfWord();
          return expect(buffer.lineForRow(1)).toBe('  var sort = function(it) {');
        })
      );
    });

    describe(".indent()", function() {
      describe("when the selection is empty", function() {
        describe("when autoIndent is disabled", function() {
          describe("if 'softTabs' is true (the default)", function() {
            it("inserts 'tabLength' spaces into the buffer", function() {
              const tabRegex = new RegExp(`^[ ]{${editor.getTabLength()}}`);
              expect(buffer.lineForRow(0)).not.toMatch(tabRegex);
              editor.indent();
              return expect(buffer.lineForRow(0)).toMatch(tabRegex);
            });

            return it("respects the tab stops when cursor is in the middle of a tab", function() {
              editor.setTabLength(4);
              buffer.insert([12, 2], "\n ");
              editor.setCursorBufferPosition([13, 1]);
              editor.indent();
              expect(buffer.lineForRow(13)).toMatch(/^\s+$/);
              expect(buffer.lineForRow(13).length).toBe(4);
              expect(editor.getCursorBufferPosition()).toEqual([13, 4]);

              buffer.insert([13, 0], "  ");
              editor.setCursorBufferPosition([13, 6]);
              editor.indent();
              return expect(buffer.lineForRow(13).length).toBe(8);
            });
          });

          return describe("if 'softTabs' is false", () =>
            it("insert a \t into the buffer", function() {
              editor.setSoftTabs(false);
              expect(buffer.lineForRow(0)).not.toMatch(/^\t/);
              editor.indent();
              return expect(buffer.lineForRow(0)).toMatch(/^\t/);
            })
          );
        });

        return describe("when autoIndent is enabled", function() {
          describe("when the cursor's column is less than the suggested level of indentation", function() {
            describe("when 'softTabs' is true (the default)", function() {
              it("moves the cursor to the end of the leading whitespace and inserts enough whitespace to bring the line to the suggested level of indentaion", function() {
                buffer.insert([5, 0], "  \n");
                editor.setCursorBufferPosition([5, 0]);
                editor.indent({autoIndent: true});
                expect(buffer.lineForRow(5)).toMatch(/^\s+$/);
                expect(buffer.lineForRow(5).length).toBe(6);
                return expect(editor.getCursorBufferPosition()).toEqual([5, 6]);
            });

              return it("respects the tab stops when cursor is in the middle of a tab", function() {
                editor.setTabLength(4);
                buffer.insert([12, 2], "\n ");
                editor.setCursorBufferPosition([13, 1]);
                editor.indent({autoIndent: true});
                expect(buffer.lineForRow(13)).toMatch(/^\s+$/);
                expect(buffer.lineForRow(13).length).toBe(4);
                expect(editor.getCursorBufferPosition()).toEqual([13, 4]);

                buffer.insert([13, 0], "  ");
                editor.setCursorBufferPosition([13, 6]);
                editor.indent({autoIndent: true});
                return expect(buffer.lineForRow(13).length).toBe(8);
              });
            });

            return describe("when 'softTabs' is false", function() {
              it("moves the cursor to the end of the leading whitespace and inserts enough tabs to bring the line to the suggested level of indentaion", function() {
                convertToHardTabs(buffer);
                editor.setSoftTabs(false);
                buffer.insert([5, 0], "\t\n");
                editor.setCursorBufferPosition([5, 0]);
                editor.indent({autoIndent: true});
                expect(buffer.lineForRow(5)).toMatch(/^\t\t\t$/);
                return expect(editor.getCursorBufferPosition()).toEqual([5, 3]);
            });

              return describe("when the difference between the suggested level of indentation and the current level of indentation is greater than 0 but less than 1", () =>
                it("inserts one tab", function() {
                  editor.setSoftTabs(false);
                  buffer.setText(" \ntest");
                  editor.setCursorBufferPosition([1, 0]);

                  editor.indent({autoIndent: true});
                  expect(buffer.lineForRow(1)).toBe('\ttest');
                  return expect(editor.getCursorBufferPosition()).toEqual([1, 1]);
              })
            );
          });
        });

          return describe("when the line's indent level is greater than the suggested level of indentation", function() {
            describe("when 'softTabs' is true (the default)", () =>
              it("moves the cursor to the end of the leading whitespace and inserts 'tabLength' spaces into the buffer", function() {
                buffer.insert([7, 0], "      \n");
                editor.setCursorBufferPosition([7, 2]);
                editor.indent({autoIndent: true});
                expect(buffer.lineForRow(7)).toMatch(/^\s+$/);
                expect(buffer.lineForRow(7).length).toBe(8);
                return expect(editor.getCursorBufferPosition()).toEqual([7, 8]);
            })
          );

            return describe("when 'softTabs' is false", () =>
              it("moves the cursor to the end of the leading whitespace and inserts \t into the buffer", function() {
                convertToHardTabs(buffer);
                editor.setSoftTabs(false);
                buffer.insert([7, 0], "\t\t\t\n");
                editor.setCursorBufferPosition([7, 1]);
                editor.indent({autoIndent: true});
                expect(buffer.lineForRow(7)).toMatch(/^\t\t\t\t$/);
                return expect(editor.getCursorBufferPosition()).toEqual([7, 4]);
            })
          );
        });
      });
    });

      describe("when the selection is not empty", () =>
        it("indents the selected lines", function() {
          editor.setSelectedBufferRange([[0, 0], [10, 0]]);
          const selection = editor.getLastSelection();
          spyOn(selection, "indentSelectedRows");
          editor.indent();
          return expect(selection.indentSelectedRows).toHaveBeenCalled();
        })
      );

      return describe("if editor.softTabs is false", () =>
        it("inserts a tab character into the buffer", function() {
          editor.setSoftTabs(false);
          expect(buffer.lineForRow(0)).not.toMatch(/^\t/);
          editor.indent();
          expect(buffer.lineForRow(0)).toMatch(/^\t/);
          expect(editor.getCursorBufferPosition()).toEqual([0, 1]);
          expect(editor.getCursorScreenPosition()).toEqual([0, editor.getTabLength()]);

          editor.indent();
          expect(buffer.lineForRow(0)).toMatch(/^\t\t/);
          expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
          return expect(editor.getCursorScreenPosition()).toEqual([0, editor.getTabLength() * 2]);
      })
    );
  });

    describe("clipboard operations", function() {
      describe(".cutSelectedText()", function() {
        it("removes the selected text from the buffer and places it on the clipboard", function() {
          editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]]]);
          editor.cutSelectedText();
          expect(buffer.lineForRow(0)).toBe("var  = function () {");
          expect(buffer.lineForRow(1)).toBe("  var  = function(items) {");
          return expect(clipboard.readText()).toBe('quicksort\nsort');
        });

        describe("when no text is selected", function() {
          beforeEach(() =>
            editor.setSelectedBufferRanges([
              [[0, 0], [0, 0]],
              [[5, 0], [5, 0]],
            ])
          );

          return it("cuts the lines on which there are cursors", function() {
            editor.cutSelectedText();
            expect(buffer.getLineCount()).toBe(11);
            expect(buffer.lineForRow(1)).toBe("    if (items.length <= 1) return items;");
            expect(buffer.lineForRow(4)).toBe("      current < pivot ? left.push(current) : right.push(current);");
            return expect(atom.clipboard.read()).toEqual(`\
var quicksort = function () {

      current = items.shift();
\
`
            );
          });
        });

        return describe("when many selections get added in shuffle order", () =>
          it("cuts them in order", function() {
            editor.setSelectedBufferRanges([
              [[2, 8], [2, 13]],
              [[0, 4], [0, 13]],
              [[1, 6], [1, 10]],
            ]);
            editor.cutSelectedText();
            return expect(atom.clipboard.read()).toEqual(`\
quicksort
sort
items\
`
            );
          })
        );
      });

      describe(".cutToEndOfLine()", function() {
        describe("when soft wrap is on", () =>
          it("cuts up to the end of the line", function() {
            editor.setSoftWrapped(true);
            editor.setDefaultCharWidth(1);
            editor.setEditorWidthInChars(25);
            editor.setCursorScreenPosition([2, 6]);
            editor.cutToEndOfLine();
            return expect(editor.lineTextForScreenRow(2)).toBe('  var  function(items) {');
          })
        );

        return describe("when soft wrap is off", function() {
          describe("when nothing is selected", () =>
            it("cuts up to the end of the line", function() {
              editor.setCursorBufferPosition([2, 20]);
              editor.addCursorAtBufferPosition([3, 20]);
              editor.cutToEndOfLine();
              expect(buffer.lineForRow(2)).toBe('    if (items.length');
              expect(buffer.lineForRow(3)).toBe('    var pivot = item');
              return expect(atom.clipboard.read()).toBe(' <= 1) return items;\ns.shift(), current, left = [], right = [];');
            })
          );

          return describe("when text is selected", () =>
            it("only cuts the selected text, not to the end of the line", function() {
              editor.setSelectedBufferRanges([[[2, 20], [2, 30]], [[3, 20], [3, 20]]]);

              editor.cutToEndOfLine();

              expect(buffer.lineForRow(2)).toBe('    if (items.lengthurn items;');
              expect(buffer.lineForRow(3)).toBe('    var pivot = item');
              return expect(atom.clipboard.read()).toBe(' <= 1) ret\ns.shift(), current, left = [], right = [];');
            })
          );
        });
      });

      describe(".cutToEndOfBufferLine()", function() {
        beforeEach(function() {
          editor.setSoftWrapped(true);
          return editor.setEditorWidthInChars(10);
        });

        describe("when nothing is selected", () =>
          it("cuts up to the end of the buffer line", function() {
            editor.setCursorBufferPosition([2, 20]);
            editor.addCursorAtBufferPosition([3, 20]);

            editor.cutToEndOfBufferLine();

            expect(buffer.lineForRow(2)).toBe('    if (items.length');
            expect(buffer.lineForRow(3)).toBe('    var pivot = item');
            return expect(atom.clipboard.read()).toBe(' <= 1) return items;\ns.shift(), current, left = [], right = [];');
          })
        );

        return describe("when text is selected", () =>
          it("only cuts the selected text, not to the end of the buffer line", function() {
            editor.setSelectedBufferRanges([[[2, 20], [2, 30]], [[3, 20], [3, 20]]]);

            editor.cutToEndOfBufferLine();

            expect(buffer.lineForRow(2)).toBe('    if (items.lengthurn items;');
            expect(buffer.lineForRow(3)).toBe('    var pivot = item');
            return expect(atom.clipboard.read()).toBe(' <= 1) ret\ns.shift(), current, left = [], right = [];');
          })
        );
      });

      describe(".copySelectedText()", function() {
        it("copies selected text onto the clipboard", function() {
          editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]], [[2, 8], [2, 13]]]);

          editor.copySelectedText();
          expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
          expect(buffer.lineForRow(1)).toBe("  var sort = function(items) {");
          expect(buffer.lineForRow(2)).toBe("    if (items.length <= 1) return items;");
          expect(clipboard.readText()).toBe('quicksort\nsort\nitems');
          return expect(atom.clipboard.read()).toEqual(`\
quicksort
sort
items\
`
          );
        });

        describe("when no text is selected", function() {
          beforeEach(() =>
            editor.setSelectedBufferRanges([
              [[1, 5], [1, 5]],
              [[5, 8], [5, 8]]
            ])
          );

          return it("copies the lines on which there are cursors", function() {
            editor.copySelectedText();
            expect(atom.clipboard.read()).toEqual([
              "  var sort = function(items) {\n",
              "      current = items.shift();\n"
            ].join("\n"));
            return expect(editor.getSelectedBufferRanges()).toEqual([
              [[1, 5], [1, 5]],
              [[5, 8], [5, 8]]
            ]);
          });
        });

        return describe("when many selections get added in shuffle order", () =>
          it("copies them in order", function() {
            editor.setSelectedBufferRanges([
              [[2, 8], [2, 13]],
              [[0, 4], [0, 13]],
              [[1, 6], [1, 10]],
            ]);
            editor.copySelectedText();
            return expect(atom.clipboard.read()).toEqual(`\
quicksort
sort
items\
`
            );
          })
        );
      });

      describe(".copyOnlySelectedText()", function() {
        describe("when thee are multiple selections", () =>
          it("copies selected text onto the clipboard", function() {
            editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]], [[2, 8], [2, 13]]]);

            editor.copyOnlySelectedText();
            expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
            expect(buffer.lineForRow(1)).toBe("  var sort = function(items) {");
            expect(buffer.lineForRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(clipboard.readText()).toBe('quicksort\nsort\nitems');
            return expect(atom.clipboard.read()).toEqual(`\
quicksort
sort
items\
`
            );
          })
        );

        return describe("when no text is selected", () =>
          it("does not copy anything", function() {
            editor.setCursorBufferPosition([1, 5]);
            editor.copyOnlySelectedText();
            return expect(atom.clipboard.read()).toEqual("initial clipboard content");
          })
        );
      });

      return describe(".pasteText()", function() {
        const copyText = function(text, param) {
          if (param == null) { param = {}; }
          let {startColumn, textEditor} = param;
          if (startColumn == null) { startColumn = 0; }
          if (textEditor == null) { textEditor = editor; }
          textEditor.setCursorBufferPosition([0, 0]);
          textEditor.insertText(text);
          const numberOfNewlines = __guard__(text.match(/\n/g), x => x.length);
          const endColumn = __guard__(text.match(/[^\n]*$/)[0], x1 => x1.length);
          textEditor.getLastSelection().setBufferRange([[0, startColumn], [numberOfNewlines, endColumn]]);
          return textEditor.cutSelectedText();
        };

        it("pastes text into the buffer", function() {
          editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]]]);
          atom.clipboard.write('first');
          editor.pasteText();
          expect(editor.lineTextForBufferRow(0)).toBe("var first = function () {");
          return expect(editor.lineTextForBufferRow(1)).toBe("  var first = function(items) {");
        });

        it("notifies ::onWillInsertText observers", function() {
          const insertedStrings = [];
          editor.onWillInsertText(function({text, cancel}) {
            insertedStrings.push(text);
            return cancel();
          });

          atom.clipboard.write("hello");
          editor.pasteText();

          return expect(insertedStrings).toEqual(["hello"]);
      });

        it("notifies ::onDidInsertText observers", function() {
          const insertedStrings = [];
          editor.onDidInsertText(({text, range}) => insertedStrings.push(text));

          atom.clipboard.write("hello");
          editor.pasteText();

          return expect(insertedStrings).toEqual(["hello"]);
      });

        describe("when `autoIndentOnPaste` is true", function() {
          beforeEach(() => editor.update({autoIndentOnPaste: true}));

          describe("when pasting multiple lines before any non-whitespace characters", function() {
            it("auto-indents the lines spanned by the pasted text, based on the first pasted line", function() {
              atom.clipboard.write("a(x);\n  b(x);\n    c(x);\n", {indentBasis: 0});
              editor.setCursorBufferPosition([5, 0]);
              editor.pasteText();

              // Adjust the indentation of the pasted lines while preserving
              // their indentation relative to each other. Also preserve the
              // indentation of the following line.
              expect(editor.lineTextForBufferRow(5)).toBe("      a(x);");
              expect(editor.lineTextForBufferRow(6)).toBe("        b(x);");
              expect(editor.lineTextForBufferRow(7)).toBe("          c(x);");
              return expect(editor.lineTextForBufferRow(8)).toBe("      current = items.shift();");
            });

            return it("auto-indents lines with a mix of hard tabs and spaces without removing spaces", function() {
              editor.setSoftTabs(false);
              expect(editor.indentationForBufferRow(5)).toBe(3);

              atom.clipboard.write("/**\n\t * testing\n\t * indent\n\t **/\n", {indentBasis: 1});
              editor.setCursorBufferPosition([5, 0]);
              editor.pasteText();

              // Do not lose the alignment spaces
              expect(editor.lineTextForBufferRow(5)).toBe("\t\t\t/**");
              expect(editor.lineTextForBufferRow(6)).toBe("\t\t\t * testing");
              expect(editor.lineTextForBufferRow(7)).toBe("\t\t\t * indent");
              return expect(editor.lineTextForBufferRow(8)).toBe("\t\t\t **/");
            });
          });

          describe("when pasting line(s) above a line that matches the decreaseIndentPattern", () =>
            it("auto-indents based on the pasted line(s) only", function() {
              atom.clipboard.write("a(x);\n  b(x);\n    c(x);\n", {indentBasis: 0});
              editor.setCursorBufferPosition([7, 0]);
              editor.pasteText();

              expect(editor.lineTextForBufferRow(7)).toBe("      a(x);");
              expect(editor.lineTextForBufferRow(8)).toBe("        b(x);");
              expect(editor.lineTextForBufferRow(9)).toBe("          c(x);");
              return expect(editor.lineTextForBufferRow(10)).toBe("    }");
            })
          );

          describe("when pasting a line of text without line ending", () =>
            it("does not auto-indent the text", function() {
              atom.clipboard.write("a(x);", {indentBasis: 0});
              editor.setCursorBufferPosition([5, 0]);
              editor.pasteText();

              expect(editor.lineTextForBufferRow(5)).toBe("a(x);      current = items.shift();");
              return expect(editor.lineTextForBufferRow(6)).toBe("      current < pivot ? left.push(current) : right.push(current);");
            })
          );

          return describe("when pasting on a line after non-whitespace characters", () =>
            it("does not auto-indent the affected line", function() {
              // Before the paste, the indentation is non-standard.
              editor.setText(`\
if (x) {
    y();
}\
`
              );

              atom.clipboard.write(" z();\n h();");
              editor.setCursorBufferPosition([1, Infinity]);

              // The indentation of the non-standard line is unchanged.
              editor.pasteText();
              expect(editor.lineTextForBufferRow(1)).toBe("    y(); z();");
              return expect(editor.lineTextForBufferRow(2)).toBe(" h();");
            })
          );
        });

        describe("when `autoIndentOnPaste` is false", function() {
          beforeEach(() => editor.update({autoIndentOnPaste: false}));

          describe("when the cursor is indented further than the original copied text", () =>
            it("increases the indentation of the copied lines to match", function() {
              editor.setSelectedBufferRange([[1, 2], [3, 0]]);
              editor.copySelectedText();

              editor.setCursorBufferPosition([5, 6]);
              editor.pasteText();

              expect(editor.lineTextForBufferRow(5)).toBe("      var sort = function(items) {");
              return expect(editor.lineTextForBufferRow(6)).toBe("        if (items.length <= 1) return items;");
            })
          );

          describe("when the cursor is indented less far than the original copied text", () =>
            it("decreases the indentation of the copied lines to match", function() {
              editor.setSelectedBufferRange([[6, 6], [8, 0]]);
              editor.copySelectedText();

              editor.setCursorBufferPosition([1, 2]);
              editor.pasteText();

              expect(editor.lineTextForBufferRow(1)).toBe("  current < pivot ? left.push(current) : right.push(current);");
              return expect(editor.lineTextForBufferRow(2)).toBe("}");
            })
          );

          return describe("when the first copied line has leading whitespace", () =>
            it("preserves the line's leading whitespace", function() {
              editor.setSelectedBufferRange([[4, 0], [6, 0]]);
              editor.copySelectedText();

              editor.setCursorBufferPosition([0, 0]);
              editor.pasteText();

              expect(editor.lineTextForBufferRow(0)).toBe("    while(items.length > 0) {");
              return expect(editor.lineTextForBufferRow(1)).toBe("      current = items.shift();");
            })
          );
        });

        describe('when the clipboard has many selections', function() {
          beforeEach(function() {
            editor.update({autoIndentOnPaste: false});
            editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]]]);
            return editor.copySelectedText();
          });

          it("pastes each selection in order separately into the buffer", function() {
            editor.setSelectedBufferRanges([
              [[1, 6], [1, 10]],
              [[0, 4], [0, 13]],
            ]);

            editor.moveRight();
            editor.insertText("_");
            editor.pasteText();
            expect(editor.lineTextForBufferRow(0)).toBe("var quicksort_quicksort = function () {");
            return expect(editor.lineTextForBufferRow(1)).toBe("  var sort_sort = function(items) {");
          });

          return describe('and the selections count does not match', function() {
            beforeEach(() => editor.setSelectedBufferRanges([[[0, 4], [0, 13]]]));

            return it("pastes the whole text into the buffer", function() {
              editor.pasteText();
              expect(editor.lineTextForBufferRow(0)).toBe("var quicksort");
              return expect(editor.lineTextForBufferRow(1)).toBe("sort = function () {");
            });
          });
        });

        describe("when a full line was cut", function() {
          beforeEach(function() {
            editor.setCursorBufferPosition([2, 13]);
            editor.cutSelectedText();
            return editor.setCursorBufferPosition([2, 13]);
          });

          return it("pastes the line above the cursor and retains the cursor's column", function() {
            editor.pasteText();
            expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
            expect(editor.lineTextForBufferRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");
            return expect(editor.getCursorBufferPosition()).toEqual([3, 13]);
          });
        });

        return describe("when a full line was copied", function() {
          beforeEach(function() {
            editor.setCursorBufferPosition([2, 13]);
            return editor.copySelectedText();
          });

          describe("when there is a selection", () =>
            it("overwrites the selection as with any copied text", function() {
              editor.setSelectedBufferRange([[1, 2], [1, Infinity]]);
              editor.pasteText();
              expect(editor.lineTextForBufferRow(1)).toBe("  if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(2)).toBe("");
              expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
              return expect(editor.getCursorBufferPosition()).toEqual([2, 0]);
            })
          );

          return describe("when there is no selection", () =>
            it("pastes the line above the cursor and retains the cursor's column", function() {
              editor.pasteText();
              expect(editor.lineTextForBufferRow(2)).toBe("    if (items.length <= 1) return items;");
              expect(editor.lineTextForBufferRow(3)).toBe("    if (items.length <= 1) return items;");
              return expect(editor.getCursorBufferPosition()).toEqual([3, 13]);
            })
          );
        });
      });
    });

    describe(".indentSelectedRows()", function() {
      describe("when nothing is selected", function() {
        describe("when softTabs is enabled", () =>
          it("indents line and retains selection", function() {
            editor.setSelectedBufferRange([[0, 3], [0, 3]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(0)).toBe("  var quicksort = function () {");
            return expect(editor.getSelectedBufferRange()).toEqual([[0, 3 + editor.getTabLength()], [0, 3 + editor.getTabLength()]]);
        })
      );

        return describe("when softTabs is disabled", () =>
          it("indents line and retains selection", function() {
            convertToHardTabs(buffer);
            editor.setSoftTabs(false);
            editor.setSelectedBufferRange([[0, 3], [0, 3]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(0)).toBe("\tvar quicksort = function () {");
            return expect(editor.getSelectedBufferRange()).toEqual([[0, 3 + 1], [0, 3 + 1]]);
        })
      );
    });

      describe("when one line is selected", function() {
        describe("when softTabs is enabled", () =>
          it("indents line and retains selection", function() {
            editor.setSelectedBufferRange([[0, 4], [0, 14]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(0)).toBe(`${editor.getTabText()}var quicksort = function () {`);
            return expect(editor.getSelectedBufferRange()).toEqual([[0, 4 + editor.getTabLength()], [0, 14 + editor.getTabLength()]]);
        })
      );

        return describe("when softTabs is disabled", () =>
          it("indents line and retains selection", function() {
            convertToHardTabs(buffer);
            editor.setSoftTabs(false);
            editor.setSelectedBufferRange([[0, 4], [0, 14]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(0)).toBe("\tvar quicksort = function () {");
            return expect(editor.getSelectedBufferRange()).toEqual([[0, 4 + 1], [0, 14 + 1]]);
        })
      );
    });

      return describe("when multiple lines are selected", function() {
        describe("when softTabs is enabled", function() {
          it("indents selected lines (that are not empty) and retains selection", function() {
            editor.setSelectedBufferRange([[9, 1], [11, 15]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(9)).toBe("    };");
            expect(buffer.lineForRow(10)).toBe("");
            expect(buffer.lineForRow(11)).toBe("    return sort(Array.apply(this, arguments));");
            return expect(editor.getSelectedBufferRange()).toEqual([[9, 1 + editor.getTabLength()], [11, 15 + editor.getTabLength()]]);
        });

          return it("does not indent the last row if the selection ends at column 0", function() {
            editor.setSelectedBufferRange([[9, 1], [11, 0]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(9)).toBe("    };");
            expect(buffer.lineForRow(10)).toBe("");
            expect(buffer.lineForRow(11)).toBe("  return sort(Array.apply(this, arguments));");
            return expect(editor.getSelectedBufferRange()).toEqual([[9, 1 + editor.getTabLength()], [11, 0]]);
        });
      });

        return describe("when softTabs is disabled", () =>
          it("indents selected lines (that are not empty) and retains selection", function() {
            convertToHardTabs(buffer);
            editor.setSoftTabs(false);
            editor.setSelectedBufferRange([[9, 1], [11, 15]]);
            editor.indentSelectedRows();
            expect(buffer.lineForRow(9)).toBe("\t\t};");
            expect(buffer.lineForRow(10)).toBe("");
            expect(buffer.lineForRow(11)).toBe("\t\treturn sort(Array.apply(this, arguments));");
            return expect(editor.getSelectedBufferRange()).toEqual([[9, 1 + 1], [11, 15 + 1]]);
        })
      );
    });
  });

    describe(".outdentSelectedRows()", function() {
      describe("when nothing is selected", function() {
        it("outdents line and retains selection", function() {
          editor.setSelectedBufferRange([[1, 3], [1, 3]]);
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(1)).toBe("var sort = function(items) {");
          return expect(editor.getSelectedBufferRange()).toEqual([[1, 3 - editor.getTabLength()], [1, 3 - editor.getTabLength()]]);
      });

        it("outdents when indent is less than a tab length", function() {
          editor.insertText(' ');
          editor.outdentSelectedRows();
          return expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
        });

        it("outdents a single hard tab when indent is multiple hard tabs and and the session is using soft tabs", function() {
          editor.insertText('\t\t');
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe("\tvar quicksort = function () {");
          editor.outdentSelectedRows();
          return expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
        });

        it("outdents when a mix of hard tabs and soft tabs are used", function() {
          editor.insertText('\t   ');
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe("   var quicksort = function () {");
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe(" var quicksort = function () {");
          editor.outdentSelectedRows();
          return expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
        });

        return it("outdents only up to the first non-space non-tab character", function() {
          editor.insertText(' \tfoo\t ');
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe("\tfoo\t var quicksort = function () {");
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe("foo\t var quicksort = function () {");
          editor.outdentSelectedRows();
          return expect(buffer.lineForRow(0)).toBe("foo\t var quicksort = function () {");
        });
      });

      describe("when one line is selected", () =>
        it("outdents line and retains editor", function() {
          editor.setSelectedBufferRange([[1, 4], [1, 14]]);
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(1)).toBe("var sort = function(items) {");
          return expect(editor.getSelectedBufferRange()).toEqual([[1, 4 - editor.getTabLength()], [1, 14 - editor.getTabLength()]]);
      })
    );

      return describe("when multiple lines are selected", function() {
        it("outdents selected lines and retains editor", function() {
          editor.setSelectedBufferRange([[0, 1], [3, 15]]);
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
          expect(buffer.lineForRow(1)).toBe("var sort = function(items) {");
          expect(buffer.lineForRow(2)).toBe("  if (items.length <= 1) return items;");
          expect(buffer.lineForRow(3)).toBe("  var pivot = items.shift(), current, left = [], right = [];");
          return expect(editor.getSelectedBufferRange()).toEqual([[0, 1], [3, 15 - editor.getTabLength()]]);
      });

        return it("does not outdent the last line of the selection if it ends at column 0", function() {
          editor.setSelectedBufferRange([[0, 1], [3, 0]]);
          editor.outdentSelectedRows();
          expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
          expect(buffer.lineForRow(1)).toBe("var sort = function(items) {");
          expect(buffer.lineForRow(2)).toBe("  if (items.length <= 1) return items;");
          expect(buffer.lineForRow(3)).toBe("    var pivot = items.shift(), current, left = [], right = [];");

          return expect(editor.getSelectedBufferRange()).toEqual([[0, 1], [3, 0]]);
      });
    });
  });

    describe(".autoIndentSelectedRows", () =>
      it("auto-indents the selection", function() {
        editor.setCursorBufferPosition([2, 0]);
        editor.insertText("function() {\ninside=true\n}\n  i=1\n");
        editor.getLastSelection().setBufferRange([[2, 0], [6, 0]]);
        editor.autoIndentSelectedRows();

        expect(editor.lineTextForBufferRow(2)).toBe("    function() {");
        expect(editor.lineTextForBufferRow(3)).toBe("      inside=true");
        expect(editor.lineTextForBufferRow(4)).toBe("    }");
        return expect(editor.lineTextForBufferRow(5)).toBe("    i=1");
      })
    );

    describe(".toggleLineCommentsInSelection()", function() {
      it("toggles comments on the selected lines", function() {
        editor.setSelectedBufferRange([[4, 5], [7, 5]]);
        editor.toggleLineCommentsInSelection();

        expect(buffer.lineForRow(4)).toBe("    // while(items.length > 0) {");
        expect(buffer.lineForRow(5)).toBe("    //   current = items.shift();");
        expect(buffer.lineForRow(6)).toBe("    //   current < pivot ? left.push(current) : right.push(current);");
        expect(buffer.lineForRow(7)).toBe("    // }");
        expect(editor.getSelectedBufferRange()).toEqual([[4, 8], [7, 8]]);

        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(4)).toBe("    while(items.length > 0) {");
        expect(buffer.lineForRow(5)).toBe("      current = items.shift();");
        expect(buffer.lineForRow(6)).toBe("      current < pivot ? left.push(current) : right.push(current);");
        return expect(buffer.lineForRow(7)).toBe("    }");
      });

      it("does not comment the last line of a non-empty selection if it ends at column 0", function() {
        editor.setSelectedBufferRange([[4, 5], [7, 0]]);
        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(4)).toBe("    // while(items.length > 0) {");
        expect(buffer.lineForRow(5)).toBe("    //   current = items.shift();");
        expect(buffer.lineForRow(6)).toBe("    //   current < pivot ? left.push(current) : right.push(current);");
        return expect(buffer.lineForRow(7)).toBe("    }");
      });

      it("uncomments lines if all lines match the comment regex", function() {
        editor.setSelectedBufferRange([[0, 0], [0, 1]]);
        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(0)).toBe("// var quicksort = function () {");

        editor.setSelectedBufferRange([[0, 0], [2, Infinity]]);
        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(0)).toBe("// // var quicksort = function () {");
        expect(buffer.lineForRow(1)).toBe("//   var sort = function(items) {");
        expect(buffer.lineForRow(2)).toBe("//     if (items.length <= 1) return items;");

        editor.setSelectedBufferRange([[0, 0], [2, Infinity]]);
        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(0)).toBe("// var quicksort = function () {");
        expect(buffer.lineForRow(1)).toBe("  var sort = function(items) {");
        expect(buffer.lineForRow(2)).toBe("    if (items.length <= 1) return items;");

        editor.setSelectedBufferRange([[0, 0], [0, Infinity]]);
        editor.toggleLineCommentsInSelection();
        return expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
      });

      it("uncomments commented lines separated by an empty line", function() {
        editor.setSelectedBufferRange([[0, 0], [1, Infinity]]);
        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(0)).toBe("// var quicksort = function () {");
        expect(buffer.lineForRow(1)).toBe("//   var sort = function(items) {");

        buffer.insert([0, Infinity], '\n');

        editor.setSelectedBufferRange([[0, 0], [2, Infinity]]);
        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
        expect(buffer.lineForRow(1)).toBe("");
        return expect(buffer.lineForRow(2)).toBe("  var sort = function(items) {");
      });

      it("preserves selection emptiness", function() {
        editor.setCursorBufferPosition([4, 0]);
        editor.toggleLineCommentsInSelection();
        return expect(editor.getLastSelection().isEmpty()).toBeTruthy();
      });

      it("does not explode if the current language mode has no comment regex", function() {
        editor = new TextEditor({buffer: new TextBuffer({text: 'hello'})});
        editor.setSelectedBufferRange([[0, 0], [0, 5]]);
        editor.toggleLineCommentsInSelection();
        return expect(editor.lineTextForBufferRow(0)).toBe("hello");
      });

      it("does nothing for empty lines and null grammar", () =>
        runs(function() {
          editor.setGrammar(atom.grammars.grammarForScopeName('text.plain.null-grammar'));
          editor.setCursorBufferPosition([10, 0]);
          editor.toggleLineCommentsInSelection();
          return expect(editor.buffer.lineForRow(10)).toBe("");
        })
      );

      it("uncomments when the line lacks the trailing whitespace in the comment regex", function() {
        editor.setCursorBufferPosition([10, 0]);
        editor.toggleLineCommentsInSelection();

        expect(buffer.lineForRow(10)).toBe("// ");
        expect(editor.getSelectedBufferRange()).toEqual([[10, 3], [10, 3]]);
        editor.backspace();
        expect(buffer.lineForRow(10)).toBe("//");

        editor.toggleLineCommentsInSelection();
        expect(buffer.lineForRow(10)).toBe("");
        return expect(editor.getSelectedBufferRange()).toEqual([[10, 0], [10, 0]]);
    });

      return it("uncomments when the line has leading whitespace", function() {
        editor.setCursorBufferPosition([10, 0]);
        editor.toggleLineCommentsInSelection();

        expect(buffer.lineForRow(10)).toBe("// ");
        editor.moveToBeginningOfLine();
        editor.insertText("  ");
        editor.setSelectedBufferRange([[10, 0], [10, 0]]);
        editor.toggleLineCommentsInSelection();
        return expect(buffer.lineForRow(10)).toBe("  ");
      });
    });

    describe(".undo() and .redo()", function() {
      it("undoes/redoes the last change", function() {
        editor.insertText("foo");
        editor.undo();
        expect(buffer.lineForRow(0)).not.toContain("foo");

        editor.redo();
        return expect(buffer.lineForRow(0)).toContain("foo");
      });

      it("batches the undo / redo of changes caused by multiple cursors", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.addCursorAtScreenPosition([1, 0]);

        editor.insertText("foo");
        editor.backspace();

        expect(buffer.lineForRow(0)).toContain("fovar");
        expect(buffer.lineForRow(1)).toContain("fo ");

        editor.undo();

        expect(buffer.lineForRow(0)).toContain("foo");
        expect(buffer.lineForRow(1)).toContain("foo");

        editor.redo();

        expect(buffer.lineForRow(0)).not.toContain("foo");
        return expect(buffer.lineForRow(0)).toContain("fovar");
      });

      it("restores cursors and selections to their states before and after undone and redone changes", function() {
        editor.setSelectedBufferRanges([
          [[0, 0], [0, 0]],
          [[1, 0], [1, 3]],
        ]);
        editor.insertText("abc");

        expect(editor.getSelectedBufferRanges()).toEqual([
          [[0, 3], [0, 3]],
          [[1, 3], [1, 3]]
        ]);

        editor.setCursorBufferPosition([0, 0]);
        editor.setSelectedBufferRanges([
          [[2, 0], [2, 0]],
          [[3, 0], [3, 0]],
          [[4, 0], [4, 3]],
        ]);
        editor.insertText("def");

        expect(editor.getSelectedBufferRanges()).toEqual([
          [[2, 3], [2, 3]],
          [[3, 3], [3, 3]],
          [[4, 3], [4, 3]]
        ]);

        editor.setCursorBufferPosition([0, 0]);
        editor.undo();

        expect(editor.getSelectedBufferRanges()).toEqual([
          [[2, 0], [2, 0]],
          [[3, 0], [3, 0]],
          [[4, 0], [4, 3]],
        ]);

        editor.undo();

        expect(editor.getSelectedBufferRanges()).toEqual([
          [[0, 0], [0, 0]],
          [[1, 0], [1, 3]]
        ]);

        editor.redo();

        expect(editor.getSelectedBufferRanges()).toEqual([
          [[0, 3], [0, 3]],
          [[1, 3], [1, 3]]
        ]);

        editor.redo();

        return expect(editor.getSelectedBufferRanges()).toEqual([
          [[2, 3], [2, 3]],
          [[3, 3], [3, 3]],
          [[4, 3], [4, 3]]
        ]);
    });

      it("restores the selected ranges after undo and redo", function() {
        editor.setSelectedBufferRanges([[[1, 6], [1, 10]], [[1, 22], [1, 27]]]);
        editor.delete();
        editor.delete();

        const selections = editor.getSelections();
        expect(buffer.lineForRow(1)).toBe('  var = function( {');

        expect(editor.getSelectedBufferRanges()).toEqual([[[1, 6], [1, 6]], [[1, 17], [1, 17]]]);

        editor.undo();
        expect(editor.getSelectedBufferRanges()).toEqual([[[1, 6], [1, 6]], [[1, 18], [1, 18]]]);

        editor.undo();
        expect(editor.getSelectedBufferRanges()).toEqual([[[1, 6], [1, 10]], [[1, 22], [1, 27]]]);

        editor.redo();
        return expect(editor.getSelectedBufferRanges()).toEqual([[[1, 6], [1, 6]], [[1, 18], [1, 18]]]);
    });

      return xit("restores folds after undo and redo", function() {
        editor.foldBufferRow(1);
        editor.setSelectedBufferRange([[1, 0], [10, Infinity]], {preserveFolds: true});
        expect(editor.isFoldedAtBufferRow(1)).toBeTruthy();

        editor.insertText(`\
\  // testing
  function foo() {
    return 1 + 2;
  }\
`
        );
        expect(editor.isFoldedAtBufferRow(1)).toBeFalsy();
        editor.foldBufferRow(2);

        editor.undo();
        expect(editor.isFoldedAtBufferRow(1)).toBeTruthy();
        expect(editor.isFoldedAtBufferRow(9)).toBeTruthy();
        expect(editor.isFoldedAtBufferRow(10)).toBeFalsy();

        editor.redo();
        expect(editor.isFoldedAtBufferRow(1)).toBeFalsy();
        return expect(editor.isFoldedAtBufferRow(2)).toBeTruthy();
      });
    });

    describe("::transact", () =>
      it("restores the selection when the transaction is undone/redone", function() {
        buffer.setText('1234');
        editor.setSelectedBufferRange([[0, 1], [0, 3]]);

        editor.transact(function() {
          editor.delete();
          editor.moveToEndOfLine();
          editor.insertText('5');
          return expect(buffer.getText()).toBe('145');
        });

        editor.undo();
        expect(buffer.getText()).toBe('1234');
        expect(editor.getSelectedBufferRange()).toEqual([[0, 1], [0, 3]]);

        editor.redo();
        expect(buffer.getText()).toBe('145');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 3], [0, 3]]);
    })
  );

    describe("when the buffer is changed (via its direct api, rather than via than edit session)", function() {
      it("moves the cursor so it is in the same relative position of the buffer", function() {
        expect(editor.getCursorScreenPosition()).toEqual([0, 0]);
        editor.addCursorAtScreenPosition([0, 5]);
        editor.addCursorAtScreenPosition([1, 0]);
        const [cursor1, cursor2, cursor3] = Array.from(editor.getCursors());

        buffer.insert([0, 1], 'abc');

        expect(cursor1.getScreenPosition()).toEqual([0, 0]);
        expect(cursor2.getScreenPosition()).toEqual([0, 8]);
        return expect(cursor3.getScreenPosition()).toEqual([1, 0]);
    });

      it("does not destroy cursors or selections when a change encompasses them", function() {
        const cursor = editor.getLastCursor();
        cursor.setBufferPosition([3, 3]);
        editor.buffer.delete([[3, 1], [3, 5]]);
        expect(cursor.getBufferPosition()).toEqual([3, 1]);
        expect(editor.getCursors().indexOf(cursor)).not.toBe(-1);

        const selection = editor.getLastSelection();
        selection.setBufferRange([[3, 5], [3, 10]]);
        editor.buffer.delete([[3, 3], [3, 8]]);
        expect(selection.getBufferRange()).toEqual([[3, 3], [3, 5]]);
        return expect(editor.getSelections().indexOf(selection)).not.toBe(-1);
      });

      return it("merges cursors when the change causes them to overlap", function() {
        editor.setCursorScreenPosition([0, 0]);
        editor.addCursorAtScreenPosition([0, 2]);
        editor.addCursorAtScreenPosition([1, 2]);

        const [cursor1, cursor2, cursor3] = Array.from(editor.getCursors());
        expect(editor.getCursors().length).toBe(3);

        buffer.delete([[0, 0], [0, 2]]);

        expect(editor.getCursors().length).toBe(2);
        expect(editor.getCursors()).toEqual([cursor1, cursor3]);
        expect(cursor1.getBufferPosition()).toEqual([0, 0]);
        return expect(cursor3.getBufferPosition()).toEqual([1, 2]);
    });
  });

    describe(".moveSelectionLeft()", function() {
      it("moves one active selection on one line one column to the left", function() {
        editor.setSelectedBufferRange([[0, 4], [0, 13]]);
        expect(editor.getSelectedText()).toBe('quicksort');

        editor.moveSelectionLeft();

        expect(editor.getSelectedText()).toBe('quicksort');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 3], [0, 12]]);
    });

      it("moves multiple active selections on one line one column to the left", function() {
        editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[0, 16], [0, 24]]]);
        const selections = editor.getSelections();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('function');

        editor.moveSelectionLeft();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('function');
        return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 3], [0, 12]], [[0, 15], [0, 23]]]);
    });

      it("moves multiple active selections on multiple lines one column to the left", function() {
        editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]]]);
        const selections = editor.getSelections();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('sort');

        editor.moveSelectionLeft();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('sort');
        return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 3], [0, 12]], [[1, 5], [1, 9]]]);
    });

      return describe("when a selection is at the first column of a line", function() {
        it("does not change the selection", function() {
          editor.setSelectedBufferRanges([[[0, 0], [0, 3]], [[1, 0], [1, 3]]]);
          const selections = editor.getSelections();

          expect(selections[0].getText()).toBe('var');
          expect(selections[1].getText()).toBe('  v');

          editor.moveSelectionLeft();
          editor.moveSelectionLeft();

          expect(selections[0].getText()).toBe('var');
          expect(selections[1].getText()).toBe('  v');
          return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [0, 3]], [[1, 0], [1, 3]]]);
      });

        return describe("when multiple selections are active on one line", () =>
          it("does not change the selection", function() {
            editor.setSelectedBufferRanges([[[0, 0], [0, 3]], [[0, 4], [0, 13]]]);
            const selections = editor.getSelections();

            expect(selections[0].getText()).toBe('var');
            expect(selections[1].getText()).toBe('quicksort');

            editor.moveSelectionLeft();

            expect(selections[0].getText()).toBe('var');
            expect(selections[1].getText()).toBe('quicksort');
            return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [0, 3]], [[0, 4], [0, 13]]]);
        })
      );
    });
  });

    return describe(".moveSelectionRight()", function() {
      it("moves one active selection on one line one column to the right", function() {
        editor.setSelectedBufferRange([[0, 4], [0, 13]]);
        expect(editor.getSelectedText()).toBe('quicksort');

        editor.moveSelectionRight();

        expect(editor.getSelectedText()).toBe('quicksort');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 5], [0, 14]]);
    });

      it("moves multiple active selections on one line one column to the right", function() {
        editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[0, 16], [0, 24]]]);
        const selections = editor.getSelections();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('function');

        editor.moveSelectionRight();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('function');
        return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 5], [0, 14]], [[0, 17], [0, 25]]]);
    });

      it("moves multiple active selections on multiple lines one column to the right", function() {
        editor.setSelectedBufferRanges([[[0, 4], [0, 13]], [[1, 6], [1, 10]]]);
        const selections = editor.getSelections();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('sort');

        editor.moveSelectionRight();

        expect(selections[0].getText()).toBe('quicksort');
        expect(selections[1].getText()).toBe('sort');
        return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 5], [0, 14]], [[1, 7], [1, 11]]]);
    });

      return describe("when a selection is at the last column of a line", function() {
        it("does not change the selection", function() {
          editor.setSelectedBufferRanges([[[2, 34], [2, 40]], [[5, 22], [5, 30]]]);
          const selections = editor.getSelections();

          expect(selections[0].getText()).toBe('items;');
          expect(selections[1].getText()).toBe('shift();');

          editor.moveSelectionRight();
          editor.moveSelectionRight();

          expect(selections[0].getText()).toBe('items;');
          expect(selections[1].getText()).toBe('shift();');
          return expect(editor.getSelectedBufferRanges()).toEqual([[[2, 34], [2, 40]], [[5, 22], [5, 30]]]);
      });

        return describe("when multiple selections are active on one line", () =>
          it("does not change the selection", function() {
            editor.setSelectedBufferRanges([[[2, 27], [2, 33]], [[2, 34], [2, 40]]]);
            const selections = editor.getSelections();

            expect(selections[0].getText()).toBe('return');
            expect(selections[1].getText()).toBe('items;');

            editor.moveSelectionRight();

            expect(selections[0].getText()).toBe('return');
            expect(selections[1].getText()).toBe('items;');
            return expect(editor.getSelectedBufferRanges()).toEqual([[[2, 27], [2, 33]], [[2, 34], [2, 40]]]);
        })
      );
    });
  });
});

  describe('reading text', () =>
    it('.lineTextForScreenRow(row)', function() {
      editor.foldBufferRow(4);
      expect(editor.lineTextForScreenRow(5)).toEqual('    return sort(left).concat(pivot).concat(sort(right));');
      expect(editor.lineTextForScreenRow(9)).toEqual('};');
      return expect(editor.lineTextForScreenRow(10)).toBeUndefined();
    })
  );

  describe(".deleteLine()", function() {
    it("deletes the first line when the cursor is there", function() {
      editor.getLastCursor().moveToTop();
      const line1 = buffer.lineForRow(1);
      const count = buffer.getLineCount();
      expect(buffer.lineForRow(0)).not.toBe(line1);
      editor.deleteLine();
      expect(buffer.lineForRow(0)).toBe(line1);
      return expect(buffer.getLineCount()).toBe(count - 1);
    });

    it("deletes the last line when the cursor is there", function() {
      const count = buffer.getLineCount();
      const secondToLastLine = buffer.lineForRow(count - 2);
      expect(buffer.lineForRow(count - 1)).not.toBe(secondToLastLine);
      editor.getLastCursor().moveToBottom();
      editor.deleteLine();
      const newCount = buffer.getLineCount();
      expect(buffer.lineForRow(newCount - 1)).toBe(secondToLastLine);
      return expect(newCount).toBe(count - 1);
    });

    it("deletes whole lines when partial lines are selected", function() {
      editor.setSelectedBufferRange([[0, 2], [1, 2]]);
      const line2 = buffer.lineForRow(2);
      const count = buffer.getLineCount();
      expect(buffer.lineForRow(0)).not.toBe(line2);
      expect(buffer.lineForRow(1)).not.toBe(line2);
      editor.deleteLine();
      expect(buffer.lineForRow(0)).toBe(line2);
      return expect(buffer.getLineCount()).toBe(count - 2);
    });

    it("deletes a line only once when multiple selections are on the same line", function() {
      const line1 = buffer.lineForRow(1);
      const count = buffer.getLineCount();
      editor.setSelectedBufferRanges([
        [[0, 1], [0, 2]],
        [[0, 4], [0, 5]]
      ]);
      expect(buffer.lineForRow(0)).not.toBe(line1);

      editor.deleteLine();

      expect(buffer.lineForRow(0)).toBe(line1);
      return expect(buffer.getLineCount()).toBe(count - 1);
    });

    it("only deletes first line if only newline is selected on second line", function() {
      editor.setSelectedBufferRange([[0, 2], [1, 0]]);
      const line1 = buffer.lineForRow(1);
      const count = buffer.getLineCount();
      expect(buffer.lineForRow(0)).not.toBe(line1);
      editor.deleteLine();
      expect(buffer.lineForRow(0)).toBe(line1);
      return expect(buffer.getLineCount()).toBe(count - 1);
    });

    it("deletes the entire region when invoke on a folded region", function() {
      editor.foldBufferRow(1);
      editor.getLastCursor().moveToTop();
      editor.getLastCursor().moveDown();
      expect(buffer.getLineCount()).toBe(13);
      editor.deleteLine();
      return expect(buffer.getLineCount()).toBe(4);
    });

    it("deletes the entire file from the bottom up", function() {
      const count = buffer.getLineCount();
      expect(count).toBeGreaterThan(0);
      for (let i = 0, end = count, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        editor.getLastCursor().moveToBottom();
        editor.deleteLine();
      }
      expect(buffer.getLineCount()).toBe(1);
      return expect(buffer.getText()).toBe('');
    });

    it("deletes the entire file from the top down", function() {
      const count = buffer.getLineCount();
      expect(count).toBeGreaterThan(0);
      for (let i = 0, end = count, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        editor.getLastCursor().moveToTop();
        editor.deleteLine();
      }
      expect(buffer.getLineCount()).toBe(1);
      return expect(buffer.getText()).toBe('');
    });

    describe("when soft wrap is enabled", () =>
      it("deletes the entire line that the cursor is on", function() {
        editor.setSoftWrapped(true);
        editor.setEditorWidthInChars(10);
        editor.setCursorBufferPosition([6]);

        const line7 = buffer.lineForRow(7);
        const count = buffer.getLineCount();
        expect(buffer.lineForRow(6)).not.toBe(line7);
        editor.deleteLine();
        expect(buffer.lineForRow(6)).toBe(line7);
        return expect(buffer.getLineCount()).toBe(count - 1);
      })
    );

    return describe("when the line being deleted preceeds a fold, and the command is undone", () =>
      it("restores the line and preserves the fold", function() {
        editor.setCursorBufferPosition([4]);
        editor.foldCurrentRow();
        expect(editor.isFoldedAtScreenRow(4)).toBeTruthy();
        editor.setCursorBufferPosition([3]);
        editor.deleteLine();
        expect(editor.isFoldedAtScreenRow(3)).toBeTruthy();
        expect(buffer.lineForRow(3)).toBe('    while(items.length > 0) {');
        editor.undo();
        expect(editor.isFoldedAtScreenRow(4)).toBeTruthy();
        return expect(buffer.lineForRow(3)).toBe('    var pivot = items.shift(), current, left = [], right = [];');
      })
    );
  });

  describe(".replaceSelectedText(options, fn)", function() {
    describe("when no text is selected", () =>
      it("inserts the text returned from the function at the cursor position", function() {
        editor.replaceSelectedText({}, () => '123');
        expect(buffer.lineForRow(0)).toBe('123var quicksort = function () {');

        editor.setCursorBufferPosition([0]);
        editor.replaceSelectedText({selectWordIfEmpty: true}, () => 'var');
        expect(buffer.lineForRow(0)).toBe('var quicksort = function () {');

        editor.setCursorBufferPosition([10]);
        editor.replaceSelectedText(null, () => '');
        return expect(buffer.lineForRow(10)).toBe('');
      })
    );

    return describe("when text is selected", function() {
      it("replaces the selected text with the text returned from the function", function() {
        editor.setSelectedBufferRange([[0, 1], [0, 3]]);
        editor.replaceSelectedText({}, () => 'ia');
        return expect(buffer.lineForRow(0)).toBe('via quicksort = function () {');
      });

      return it("replaces the selected text and selects the replacement text", function() {
        editor.setSelectedBufferRange([[0, 4], [0, 9]]);
        editor.replaceSelectedText({}, () => 'whatnot');
        expect(buffer.lineForRow(0)).toBe('var whatnotsort = function () {');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 4], [0, 11]]);
    });
  });
});

  describe(".transpose()", function() {
    it("swaps two characters", function() {
      editor.buffer.setText("abc");
      editor.setCursorScreenPosition([0, 1]);
      editor.transpose();
      return expect(editor.lineTextForBufferRow(0)).toBe('bac');
    });

    return it("reverses a selection", function() {
      editor.buffer.setText("xabcz");
      editor.setSelectedBufferRange([[0, 1], [0, 4]]);
      editor.transpose();
      return expect(editor.lineTextForBufferRow(0)).toBe('xcbaz');
    });
  });

  describe(".upperCase()", function() {
    describe("when there is no selection", () =>
      it("upper cases the current word", function() {
        editor.buffer.setText("aBc");
        editor.setCursorScreenPosition([0, 1]);
        editor.upperCase();
        expect(editor.lineTextForBufferRow(0)).toBe('ABC');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 3]]);
    })
  );

    return describe("when there is a selection", () =>
      it("upper cases the current selection", function() {
        editor.buffer.setText("abc");
        editor.setSelectedBufferRange([[0, 0], [0, 2]]);
        editor.upperCase();
        expect(editor.lineTextForBufferRow(0)).toBe('ABc');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 2]]);
    })
  );
});

  describe(".lowerCase()", function() {
    describe("when there is no selection", () =>
      it("lower cases the current word", function() {
        editor.buffer.setText("aBC");
        editor.setCursorScreenPosition([0, 1]);
        editor.lowerCase();
        expect(editor.lineTextForBufferRow(0)).toBe('abc');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 3]]);
    })
  );

    return describe("when there is a selection", () =>
      it("lower cases the current selection", function() {
        editor.buffer.setText("ABC");
        editor.setSelectedBufferRange([[0, 0], [0, 2]]);
        editor.lowerCase();
        expect(editor.lineTextForBufferRow(0)).toBe('abC');
        return expect(editor.getSelectedBufferRange()).toEqual([[0, 0], [0, 2]]);
    })
  );
});

  describe('.setTabLength(tabLength)', function() {
    it('clips atomic soft tabs to the given tab length', function() {
      expect(editor.getTabLength()).toBe(2);
      expect(editor.clipScreenPosition([5, 1], {clipDirection: 'forward'})).toEqual([5, 2]);

      editor.setTabLength(6);
      expect(editor.getTabLength()).toBe(6);
      expect(editor.clipScreenPosition([5, 1], {clipDirection: 'forward'})).toEqual([5, 6]);

      const changeHandler = jasmine.createSpy('changeHandler');
      editor.onDidChange(changeHandler);
      editor.setTabLength(6);
      return expect(changeHandler).not.toHaveBeenCalled();
    });

    return it('does not change its tab length when the given tab length is null', function() {
      editor.setTabLength(4);
      editor.setTabLength(null);
      return expect(editor.getTabLength()).toBe(4);
    });
  });

  describe(".indentLevelForLine(line)", function() {
    it("returns the indent level when the line has only leading whitespace", function() {
      expect(editor.indentLevelForLine("    hello")).toBe(2);
      return expect(editor.indentLevelForLine("   hello")).toBe(1.5);
    });

    it("returns the indent level when the line has only leading tabs", () => expect(editor.indentLevelForLine("\t\thello")).toBe(2));

    return it("returns the indent level based on the character starting the line when the leading whitespace contains both spaces and tabs", function() {
      expect(editor.indentLevelForLine("\t  hello")).toBe(2);
      expect(editor.indentLevelForLine("  \thello")).toBe(2);
      expect(editor.indentLevelForLine("  \t hello")).toBe(2.5);
      expect(editor.indentLevelForLine("    \t \thello")).toBe(4);
      expect(editor.indentLevelForLine("     \t \thello")).toBe(4);
      return expect(editor.indentLevelForLine("     \t \t hello")).toBe(4.5);
    });
  });

  describe("when a better-matched grammar is added to syntax", () =>
    it("switches to the better-matched grammar and re-tokenizes the buffer", function() {
      editor.destroy();

      const jsGrammar = atom.grammars.selectGrammar('a.js');
      atom.grammars.removeGrammar(jsGrammar);

      waitsForPromise(() => atom.workspace.open('sample.js', {autoIndent: false}).then(o => editor = o));

      return runs(function() {
        expect(editor.getGrammar()).toBe(atom.grammars.nullGrammar);
        expect(editor.tokensForScreenRow(0).length).toBe(1);

        atom.grammars.addGrammar(jsGrammar);
        expect(editor.getGrammar()).toBe(jsGrammar);
        return expect(editor.tokensForScreenRow(0).length).toBeGreaterThan(1);
      });
    })
  );

  describe("editor.autoIndent", function() {
    describe("when editor.autoIndent is false (default)", () =>
      describe("when `indent` is triggered", () =>
        it("does not auto-indent the line", function() {
          editor.setCursorBufferPosition([1, 30]);
          editor.insertText("\n ");
          expect(editor.lineTextForBufferRow(2)).toBe(" ");

          editor.update({autoIndent: false});
          editor.indent();
          return expect(editor.lineTextForBufferRow(2)).toBe("  ");
        })
      )
    );

    return describe("when editor.autoIndent is true", function() {
      beforeEach(() => editor.update({autoIndent: true}));

      describe("when `indent` is triggered", () =>
        it("auto-indents the line", function() {
          editor.setCursorBufferPosition([1, 30]);
          editor.insertText("\n ");
          expect(editor.lineTextForBufferRow(2)).toBe(" ");

          editor.update({autoIndent: true});
          editor.indent();
          return expect(editor.lineTextForBufferRow(2)).toBe("    ");
        })
      );

      describe("when a newline is added", function() {
        describe("when the line preceding the newline adds a new level of indentation", () =>
          it("indents the newline to one additional level of indentation beyond the preceding line", function() {
            editor.setCursorBufferPosition([1, Infinity]);
            editor.insertText('\n');
            return expect(editor.indentationForBufferRow(2)).toBe(editor.indentationForBufferRow(1) + 1);
          })
        );

        describe("when the line preceding the newline does't add a level of indentation", () =>
          it("indents the new line to the same level as the preceding line", function() {
            editor.setCursorBufferPosition([5, 14]);
            editor.insertText('\n');
            return expect(editor.indentationForBufferRow(6)).toBe(editor.indentationForBufferRow(5));
          })
        );

        describe("when the line preceding the newline is a comment", () =>
          it("maintains the indent of the commented line", function() {
            editor.setCursorBufferPosition([0, 0]);
            editor.insertText('    //');
            editor.setCursorBufferPosition([0, Infinity]);
            editor.insertText('\n');
            return expect(editor.indentationForBufferRow(1)).toBe(2);
          })
        );

        describe("when the line preceding the newline contains only whitespace", () =>
          it("bases the new line's indentation on only the preceding line", function() {
            editor.setCursorBufferPosition([6, Infinity]);
            editor.insertText("\n  ");
            expect(editor.getCursorBufferPosition()).toEqual([7, 2]);

            editor.insertNewline();
            return expect(editor.lineTextForBufferRow(8)).toBe("  ");
          })
        );

        it("does not indent the line preceding the newline", function() {
          editor.setCursorBufferPosition([2, 0]);
          editor.insertText('  var this-line-should-be-indented-more\n');
          expect(editor.indentationForBufferRow(1)).toBe(1);

          editor.update({autoIndent: true});
          editor.setCursorBufferPosition([2, Infinity]);
          editor.insertText('\n');
          expect(editor.indentationForBufferRow(1)).toBe(1);
          return expect(editor.indentationForBufferRow(2)).toBe(1);
        });

        return describe("when the cursor is before whitespace", () =>
          it("retains the whitespace following the cursor on the new line", function() {
            editor.setText("  var sort = function() {}");
            editor.setCursorScreenPosition([0, 12]);
            editor.insertNewline();

            expect(buffer.lineForRow(0)).toBe('  var sort =');
            expect(buffer.lineForRow(1)).toBe('   function() {}');
            return expect(editor.getCursorScreenPosition()).toEqual([1, 2]);
        })
      );
    });

      describe("when inserted text matches a decrease indent pattern", function() {
        describe("when the preceding line matches an increase indent pattern", () =>
          it("decreases the indentation to match that of the preceding line", function() {
            editor.setCursorBufferPosition([1, Infinity]);
            editor.insertText('\n');
            expect(editor.indentationForBufferRow(2)).toBe(editor.indentationForBufferRow(1) + 1);
            editor.insertText('}');
            return expect(editor.indentationForBufferRow(2)).toBe(editor.indentationForBufferRow(1));
          })
        );

        return describe("when the preceding line doesn't match an increase indent pattern", function() {
          it("decreases the indentation to be one level below that of the preceding line", function() {
            editor.setCursorBufferPosition([3, Infinity]);
            editor.insertText('\n    ');
            expect(editor.indentationForBufferRow(4)).toBe(editor.indentationForBufferRow(3));
            editor.insertText('}');
            return expect(editor.indentationForBufferRow(4)).toBe(editor.indentationForBufferRow(3) - 1);
          });

          return it("doesn't break when decreasing the indentation on a row that has no indentation", function() {
            editor.setCursorBufferPosition([12, Infinity]);
            editor.insertText("\n}; # too many closing brackets!");
            return expect(editor.lineTextForBufferRow(13)).toBe("}; # too many closing brackets!");
          });
        });
      });

      describe("when inserted text does not match a decrease indent pattern", () =>
        it("does not decrease the indentation", function() {
          editor.setCursorBufferPosition([12, 0]);
          editor.insertText('  ');
          expect(editor.lineTextForBufferRow(12)).toBe('  };');
          editor.insertText('\t\t');
          return expect(editor.lineTextForBufferRow(12)).toBe('  \t\t};');
        })
      );

      return describe("when the current line does not match a decrease indent pattern", () =>
        it("leaves the line unchanged", function() {
          editor.setCursorBufferPosition([2, 4]);
          expect(editor.indentationForBufferRow(2)).toBe(editor.indentationForBufferRow(1) + 1);
          editor.insertText('foo');
          return expect(editor.indentationForBufferRow(2)).toBe(editor.indentationForBufferRow(1) + 1);
        })
      );
    });
  });

  describe("atomic soft tabs", () =>
    it("skips tab-length runs of leading whitespace when moving the cursor", function() {
      editor.update({tabLength: 4, atomicSoftTabs: true});

      editor.setCursorScreenPosition([2, 3]);
      expect(editor.getCursorScreenPosition()).toEqual([2, 4]);

      editor.update({atomicSoftTabs: false});
      editor.setCursorScreenPosition([2, 3]);
      expect(editor.getCursorScreenPosition()).toEqual([2, 3]);

      editor.update({atomicSoftTabs: true});
      editor.setCursorScreenPosition([2, 3]);
      return expect(editor.getCursorScreenPosition()).toEqual([2, 4]);
  })
);

  describe(".destroy()", function() {
    it("destroys marker layers associated with the text editor", function() {
      buffer.retain();
      const selectionsMarkerLayerId = editor.selectionsMarkerLayer.id;
      const foldsMarkerLayerId = editor.displayLayer.foldsMarkerLayer.id;
      editor.destroy();
      expect(buffer.getMarkerLayer(selectionsMarkerLayerId)).toBeUndefined();
      expect(buffer.getMarkerLayer(foldsMarkerLayerId)).toBeUndefined();
      return buffer.release();
    });

    it("notifies ::onDidDestroy observers when the editor is destroyed", function() {
      let destroyObserverCalled = false;
      editor.onDidDestroy(() => destroyObserverCalled = true);

      editor.destroy();
      return expect(destroyObserverCalled).toBe(true);
    });

    it("does not blow up when query methods are called afterward", function() {
      editor.destroy();
      editor.getGrammar();
      editor.getLastCursor();
      return editor.lineTextForBufferRow(0);
    });

    return it("emits the destroy event after destroying the editor's buffer", function() {
      const events = [];
      editor.getBuffer().onDidDestroy(function() {
        expect(editor.isDestroyed()).toBe(true);
        return events.push('buffer-destroyed');
      });
      editor.onDidDestroy(function() {
        expect(buffer.isDestroyed()).toBe(true);
        return events.push('editor-destroyed');
      });
      editor.destroy();
      return expect(events).toEqual(['buffer-destroyed', 'editor-destroyed']);
    });
  });

  describe(".joinLines()", function() {
    describe("when no text is selected", function() {
      describe("when the line below isn't empty", () =>
        it("joins the line below with the current line separated by a space and moves the cursor to the start of line that was moved up", function() {
          editor.setCursorBufferPosition([0, Infinity]);
          editor.insertText('  ');
          editor.setCursorBufferPosition([0]);
          editor.joinLines();
          expect(editor.lineTextForBufferRow(0)).toBe('var quicksort = function () { var sort = function(items) {');
          return expect(editor.getCursorBufferPosition()).toEqual([0, 29]);
      })
    );

      describe("when the line below is empty", () =>
        it("deletes the line below and moves the cursor to the end of the line", function() {
          editor.setCursorBufferPosition([9]);
          editor.joinLines();
          expect(editor.lineTextForBufferRow(9)).toBe('  };');
          expect(editor.lineTextForBufferRow(10)).toBe('  return sort(Array.apply(this, arguments));');
          return expect(editor.getCursorBufferPosition()).toEqual([9, 4]);
      })
    );

      describe("when the cursor is on the last row", () =>
        it("does nothing", function() {
          editor.setCursorBufferPosition([Infinity, Infinity]);
          editor.joinLines();
          return expect(editor.lineTextForBufferRow(12)).toBe('};');
        })
      );

      return describe("when the line is empty", () =>
        it("joins the line below with the current line with no added space", function() {
          editor.setCursorBufferPosition([10]);
          editor.joinLines();
          expect(editor.lineTextForBufferRow(10)).toBe('return sort(Array.apply(this, arguments));');
          return expect(editor.getCursorBufferPosition()).toEqual([10, 0]);
      })
    );
  });

    return describe("when text is selected", function() {
      describe("when the selection does not span multiple lines", () =>
        it("joins the line below with the current line separated by a space and retains the selected text", function() {
          editor.setSelectedBufferRange([[0, 1], [0, 3]]);
          editor.joinLines();
          expect(editor.lineTextForBufferRow(0)).toBe('var quicksort = function () { var sort = function(items) {');
          return expect(editor.getSelectedBufferRange()).toEqual([[0, 1], [0, 3]]);
      })
    );

      return describe("when the selection spans multiple lines", () =>
        it("joins all selected lines separated by a space and retains the selected text", function() {
          editor.setSelectedBufferRange([[9, 3], [12, 1]]);
          editor.joinLines();
          expect(editor.lineTextForBufferRow(9)).toBe('  }; return sort(Array.apply(this, arguments)); };');
          return expect(editor.getSelectedBufferRange()).toEqual([[9, 3], [9, 49]]);
      })
    );
  });
});

  describe(".duplicateLines()", function() {
    it("for each selection, duplicates all buffer lines intersected by the selection", function() {
      editor.foldBufferRow(4);
      editor.setCursorBufferPosition([2, 5]);
      editor.addSelectionForBufferRange([[3, 0], [8, 0]], {preserveFolds: true});

      editor.duplicateLines();

      expect(editor.getTextInBufferRange([[2, 0], [13, 5]])).toBe(`\
\    if (items.length <= 1) return items;
    if (items.length <= 1) return items;
    var pivot = items.shift(), current, left = [], right = [];
    while(items.length > 0) {
      current = items.shift();
      current < pivot ? left.push(current) : right.push(current);
    }
    var pivot = items.shift(), current, left = [], right = [];
    while(items.length > 0) {
      current = items.shift();
      current < pivot ? left.push(current) : right.push(current);
    }\
`
      );
      expect(editor.getSelectedBufferRanges()).toEqual([[[3, 5], [3, 5]], [[9, 0], [14, 0]]]);

      // folds are also duplicated
      expect(editor.isFoldedAtScreenRow(5)).toBe(true);
      expect(editor.isFoldedAtScreenRow(7)).toBe(true);
      expect(editor.lineTextForScreenRow(7)).toBe(`    while(items.length > 0) {${editor.displayLayer.foldCharacter}`);
      return expect(editor.lineTextForScreenRow(8)).toBe("    return sort(left).concat(pivot).concat(sort(right));");
    });

    it("duplicates all folded lines for empty selections on lines containing folds", function() {
      editor.foldBufferRow(4);
      editor.setCursorBufferPosition([4, 0]);

      editor.duplicateLines();

      expect(editor.getTextInBufferRange([[2, 0], [11, 5]])).toBe(`\
\    if (items.length <= 1) return items;
    var pivot = items.shift(), current, left = [], right = [];
    while(items.length > 0) {
      current = items.shift();
      current < pivot ? left.push(current) : right.push(current);
    }
    while(items.length > 0) {
      current = items.shift();
      current < pivot ? left.push(current) : right.push(current);
    }\
`
      );
      return expect(editor.getSelectedBufferRange()).toEqual([[8, 0], [8, 0]]);
  });

    it("can duplicate the last line of the buffer", function() {
      editor.setSelectedBufferRange([[11, 0], [12, 2]]);
      editor.duplicateLines();
      expect(editor.getTextInBufferRange([[11, 0], [14, 2]])).toBe(`\
\  return sort(Array.apply(this, arguments));
};
  return sort(Array.apply(this, arguments));
};\
`
      );
      return expect(editor.getSelectedBufferRange()).toEqual([[13, 0], [14, 2]]);
  });

    return it("only duplicates lines containing multiple selections once", function() {
      editor.setText(`\
aaaaaa
bbbbbb
cccccc
dddddd\
`);
      editor.setSelectedBufferRanges([
        [[0, 1], [0, 2]],
        [[0, 3], [0, 4]],
        [[2, 1], [2, 2]],
        [[2, 3], [3, 1]],
        [[3, 3], [3, 4]],
      ]);
      editor.duplicateLines();
      expect(editor.getText()).toBe(`\
aaaaaa
aaaaaa
bbbbbb
cccccc
dddddd
cccccc
dddddd\
`);
      return expect(editor.getSelectedBufferRanges()).toEqual([
        [[1, 1], [1, 2]],
        [[1, 3], [1, 4]],
        [[5, 1], [5, 2]],
        [[5, 3], [6, 1]],
        [[6, 3], [6, 4]],
      ]);
    });
  });

  describe(".shouldPromptToSave()", function() {
    it("returns true when buffer changed", function() {
      jasmine.unspy(editor, 'shouldPromptToSave');
      expect(editor.shouldPromptToSave()).toBeFalsy();
      buffer.setText('changed');
      return expect(editor.shouldPromptToSave()).toBeTruthy();
    });

    it("returns false when an edit session's buffer is in use by more than one session", function() {
      jasmine.unspy(editor, 'shouldPromptToSave');
      buffer.setText('changed');

      let editor2 = null;
      waitsForPromise(function() {
        atom.workspace.getActivePane().splitRight();
        return atom.workspace.open('sample.js', {autoIndent: false}).then(o => editor2 = o);
      });

      return runs(function() {
        expect(editor.shouldPromptToSave()).toBeFalsy();
        editor2.destroy();
        return expect(editor.shouldPromptToSave()).toBeTruthy();
      });
    });

    it("returns false when close of a window requested and edit session opened inside project", function() {
      jasmine.unspy(editor, 'shouldPromptToSave');
      buffer.setText('changed');
      return expect(editor.shouldPromptToSave({windowCloseRequested: true, projectHasPaths: true})).toBeFalsy();
    });

    return it("returns true when close of a window requested and edit session opened without project", function() {
      jasmine.unspy(editor, 'shouldPromptToSave');
      buffer.setText('changed');
      return expect(editor.shouldPromptToSave({windowCloseRequested: true, projectHasPaths: false})).toBeTruthy();
    });
  });

  describe("when the editor contains surrogate pair characters", function() {
    it("correctly backspaces over them", function() {
      editor.setText('\uD835\uDF97\uD835\uDF97\uD835\uDF97');
      editor.moveToBottom();
      editor.backspace();
      expect(editor.getText()).toBe('\uD835\uDF97\uD835\uDF97');
      editor.backspace();
      expect(editor.getText()).toBe('\uD835\uDF97');
      editor.backspace();
      return expect(editor.getText()).toBe('');
    });

    it("correctly deletes over them", function() {
      editor.setText('\uD835\uDF97\uD835\uDF97\uD835\uDF97');
      editor.moveToTop();
      editor.delete();
      expect(editor.getText()).toBe('\uD835\uDF97\uD835\uDF97');
      editor.delete();
      expect(editor.getText()).toBe('\uD835\uDF97');
      editor.delete();
      return expect(editor.getText()).toBe('');
    });

    return it("correctly moves over them", function() {
      editor.setText('\uD835\uDF97\uD835\uDF97\uD835\uDF97\n');
      editor.moveToTop();
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([0, 6]);
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([1, 0]);
      editor.moveLeft();
      expect(editor.getCursorBufferPosition()).toEqual([0, 6]);
      editor.moveLeft();
      expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      editor.moveLeft();
      expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      editor.moveLeft();
      return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
  });
});

  describe("when the editor contains variation sequence character pairs", function() {
    it("correctly backspaces over them", function() {
      editor.setText('\u2714\uFE0E\u2714\uFE0E\u2714\uFE0E');
      editor.moveToBottom();
      editor.backspace();
      expect(editor.getText()).toBe('\u2714\uFE0E\u2714\uFE0E');
      editor.backspace();
      expect(editor.getText()).toBe('\u2714\uFE0E');
      editor.backspace();
      return expect(editor.getText()).toBe('');
    });

    it("correctly deletes over them", function() {
      editor.setText('\u2714\uFE0E\u2714\uFE0E\u2714\uFE0E');
      editor.moveToTop();
      editor.delete();
      expect(editor.getText()).toBe('\u2714\uFE0E\u2714\uFE0E');
      editor.delete();
      expect(editor.getText()).toBe('\u2714\uFE0E');
      editor.delete();
      return expect(editor.getText()).toBe('');
    });

    return it("correctly moves over them", function() {
      editor.setText('\u2714\uFE0E\u2714\uFE0E\u2714\uFE0E\n');
      editor.moveToTop();
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([0, 6]);
      editor.moveRight();
      expect(editor.getCursorBufferPosition()).toEqual([1, 0]);
      editor.moveLeft();
      expect(editor.getCursorBufferPosition()).toEqual([0, 6]);
      editor.moveLeft();
      expect(editor.getCursorBufferPosition()).toEqual([0, 4]);
      editor.moveLeft();
      expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
      editor.moveLeft();
      return expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
  });
});

  describe(".setIndentationForBufferRow", function() {
    describe("when the editor uses soft tabs but the row has hard tabs", () =>
      it("only replaces whitespace characters", function() {
        editor.setSoftWrapped(true);
        editor.setText("\t1\n\t2");
        editor.setCursorBufferPosition([0, 0]);
        editor.setIndentationForBufferRow(0, 2);
        return expect(editor.getText()).toBe("    1\n\t2");
      })
    );

    return describe("when the indentation level is a non-integer", () =>
      it("does not throw an exception", function() {
        editor.setSoftWrapped(true);
        editor.setText("\t1\n\t2");
        editor.setCursorBufferPosition([0, 0]);
        editor.setIndentationForBufferRow(0, 2.1);
        return expect(editor.getText()).toBe("    1\n\t2");
      })
    );
  });

  describe("when the editor's grammar has an injection selector", function() {
    beforeEach(function() {
      waitsForPromise(() => atom.packages.activatePackage('language-text'));

      return waitsForPromise(() => atom.packages.activatePackage('language-javascript'));
    });

    it("includes the grammar's patterns when the selector matches the current scope in other grammars", function() {
      waitsForPromise(() => atom.packages.activatePackage('language-hyperlink'));

      return runs(function() {
        const grammar = atom.grammars.selectGrammar("text.js");
        const {line, tags} = grammar.tokenizeLine("var i; // http://github.com");

        const tokens = atom.grammars.decodeTokens(line, tags);
        expect(tokens[0].value).toBe("var");
        expect(tokens[0].scopes).toEqual(["source.js", "storage.type.var.js"]);

        expect(tokens[6].value).toBe("http://github.com");
        return expect(tokens[6].scopes).toEqual(["source.js", "comment.line.double-slash.js", "markup.underline.link.http.hyperlink"]);});
  });

    return describe("when the grammar is added", function() {
      it("retokenizes existing buffers that contain tokens that match the injection selector", function() {
        waitsForPromise(() => atom.workspace.open('sample.js').then(o => editor = o));

        runs(function() {
          editor.setText("// http://github.com");

          const tokens = editor.tokensForScreenRow(0);
          return expect(tokens).toEqual([
            {text: '//', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--punctuation syntax--definition syntax--comment syntax--js']},
            {text: ' http://github.com', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']}
          ]);});

        waitsForPromise(() => atom.packages.activatePackage('language-hyperlink'));

        return runs(function() {
          const tokens = editor.tokensForScreenRow(0);
          return expect(tokens).toEqual([
            {text: '//', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--punctuation syntax--definition syntax--comment syntax--js']},
            {text: ' ', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']},
            {text: 'http://github.com', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--markup syntax--underline syntax--link syntax--http syntax--hyperlink']}
          ]);});
    });

      return describe("when the grammar is updated", () =>
        it("retokenizes existing buffers that contain tokens that match the injection selector", function() {
          waitsForPromise(() => atom.workspace.open('sample.js').then(o => editor = o));

          runs(function() {
            editor.setText("// SELECT * FROM OCTOCATS");

            const tokens = editor.tokensForScreenRow(0);
            return expect(tokens).toEqual([
              {text: '//', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--punctuation syntax--definition syntax--comment syntax--js']},
              {text: ' SELECT * FROM OCTOCATS', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']}
            ]);});

          waitsForPromise(() => atom.packages.activatePackage('package-with-injection-selector'));

          runs(function() {
            const tokens = editor.tokensForScreenRow(0);
            return expect(tokens).toEqual([
              {text: '//', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--punctuation syntax--definition syntax--comment syntax--js']},
              {text: ' SELECT * FROM OCTOCATS', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']}
            ]);});

          waitsForPromise(() => atom.packages.activatePackage('language-sql'));

          return runs(function() {
            const tokens = editor.tokensForScreenRow(0);
            return expect(tokens).toEqual([
              {text: '//', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--punctuation syntax--definition syntax--comment syntax--js']},
              {text: ' ', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']},
              {text: 'SELECT', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--keyword syntax--other syntax--DML syntax--sql']},
              {text: ' ', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']},
              {text: '*', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--keyword syntax--operator syntax--star syntax--sql']},
              {text: ' ', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']},
              {text: 'FROM', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js', 'syntax--keyword syntax--other syntax--DML syntax--sql']},
              {text: ' OCTOCATS', scopes: ['syntax--source syntax--js', 'syntax--comment syntax--line syntax--double-slash syntax--js']}
            ]);});
      })
    );
  });
});

  describe(".normalizeTabsInBufferRange()", () =>
    it("normalizes tabs depending on the editor's soft tab/tab length settings", function() {
      editor.setTabLength(1);
      editor.setSoftTabs(true);
      editor.setText('\t\t\t');
      editor.normalizeTabsInBufferRange([[0, 0], [0, 1]]);
      expect(editor.getText()).toBe(' \t\t');

      editor.setTabLength(2);
      editor.normalizeTabsInBufferRange([[0, 0], [Infinity, Infinity]]);
      expect(editor.getText()).toBe('     ');

      editor.setSoftTabs(false);
      editor.normalizeTabsInBufferRange([[0, 0], [Infinity, Infinity]]);
      return expect(editor.getText()).toBe('     ');
    })
  );

  describe(".pageUp/Down()", () =>
    it("moves the cursor down one page length", function() {
      editor.update({autoHeight: false});
      const element = editor.getElement();
      jasmine.attachToDOM(element);
      element.style.height = (element.component.getLineHeight() * 5) + 'px';
      element.measureDimensions();

      expect(editor.getCursorBufferPosition().row).toBe(0);

      editor.pageDown();
      expect(editor.getCursorBufferPosition().row).toBe(5);

      editor.pageDown();
      expect(editor.getCursorBufferPosition().row).toBe(10);

      editor.pageUp();
      expect(editor.getCursorBufferPosition().row).toBe(5);

      editor.pageUp();
      return expect(editor.getCursorBufferPosition().row).toBe(0);
    })
  );

  describe(".selectPageUp/Down()", () =>
    it("selects one screen height of text up or down", function() {
      editor.update({autoHeight: false});
      const element = editor.getElement();
      jasmine.attachToDOM(element);
      element.style.height = (element.component.getLineHeight() * 5) + 'px';
      element.measureDimensions();

      expect(editor.getCursorBufferPosition().row).toBe(0);

      editor.selectPageDown();
      expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [5, 0]]]);

      editor.selectPageDown();
      expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [10, 0]]]);

      editor.selectPageDown();
      expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [12, 2]]]);

      editor.moveToBottom();
      editor.selectPageUp();
      expect(editor.getSelectedBufferRanges()).toEqual([[[7, 0], [12, 2]]]);

      editor.selectPageUp();
      expect(editor.getSelectedBufferRanges()).toEqual([[[2, 0], [12, 2]]]);

      editor.selectPageUp();
      return expect(editor.getSelectedBufferRanges()).toEqual([[[0, 0], [12, 2]]]);
  })
);

  describe("::scrollToScreenPosition(position, [options])", () =>
    it("triggers ::onDidRequestAutoscroll with the logical coordinates along with the options", function() {
      const scrollSpy = jasmine.createSpy("::onDidRequestAutoscroll");
      editor.onDidRequestAutoscroll(scrollSpy);

      editor.scrollToScreenPosition([8, 20]);
      editor.scrollToScreenPosition([8, 20], {center: true});
      editor.scrollToScreenPosition([8, 20], {center: false, reversed: true});

      expect(scrollSpy).toHaveBeenCalledWith({screenRange: [[8, 20], [8, 20]], options: {}});
      expect(scrollSpy).toHaveBeenCalledWith({screenRange: [[8, 20], [8, 20]], options: {center: true}});
      return expect(scrollSpy).toHaveBeenCalledWith({screenRange: [[8, 20], [8, 20]], options: {center: false, reversed: true}});
    })
  );

  describe("scroll past end", function() {
    it("returns false by default but can be customized", function() {
      expect(editor.getScrollPastEnd()).toBe(false);
      editor.update({scrollPastEnd: true});
      expect(editor.getScrollPastEnd()).toBe(true);
      editor.update({scrollPastEnd: false});
      return expect(editor.getScrollPastEnd()).toBe(false);
    });

    return it("always returns false when autoHeight is on", function() {
      editor.update({autoHeight: true, scrollPastEnd: true});
      expect(editor.getScrollPastEnd()).toBe(false);
      editor.update({autoHeight: false});
      return expect(editor.getScrollPastEnd()).toBe(true);
    });
  });

  describe("auto height", () =>
    it("returns true by default but can be customized", function() {
      editor = new TextEditor;
      expect(editor.getAutoHeight()).toBe(true);
      editor.update({autoHeight: false});
      expect(editor.getAutoHeight()).toBe(false);
      editor.update({autoHeight: true});
      expect(editor.getAutoHeight()).toBe(true);
      return editor.destroy();
    })
  );

  describe("auto width", () =>
    it("returns false by default but can be customized", function() {
      expect(editor.getAutoWidth()).toBe(false);
      editor.update({autoWidth: true});
      expect(editor.getAutoWidth()).toBe(true);
      editor.update({autoWidth: false});
      return expect(editor.getAutoWidth()).toBe(false);
    })
  );

  describe('.get/setPlaceholderText()', function() {
    it('can be created with placeholderText', function() {
      const newEditor = new TextEditor({
        mini: true,
        placeholderText: 'yep'
      });
      return expect(newEditor.getPlaceholderText()).toBe('yep');
    });

    return it('models placeholderText and emits an event when changed', function() {
      let handler;
      editor.onDidChangePlaceholderText(handler = jasmine.createSpy());

      expect(editor.getPlaceholderText()).toBeUndefined();

      editor.setPlaceholderText('OK');
      expect(handler).toHaveBeenCalledWith('OK');
      return expect(editor.getPlaceholderText()).toBe('OK');
    });
  });

  describe('gutters', function() {
    describe('the TextEditor constructor', () =>
      it('creates a line-number gutter', function() {
        expect(editor.getGutters().length).toBe(1);
        const lineNumberGutter = editor.gutterWithName('line-number');
        expect(lineNumberGutter.name).toBe('line-number');
        return expect(lineNumberGutter.priority).toBe(0);
      })
    );

    describe('::addGutter', function() {
      it('can add a gutter', function() {
        expect(editor.getGutters().length).toBe(1); // line-number gutter
        const options = {
          name: 'test-gutter',
          priority: 1
        };
        const gutter = editor.addGutter(options);
        expect(editor.getGutters().length).toBe(2);
        return expect(editor.getGutters()[1]).toBe(gutter);
      });

      return it("does not allow a custom gutter with the 'line-number' name.", () => expect(editor.addGutter.bind(editor, {name: 'line-number'})).toThrow());
    });

    describe('::decorateMarker', function() {
      let [marker] = Array.from([]);

      beforeEach(() => marker = editor.markBufferRange([[1, 0], [1, 0]]));

      it('reflects an added decoration when one of its custom gutters is decorated.', function() {
        const gutter = editor.addGutter({'name': 'custom-gutter'});
        const decoration = gutter.decorateMarker(marker, {class: 'custom-class'});
        const gutterDecorations = editor.getDecorations({
          type: 'gutter',
          gutterName: 'custom-gutter',
          class: 'custom-class'
        });
        expect(gutterDecorations.length).toBe(1);
        return expect(gutterDecorations[0]).toBe(decoration);
      });

      return it('reflects an added decoration when its line-number gutter is decorated.', function() {
        const decoration = editor.gutterWithName('line-number').decorateMarker(marker, {class: 'test-class'});
        const gutterDecorations = editor.getDecorations({
          type: 'line-number',
          gutterName: 'line-number',
          class: 'test-class'
        });
        expect(gutterDecorations.length).toBe(1);
        return expect(gutterDecorations[0]).toBe(decoration);
      });
    });

    describe('::observeGutters', function() {
      let [payloads, callback] = Array.from([]);

      beforeEach(function() {
        payloads = [];
        return callback = payload => payloads.push(payload);
      });

      it('calls the callback immediately with each existing gutter, and with each added gutter after that.', function() {
        const lineNumberGutter = editor.gutterWithName('line-number');
        editor.observeGutters(callback);
        expect(payloads).toEqual([lineNumberGutter]);
        const gutter1 = editor.addGutter({name: 'test-gutter-1'});
        expect(payloads).toEqual([lineNumberGutter, gutter1]);
        const gutter2 = editor.addGutter({name: 'test-gutter-2'});
        return expect(payloads).toEqual([lineNumberGutter, gutter1, gutter2]);
    });

      it('does not call the callback when a gutter is removed.', function() {
        const gutter = editor.addGutter({name: 'test-gutter'});
        editor.observeGutters(callback);
        payloads = [];
        gutter.destroy();
        return expect(payloads).toEqual([]);
    });

      return it('does not call the callback after the subscription has been disposed.', function() {
        const subscription = editor.observeGutters(callback);
        payloads = [];
        subscription.dispose();
        editor.addGutter({name: 'test-gutter'});
        return expect(payloads).toEqual([]);
    });
  });

    describe('::onDidAddGutter', function() {
      let [payloads, callback] = Array.from([]);

      beforeEach(function() {
        payloads = [];
        return callback = payload => payloads.push(payload);
      });

      it('calls the callback with each newly-added gutter, but not with existing gutters.', function() {
        editor.onDidAddGutter(callback);
        expect(payloads).toEqual([]);
        const gutter = editor.addGutter({name: 'test-gutter'});
        return expect(payloads).toEqual([gutter]);
    });

      return it('does not call the callback after the subscription has been disposed.', function() {
        const subscription = editor.onDidAddGutter(callback);
        payloads = [];
        subscription.dispose();
        editor.addGutter({name: 'test-gutter'});
        return expect(payloads).toEqual([]);
    });
  });

    return describe('::onDidRemoveGutter', function() {
      let [payloads, callback] = Array.from([]);

      beforeEach(function() {
        payloads = [];
        return callback = payload => payloads.push(payload);
      });

      it('calls the callback when a gutter is removed.', function() {
        const gutter = editor.addGutter({name: 'test-gutter'});
        editor.onDidRemoveGutter(callback);
        expect(payloads).toEqual([]);
        gutter.destroy();
        return expect(payloads).toEqual(['test-gutter']);
    });

      return it('does not call the callback after the subscription has been disposed.', function() {
        const gutter = editor.addGutter({name: 'test-gutter'});
        const subscription = editor.onDidRemoveGutter(callback);
        subscription.dispose();
        gutter.destroy();
        return expect(payloads).toEqual([]);
    });
  });
});

  describe("decorations", function() {
    describe("::decorateMarker", function() {
      it("includes the decoration in the object returned from ::decorationsStateForScreenRowRange", function() {
        const marker = editor.markBufferRange([[2, 4], [6, 8]]);
        const decoration = editor.decorateMarker(marker, {type: 'highlight', class: 'foo'});
        return expect(editor.decorationsStateForScreenRowRange(0, 5)[decoration.id]).toEqual({
          properties: {type: 'highlight', class: 'foo'},
          screenRange: marker.getScreenRange(),
          bufferRange: marker.getBufferRange(),
          rangeIsReversed: false
        });
    });

      return it("does not throw errors after the marker's containing layer is destroyed", function() {
        const layer = editor.addMarkerLayer();
        const marker = layer.markBufferRange([[2, 4], [6, 8]]);
        const decoration = editor.decorateMarker(marker, {type: 'highlight', class: 'foo'});
        layer.destroy();
        return editor.decorationsStateForScreenRowRange(0, 5);
      });
    });

    return describe("::decorateMarkerLayer", () =>
      it("based on the markers in the layer, includes multiple decoration objects with the same properties and different ranges in the object returned from ::decorationsStateForScreenRowRange", function() {
        const layer1 = editor.getBuffer().addMarkerLayer();
        const marker1 = layer1.markRange([[2, 4], [6, 8]]);
        const marker2 = layer1.markRange([[11, 0], [11, 12]]);
        const layer2 = editor.getBuffer().addMarkerLayer();
        const marker3 = layer2.markRange([[8, 0], [9, 0]]);

        const layer1Decoration1 = editor.decorateMarkerLayer(layer1, {type: 'highlight', class: 'foo'});
        const layer1Decoration2 = editor.decorateMarkerLayer(layer1, {type: 'highlight', class: 'bar'});
        const layer2Decoration = editor.decorateMarkerLayer(layer2, {type: 'highlight', class: 'baz'});

        let decorationState = editor.decorationsStateForScreenRowRange(0, 13);

        expect(decorationState[`${layer1Decoration1.id}-${marker1.id}`]).toEqual({
          properties: {type: 'highlight', class: 'foo'},
          screenRange: marker1.getRange(),
          bufferRange: marker1.getRange(),
          rangeIsReversed: false
        });
        expect(decorationState[`${layer1Decoration1.id}-${marker2.id}`]).toEqual({
          properties: {type: 'highlight', class: 'foo'},
          screenRange: marker2.getRange(),
          bufferRange: marker2.getRange(),
          rangeIsReversed: false
        });
        expect(decorationState[`${layer1Decoration2.id}-${marker1.id}`]).toEqual({
          properties: {type: 'highlight', class: 'bar'},
          screenRange: marker1.getRange(),
          bufferRange: marker1.getRange(),
          rangeIsReversed: false
        });
        expect(decorationState[`${layer1Decoration2.id}-${marker2.id}`]).toEqual({
          properties: {type: 'highlight', class: 'bar'},
          screenRange: marker2.getRange(),
          bufferRange: marker2.getRange(),
          rangeIsReversed: false
        });
        expect(decorationState[`${layer2Decoration.id}-${marker3.id}`]).toEqual({
          properties: {type: 'highlight', class: 'baz'},
          screenRange: marker3.getRange(),
          bufferRange: marker3.getRange(),
          rangeIsReversed: false
        });

        layer1Decoration1.destroy();

        decorationState = editor.decorationsStateForScreenRowRange(0, 12);
        expect(decorationState[`${layer1Decoration1.id}-${marker1.id}`]).toBeUndefined();
        expect(decorationState[`${layer1Decoration1.id}-${marker2.id}`]).toBeUndefined();
        expect(decorationState[`${layer1Decoration2.id}-${marker1.id}`]).toEqual({
          properties: {type: 'highlight', class: 'bar'},
          screenRange: marker1.getRange(),
          bufferRange: marker1.getRange(),
          rangeIsReversed: false
        });
        expect(decorationState[`${layer1Decoration2.id}-${marker2.id}`]).toEqual({
          properties: {type: 'highlight', class: 'bar'},
          screenRange: marker2.getRange(),
          bufferRange: marker2.getRange(),
          rangeIsReversed: false
        });
        expect(decorationState[`${layer2Decoration.id}-${marker3.id}`]).toEqual({
          properties: {type: 'highlight', class: 'baz'},
          screenRange: marker3.getRange(),
          bufferRange: marker3.getRange(),
          rangeIsReversed: false
        });

        layer1Decoration2.setPropertiesForMarker(marker1, {type: 'highlight', class: 'quux'});
        decorationState = editor.decorationsStateForScreenRowRange(0, 12);
        expect(decorationState[`${layer1Decoration2.id}-${marker1.id}`]).toEqual({
          properties: {type: 'highlight', class: 'quux'},
          screenRange: marker1.getRange(),
          bufferRange: marker1.getRange(),
          rangeIsReversed: false
        });

        layer1Decoration2.setPropertiesForMarker(marker1, null);
        decorationState = editor.decorationsStateForScreenRowRange(0, 12);
        return expect(decorationState[`${layer1Decoration2.id}-${marker1.id}`]).toEqual({
          properties: {type: 'highlight', class: 'bar'},
          screenRange: marker1.getRange(),
          bufferRange: marker1.getRange(),
          rangeIsReversed: false
        });
    })
  );
});

  describe("invisibles", function() {
    beforeEach(() => editor.update({showInvisibles: true}));

    it("substitutes invisible characters according to the given rules", function() {
      const previousLineText = editor.lineTextForScreenRow(0);
      editor.update({invisibles: {eol: '?'}});
      expect(editor.lineTextForScreenRow(0)).not.toBe(previousLineText);
      expect(editor.lineTextForScreenRow(0).endsWith('?')).toBe(true);
      return expect(editor.getInvisibles()).toEqual({eol: '?'});
    });

    return it("does not use invisibles if showInvisibles is set to false", function() {
      editor.update({invisibles: {eol: '?'}});
      expect(editor.lineTextForScreenRow(0).endsWith('?')).toBe(true);

      editor.update({showInvisibles: false});
      return expect(editor.lineTextForScreenRow(0).endsWith('?')).toBe(false);
    });
  });

  describe("indent guides", () =>
    it("shows indent guides when `editor.showIndentGuide` is set to true and the editor is not mini", function() {
      editor.setText("  foo");
      editor.setTabLength(2);

      editor.update({showIndentGuide: false});
      expect(editor.tokensForScreenRow(0)).toEqual([
        {text: '  ', scopes: ['syntax--source syntax--js', 'leading-whitespace']},
        {text: 'foo', scopes: ['syntax--source syntax--js']}
      ]);

      editor.update({showIndentGuide: true});
      expect(editor.tokensForScreenRow(0)).toEqual([
        {text: '  ', scopes: ['syntax--source syntax--js', 'leading-whitespace indent-guide']},
        {text: 'foo', scopes: ['syntax--source syntax--js']}
      ]);

      editor.setMini(true);
      return expect(editor.tokensForScreenRow(0)).toEqual([
        {text: '  ', scopes: ['syntax--source syntax--js', 'leading-whitespace']},
        {text: 'foo', scopes: ['syntax--source syntax--js']}
      ]);
  })
);

  describe("when the editor is constructed with the grammar option set", function() {
    beforeEach(() =>
      waitsForPromise(() => atom.packages.activatePackage('language-coffee-script'))
    );

    return it("sets the grammar", function() {
      editor = new TextEditor({grammar: atom.grammars.grammarForScopeName('source.coffee')});
      return expect(editor.getGrammar().name).toBe('CoffeeScript');
    });
  });

  describe("softWrapAtPreferredLineLength", () =>
    it("soft wraps the editor at the preferred line length unless the editor is narrower or the editor is mini", function() {
      editor.update({
        editorWidthInChars: 30,
        softWrapped: true,
        softWrapAtPreferredLineLength: true,
        preferredLineLength: 20
      });

      expect(editor.lineTextForScreenRow(0)).toBe('var quicksort = ');

      editor.update({editorWidthInChars: 10});
      expect(editor.lineTextForScreenRow(0)).toBe('var ');

      editor.update({mini: true});
      return expect(editor.lineTextForScreenRow(0)).toBe('var quicksort = function () {');
    })
  );

  describe("softWrapHangingIndentLength", () =>
    it("controls how much extra indentation is applied to soft-wrapped lines", function() {
      editor.setText('123456789');
      editor.update({
        editorWidthInChars: 8,
        softWrapped: true,
        softWrapHangingIndentLength: 2
      });
      expect(editor.lineTextForScreenRow(1)).toEqual('  9');

      editor.update({softWrapHangingIndentLength: 4});
      return expect(editor.lineTextForScreenRow(1)).toEqual('    9');
    })
  );

  return describe("::getElement", () =>
    it("returns an element", () => expect(editor.getElement() instanceof HTMLElement).toBe(true))
  );
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}