/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const temp = require('temp').track();
const path = require('path');
const fs = require('fs-plus');
const FileSystemBlobStore = require('../src/file-system-blob-store');

describe("FileSystemBlobStore", function() {
  let [storageDirectory, blobStore] = Array.from([]);

  beforeEach(function() {
    storageDirectory = temp.path('atom-spec-filesystemblobstore');
    return blobStore = FileSystemBlobStore.load(storageDirectory);
  });

  afterEach(() => fs.removeSync(storageDirectory));

  it("is empty when the file doesn't exist", function() {
    expect(blobStore.get("foo")).toBeUndefined();
    return expect(blobStore.get("bar")).toBeUndefined();
  });

  it("allows to read and write buffers from/to memory without persisting them", function() {
    blobStore.set("foo", new Buffer("foo"));
    blobStore.set("bar", new Buffer("bar"));

    expect(blobStore.get("foo")).toEqual(new Buffer("foo"));
    expect(blobStore.get("bar")).toEqual(new Buffer("bar"));

    expect(blobStore.get("baz")).toBeUndefined();
    return expect(blobStore.get("qux")).toBeUndefined();
  });

  it("persists buffers when saved and retrieves them on load, giving priority to in-memory ones", function() {
    blobStore.set("foo", new Buffer("foo"));
    blobStore.set("bar", new Buffer("bar"));
    blobStore.save();

    blobStore = FileSystemBlobStore.load(storageDirectory);

    expect(blobStore.get("foo")).toEqual(new Buffer("foo"));
    expect(blobStore.get("bar")).toEqual(new Buffer("bar"));
    expect(blobStore.get("baz")).toBeUndefined();
    expect(blobStore.get("qux")).toBeUndefined();

    blobStore.set("foo", new Buffer("changed"));

    return expect(blobStore.get("foo")).toEqual(new Buffer("changed"));
  });

  it("persists in-memory and previously stored buffers, and deletes unused keys when saved", function() {
    blobStore.set("foo", new Buffer("foo"));
    blobStore.set("bar", new Buffer("bar"));
    blobStore.save();

    blobStore = FileSystemBlobStore.load(storageDirectory);
    blobStore.set("bar", new Buffer("changed"));
    blobStore.set("qux", new Buffer("qux"));
    blobStore.save();

    blobStore = FileSystemBlobStore.load(storageDirectory);

    expect(blobStore.get("foo")).toBeUndefined();
    expect(blobStore.get("bar")).toEqual(new Buffer("changed"));
    return expect(blobStore.get("qux")).toEqual(new Buffer("qux"));
  });

  it("allows to delete keys from both memory and stored buffers", function() {
    blobStore.set("a", new Buffer("a"));
    blobStore.set("b", new Buffer("b"));
    blobStore.save();

    blobStore = FileSystemBlobStore.load(storageDirectory);

    blobStore.get("a"); // prevent the key from being deleted on save
    blobStore.set("b", new Buffer("b"));
    blobStore.set("c", new Buffer("c"));
    blobStore.delete("b");
    blobStore.delete("c");
    blobStore.save();

    blobStore = FileSystemBlobStore.load(storageDirectory);

    expect(blobStore.get("a")).toEqual(new Buffer("a"));
    expect(blobStore.get("b")).toBeUndefined();
    expect(blobStore.get("b")).toBeUndefined();
    return expect(blobStore.get("c")).toBeUndefined();
  });

  return it("ignores errors when loading an invalid blob store", function() {
    blobStore.set("a", new Buffer("a"));
    blobStore.set("b", new Buffer("b"));
    blobStore.save();

    // Simulate corruption
    fs.writeFileSync(path.join(storageDirectory, "MAP"), new Buffer([0]));
    fs.writeFileSync(path.join(storageDirectory, "INVKEYS"), new Buffer([0]));
    fs.writeFileSync(path.join(storageDirectory, "BLOB"), new Buffer([0]));

    blobStore = FileSystemBlobStore.load(storageDirectory);

    expect(blobStore.get("a")).toBeUndefined();
    expect(blobStore.get("b")).toBeUndefined();

    blobStore.set("a", new Buffer("x"));
    blobStore.set("b", new Buffer("y"));
    blobStore.save();

    blobStore = FileSystemBlobStore.load(storageDirectory);

    expect(blobStore.get("a")).toEqual(new Buffer("x"));
    return expect(blobStore.get("b")).toEqual(new Buffer("y"));
  });
});
