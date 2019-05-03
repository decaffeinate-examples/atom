/** @babel */
/* eslint-disable
    no-new-object,
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
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const PaneContainer = require('../src/pane-container')
const Pane = require('../src/pane')

describe('PaneContainer', function () {
  let [confirm, params] = Array.from([])

  beforeEach(function () {
    confirm = spyOn(atom.applicationDelegate, 'confirm').andReturn(0)
    return params = {
      location: 'center',
      config: atom.config,
      deserializerManager: atom.deserializers,
      applicationDelegate: atom.applicationDelegate,
      viewRegistry: atom.views
    }
  })

  describe('serialization', function () {
    let [containerA, pane1A, pane2A, pane3A] = Array.from([])

    beforeEach(function () {
      // This is a dummy item to prevent panes from being empty on deserialization
      class Item {
        static initClass () {
          atom.deserializers.add(this)
        }
        static deserialize () { return new (this)() }
        serialize () { return { deserializer: 'Item' } }
      }
      Item.initClass()

      containerA = new PaneContainer(params)
      pane1A = containerA.getActivePane()
      pane1A.addItem(new Item())
      pane2A = pane1A.splitRight({ items: [new Item()] })
      pane3A = pane2A.splitDown({ items: [new Item()] })
      return pane3A.focus()
    })

    it('preserves the focused pane across serialization', function () {
      expect(pane3A.focused).toBe(true)

      const containerB = new PaneContainer(params)
      containerB.deserialize(containerA.serialize(), atom.deserializers)
      const [pane1B, pane2B, pane3B] = Array.from(containerB.getPanes())
      return expect(pane3B.focused).toBe(true)
    })

    it('preserves the active pane across serialization, independent of focus', function () {
      pane3A.activate()
      expect(containerA.getActivePane()).toBe(pane3A)

      const containerB = new PaneContainer(params)
      containerB.deserialize(containerA.serialize(), atom.deserializers)
      const [pane1B, pane2B, pane3B] = Array.from(containerB.getPanes())
      return expect(containerB.getActivePane()).toBe(pane3B)
    })

    it('makes the first pane active if no pane exists for the activePaneId', function () {
      pane3A.activate()
      const state = containerA.serialize()
      state.activePaneId = -22
      const containerB = new PaneContainer(params)
      containerB.deserialize(state, atom.deserializers)
      return expect(containerB.getActivePane()).toBe(containerB.getPanes()[0])
    })

    return describe('if there are empty panes after deserialization', function () {
      beforeEach(() => pane3A.getItems()[0].serialize = () => ({ deserializer: 'Bogus' }))

      describe("if the 'core.destroyEmptyPanes' config option is false (the default)", () =>
        it('leaves the empty panes intact', function () {
          const state = containerA.serialize()
          const containerB = new PaneContainer(params)
          containerB.deserialize(state, atom.deserializers)
          const [leftPane, column] = Array.from(containerB.getRoot().getChildren())
          const [topPane, bottomPane] = Array.from(column.getChildren())

          expect(leftPane.getItems().length).toBe(1)
          expect(topPane.getItems().length).toBe(1)
          return expect(bottomPane.getItems().length).toBe(0)
        })
      )

      return describe("if the 'core.destroyEmptyPanes' config option is true", () =>
        it('removes empty panes on deserialization', function () {
          atom.config.set('core.destroyEmptyPanes', true)

          const state = containerA.serialize()
          const containerB = new PaneContainer(params)
          containerB.deserialize(state, atom.deserializers)
          const [leftPane, rightPane] = Array.from(containerB.getRoot().getChildren())

          expect(leftPane.getItems().length).toBe(1)
          return expect(rightPane.getItems().length).toBe(1)
        })
      )
    })
  })

  it('does not allow the root pane to be destroyed', function () {
    const container = new PaneContainer(params)
    container.getRoot().destroy()
    expect(container.getRoot()).toBeDefined()
    return expect(container.getRoot().isDestroyed()).toBe(false)
  })

  describe('::getActivePane()', function () {
    let [container, pane1, pane2] = Array.from([])

    beforeEach(function () {
      container = new PaneContainer(params)
      return pane1 = container.getRoot()
    })

    it('returns the first pane if no pane has been made active', function () {
      expect(container.getActivePane()).toBe(pane1)
      return expect(pane1.isActive()).toBe(true)
    })

    it('returns the most pane on which ::activate() was most recently called', function () {
      pane2 = pane1.splitRight()
      pane2.activate()
      expect(container.getActivePane()).toBe(pane2)
      expect(pane1.isActive()).toBe(false)
      expect(pane2.isActive()).toBe(true)
      pane1.activate()
      expect(container.getActivePane()).toBe(pane1)
      expect(pane1.isActive()).toBe(true)
      return expect(pane2.isActive()).toBe(false)
    })

    return it('returns the next pane if the current active pane is destroyed', function () {
      pane2 = pane1.splitRight()
      pane2.activate()
      pane2.destroy()
      expect(container.getActivePane()).toBe(pane1)
      return expect(pane1.isActive()).toBe(true)
    })
  })

  describe('::onDidChangeActivePane()', function () {
    let [container, pane1, pane2, observed] = Array.from([])

    beforeEach(function () {
      container = new PaneContainer(params)
      container.getRoot().addItems([new Object(), new Object()])
      container.getRoot().splitRight({ items: [new Object(), new Object()] });
      [pane1, pane2] = Array.from(container.getPanes())

      observed = []
      return container.onDidChangeActivePane(pane => observed.push(pane))
    })

    return it('invokes observers when the active pane changes', function () {
      pane1.activate()
      pane2.activate()
      return expect(observed).toEqual([pane1, pane2])
    })
  })

  describe('::onDidChangeActivePaneItem()', function () {
    let [container, pane1, pane2, observed] = Array.from([])

    beforeEach(function () {
      container = new PaneContainer(params)
      container.getRoot().addItems([new Object(), new Object()])
      container.getRoot().splitRight({ items: [new Object(), new Object()] });
      [pane1, pane2] = Array.from(container.getPanes())

      observed = []
      return container.onDidChangeActivePaneItem(item => observed.push(item))
    })

    it('invokes observers when the active item of the active pane changes', function () {
      pane2.activateNextItem()
      pane2.activateNextItem()
      return expect(observed).toEqual([pane2.itemAtIndex(1), pane2.itemAtIndex(0)])
    })

    return it('invokes observers when the active pane changes', function () {
      pane1.activate()
      pane2.activate()
      return expect(observed).toEqual([pane1.itemAtIndex(0), pane2.itemAtIndex(0)])
    })
  })

  describe('::onDidStopChangingActivePaneItem()', function () {
    let [container, pane1, pane2, observed] = Array.from([])

    beforeEach(function () {
      container = new PaneContainer(params)
      container.getRoot().addItems([new Object(), new Object()])
      container.getRoot().splitRight({ items: [new Object(), new Object()] });
      [pane1, pane2] = Array.from(container.getPanes())

      observed = []
      return container.onDidStopChangingActivePaneItem(item => observed.push(item))
    })

    it('invokes observers once when the active item of the active pane changes', function () {
      pane2.activateNextItem()
      pane2.activateNextItem()
      expect(observed).toEqual([])
      advanceClock(100)
      return expect(observed).toEqual([pane2.itemAtIndex(0)])
    })

    return it('invokes observers once when the active pane changes', function () {
      pane1.activate()
      pane2.activate()
      expect(observed).toEqual([])
      advanceClock(100)
      return expect(observed).toEqual([pane2.itemAtIndex(0)])
    })
  })

  describe('::onDidActivatePane', () =>
    it('invokes observers when a pane is activated (even if it was already active)', function () {
      const container = new PaneContainer(params)
      container.getRoot().splitRight()
      const [pane1, pane2] = Array.from(container.getPanes())

      const activatedPanes = []
      container.onDidActivatePane(pane => activatedPanes.push(pane))

      pane1.activate()
      pane1.activate()
      pane2.activate()
      pane2.activate()
      return expect(activatedPanes).toEqual([pane1, pane1, pane2, pane2])
    })
  )

  describe('::observePanes()', () =>
    it('invokes observers with all current and future panes', function () {
      const container = new PaneContainer(params)
      container.getRoot().splitRight()
      const [pane1, pane2] = Array.from(container.getPanes())

      const observed = []
      container.observePanes(pane => observed.push(pane))

      const pane3 = pane2.splitDown()
      const pane4 = pane2.splitRight()

      return expect(observed).toEqual([pane1, pane2, pane3, pane4])
    })
  )

  describe('::observePaneItems()', () =>
    it('invokes observers with all current and future pane items', function () {
      const container = new PaneContainer(params)
      container.getRoot().addItems([new Object(), new Object()])
      container.getRoot().splitRight({ items: [new Object()] })
      const [pane1, pane2] = Array.from(container.getPanes())
      const observed = []
      container.observePaneItems(pane => observed.push(pane))

      const pane3 = pane2.splitDown({ items: [new Object()] })
      pane3.addItems([new Object(), new Object()])

      return expect(observed).toEqual(container.getPaneItems())
    })
  )

  describe('::confirmClose()', function () {
    let [container, pane1, pane2] = Array.from([])

    beforeEach(function () {
      class TestItem {
        shouldPromptToSave () { return true }
        getURI () { return 'test' }
      }

      container = new PaneContainer(params)
      container.getRoot().splitRight();
      [pane1, pane2] = Array.from(container.getPanes())
      pane1.addItem(new TestItem())
      return pane2.addItem(new TestItem())
    })

    it('returns true if the user saves all modified files when prompted', function () {
      confirm.andReturn(0)
      return waitsForPromise(() =>
        container.confirmClose().then(function (saved) {
          expect(confirm).toHaveBeenCalled()
          return expect(saved).toBeTruthy()
        })
      )
    })

    return it('returns false if the user cancels saving any modified file', function () {
      confirm.andReturn(1)
      return waitsForPromise(() =>
        container.confirmClose().then(function (saved) {
          expect(confirm).toHaveBeenCalled()
          return expect(saved).toBeFalsy()
        })
      )
    })
  })

  describe('::onDidAddPane(callback)', () =>
    it('invokes the given callback when panes are added', function () {
      const container = new PaneContainer(params)
      const events = []
      container.onDidAddPane(function (event) {
        let needle
        expect((needle = event.pane, Array.from(container.getPanes()).includes(needle))).toBe(true)
        return events.push(event)
      })

      const pane1 = container.getActivePane()
      const pane2 = pane1.splitRight()
      const pane3 = pane2.splitDown()

      return expect(events).toEqual([{ pane: pane2 }, { pane: pane3 }])
    })
  )

  describe('::onWillDestroyPane(callback)', () =>
    it('invokes the given callback before panes or their items are destroyed', function () {
      class TestItem {
        constructor () { this._isDestroyed = false }
        destroy () { return this._isDestroyed = true }
        isDestroyed () { return this._isDestroyed }
      }

      const container = new PaneContainer(params)
      const events = []
      container.onWillDestroyPane(function (event) {
        const itemsDestroyed = (Array.from(event.pane.getItems()).map((item) => item.isDestroyed()))
        return events.push([event, { itemsDestroyed }])
      })

      const pane1 = container.getActivePane()
      const pane2 = pane1.splitRight()
      pane2.addItem(new TestItem())

      pane2.destroy()

      return expect(events).toEqual([[{ pane: pane2 }, { itemsDestroyed: [false] }]])
    })
  )

  describe('::onDidDestroyPane(callback)', function () {
    it('invokes the given callback when panes are destroyed', function () {
      const container = new PaneContainer(params)
      const events = []
      container.onDidDestroyPane(function (event) {
        let needle
        expect((needle = event.pane, Array.from(container.getPanes()).includes(needle))).toBe(false)
        return events.push(event)
      })

      const pane1 = container.getActivePane()
      const pane2 = pane1.splitRight()
      const pane3 = pane2.splitDown()

      pane2.destroy()
      pane3.destroy()

      return expect(events).toEqual([{ pane: pane2 }, { pane: pane3 }])
    })

    return it('invokes the given callback when the container is destroyed', function () {
      const container = new PaneContainer(params)
      const events = []
      container.onDidDestroyPane(function (event) {
        let needle
        expect((needle = event.pane, Array.from(container.getPanes()).includes(needle))).toBe(false)
        return events.push(event)
      })

      const pane1 = container.getActivePane()
      const pane2 = pane1.splitRight()
      const pane3 = pane2.splitDown()

      container.destroy()

      return expect(events).toEqual([{ pane: pane1 }, { pane: pane2 }, { pane: pane3 }])
    })
  })

  describe('::onWillDestroyPaneItem() and ::onDidDestroyPaneItem', () =>
    it('invokes the given callbacks when an item will be destroyed on any pane', function () {
      const container = new PaneContainer(params)
      const pane1 = container.getRoot()
      const item1 = new Object()
      const item2 = new Object()
      const item3 = new Object()

      pane1.addItem(item1)
      const events = []
      container.onWillDestroyPaneItem(event => events.push(['will', event]))
      container.onDidDestroyPaneItem(event => events.push(['did', event]))
      const pane2 = pane1.splitRight({ items: [item2, item3] })

      pane1.destroyItem(item1)
      pane2.destroyItem(item3)
      pane2.destroyItem(item2)

      return expect(events).toEqual([
        ['will', { item: item1, pane: pane1, index: 0 }],
        ['did', { item: item1, pane: pane1, index: 0 }],
        ['will', { item: item3, pane: pane2, index: 1 }],
        ['did', { item: item3, pane: pane2, index: 1 }],
        ['will', { item: item2, pane: pane2, index: 0 }],
        ['did', { item: item2, pane: pane2, index: 0 }]
      ])
    })
  )

  describe('::saveAll()', () =>
    it('saves all modified pane items', function () {
      const container = new PaneContainer(params)
      const pane1 = container.getRoot()
      const pane2 = pane1.splitRight()

      const item1 = {
        saved: false,
        getURI () { return '' },
        isModified () { return true },
        save () { return this.saved = true }
      }
      const item2 = {
        saved: false,
        getURI () { return '' },
        isModified () { return false },
        save () { return this.saved = true }
      }
      const item3 = {
        saved: false,
        getURI () { return '' },
        isModified () { return true },
        save () { return this.saved = true }
      }

      pane1.addItem(item1)
      pane1.addItem(item2)
      pane1.addItem(item3)

      container.saveAll()

      expect(item1.saved).toBe(true)
      expect(item2.saved).toBe(false)
      return expect(item3.saved).toBe(true)
    })
  )

  return describe('::moveActiveItemToPane(destPane) and ::copyActiveItemToPane(destPane)', function () {
    let [container, pane1, pane2, item1] = Array.from([])

    beforeEach(function () {
      class TestItem {
        constructor (id) { this.id = id }
        copy () { return new TestItem(this.id) }
      }

      container = new PaneContainer(params)
      pane1 = container.getRoot()
      item1 = new TestItem('1')
      return pane2 = pane1.splitRight({ items: [item1] })
    })

    describe('::::moveActiveItemToPane(destPane)', () =>
      it('moves active item to given pane and focuses it', function () {
        container.moveActiveItemToPane(pane1)
        return expect(pane1.getActiveItem()).toBe(item1)
      })
    )

    return describe('::::copyActiveItemToPane(destPane)', () =>
      it('copies active item to given pane and focuses it', function () {
        container.copyActiveItemToPane(pane1)
        expect(container.paneForItem(item1)).toBe(pane2)
        return expect(pane1.getActiveItem().id).toBe(item1.id)
      })
    )
  })
})
