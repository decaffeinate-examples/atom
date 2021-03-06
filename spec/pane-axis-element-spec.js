/** @babel */
/* eslint-disable
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const PaneAxis = require('../src/pane-axis')
const PaneContainer = require('../src/pane-container')
const Pane = require('../src/pane')

const buildPane = () =>
  new Pane({
    applicationDelegate: atom.applicationDelegate,
    config: atom.config,
    deserializerManager: atom.deserializers,
    notificationManager: atom.notifications,
    viewRegistry: atom.views
  })

describe('PaneAxisElement', () =>
  it('correctly subscribes and unsubscribes to the underlying model events on attach/detach', function () {
    const container = new PaneContainer({ config: atom.config, applicationDelegate: atom.applicationDelegate, viewRegistry: atom.views })
    const axis = new PaneAxis({}, atom.views)
    axis.setContainer(container)
    const axisElement = axis.getElement()

    const panes = [buildPane(), buildPane(), buildPane()]

    jasmine.attachToDOM(axisElement)
    axis.addChild(panes[0])
    expect(axisElement.children[0]).toBe(panes[0].getElement())

    axisElement.remove()
    axis.addChild(panes[1])
    expect(axisElement.children[2]).toBeUndefined()

    jasmine.attachToDOM(axisElement)
    expect(axisElement.children[2]).toBe(panes[1].getElement())

    axis.addChild(panes[2])
    return expect(axisElement.children[4]).toBe(panes[2].getElement())
  })
)
