/** @babel */
/* eslint-disable
    handle-callback-err,
    no-return-assign,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path')
const http = require('http')
const temp = require('temp').track()
const os = require('os')
const remote = require('remote')
const async = require('async')
const { map, extend, once, difference } = require('underscore-plus')
const { spawn, spawnSync } = require('child_process')
const webdriverio = require('../../../script/node_modules/webdriverio')

const AtomPath = remote.process.argv[0]
const AtomLauncherPath = path.join(__dirname, '..', 'helpers', 'atom-launcher.sh')
const ChromedriverPath = path.resolve(__dirname, '..', '..', '..', 'script', 'node_modules', 'electron-chromedriver', 'bin', 'chromedriver')
const SocketPath = path.join(os.tmpdir(), `atom-integration-test-${Date.now()}.sock`)
const ChromedriverPort = 9515
const ChromedriverURLBase = '/wd/hub'
const ChromedriverStatusURL = `http://localhost:${ChromedriverPort}${ChromedriverURLBase}/status`

let userDataDir = null

var chromeDriverUp = function (done) {
  const checkStatus = () =>
    http
      .get(ChromedriverStatusURL, function (response) {
        if (response.statusCode === 200) {
          return done()
        } else {
          return chromeDriverUp(done)
        }
      }).on('error', () => chromeDriverUp(done))

  return setTimeout(checkStatus, 100)
}

var chromeDriverDown = function (done) {
  const checkStatus = () =>
    http
      .get(ChromedriverStatusURL, response => chromeDriverDown(done)).on('error', done)

  return setTimeout(checkStatus, 100)
}

const buildAtomClient = function (args, env) {
  userDataDir = temp.mkdirSync('atom-user-data-dir')
  const client = webdriverio.remote({
    host: 'localhost',
    port: ChromedriverPort,
    desiredCapabilities: {
      browserName: 'atom',
      chromeOptions: {
        binary: AtomLauncherPath,
        args: [
          `atom-path=${AtomPath}`,
          `atom-args=${args.join(' ')}`,
          `atom-env=${map(env, (value, key) => `${key}=${value}`).join(' ')}`,
          'dev',
          'safe',
          `user-data-dir=${userDataDir}`,
          `socket-path=${SocketPath}`
        ]
      }
    } })

  let isRunning = false
  client.on('init', () => isRunning = true)
  client.on('end', () => isRunning = false)

  return client
    .addCommand('waitUntil', function (conditionFn, timeout, cb) {
      let succeeded
      let timedOut = (succeeded = false)
      const pollingInterval = Math.min(timeout, 100)
      setTimeout(() => timedOut = true, timeout)
      return async.until(
        () => succeeded || timedOut,
        next => {
          return setTimeout(() => {
            return conditionFn.call(this).then(
              function (result) {
                succeeded = result
                return next()
              },
              err => next(err)
            )
          }
          , pollingInterval)
        },
        err => cb(err, succeeded))
    }).addCommand('waitForWindowCount', function (count, timeout, cb) {
      return this.waitUntil(function () {
        return this.windowHandles().then(({ value }) => value.length === count)
      }
      , timeout)
        .then(result => expect(result).toBe(true))
        .windowHandles(cb)
    }).addCommand('waitForPaneItemCount', function (count, timeout, cb) {
      return this.waitUntil(function () {
        return this.execute(() => __guard__(atom.workspace != null ? atom.workspace.getActivePane() : undefined, x => x.getItems().length))
          .then(({ value }) => value === count)
      }
      , timeout)
        .then(function (result) {
          expect(result).toBe(true)
          return cb(null)
        })
    }).addCommand('treeViewRootDirectories', function (cb) {
      return this.waitForExist('.tree-view', 10000)
        .execute(() =>
          Array.from(document.querySelectorAll('.tree-view .project-root > .header .name')).map((element) =>
            element.dataset.path)

        , cb)
    }).addCommand('waitForNewWindow', function (fn, timeout, done) {
      return this.windowHandles(function (err, { value: oldWindowHandles }) {
        if (!isRunning) { return done() }
        return this.call(fn)
          .waitForWindowCount(oldWindowHandles.length + 1, 5000)
          .then(function ({ value: newWindowHandles }) {
            const [newWindowHandle] = Array.from(difference(newWindowHandles, oldWindowHandles))
            if (!newWindowHandle) { return done() }
            return this.window(newWindowHandle)
              .waitForExist('atom-workspace', 10000, done)
          })
      })
    }).addCommand('startAnotherAtom', function (args, env, done) {
      return this.call(function () {
        if (isRunning) {
          spawnSync(AtomPath, args.concat([
            '--dev',
            '--safe',
            `--socket-path=${SocketPath}`
          ]), { env: extend({}, process.env, env) })
        }
        return done()
      })
    }).addCommand('dispatchCommand', function (command, done) {
      return this.execute(`atom.commands.dispatch(document.activeElement, '${command}')`)
        .call(done)
    })
}

module.exports = function (args, env, fn) {
  let [chromedriver, chromedriverLogs, chromedriverExit] = Array.from([])

  runs(function () {
    chromedriver = spawn(ChromedriverPath, [
      '--verbose',
      `--port=${ChromedriverPort}`,
      `--url-base=${ChromedriverURLBase}`
    ])

    chromedriverLogs = []
    return chromedriverExit = new Promise(function (resolve) {
      let errorCode = null
      chromedriver.on('exit', function (code, signal) {
        if (signal == null) { return errorCode = code }
      })
      chromedriver.stderr.on('data', log => chromedriverLogs.push(log.toString()))
      return chromedriver.stderr.on('close', () => resolve(errorCode))
    })
  })

  waitsFor('webdriver to start', chromeDriverUp, 15000)

  waitsFor('tests to run', function (done) {
    const finish = once(() =>
      client.end()
        .then(() => chromedriver.kill())
        .then(chromedriverExit.then(
          function (errorCode) {
            if (errorCode != null) {
              jasmine.getEnv().currentSpec.fail(`\
Chromedriver exited with code ${errorCode}.
Logs:\n${chromedriverLogs.join('\n')}\
`
              )
            }
            return done()
          }))
    )

    var client = buildAtomClient(args, env)

    client.on('error', function (err) {
      jasmine.getEnv().currentSpec.fail(new Error(__guard__(__guard__(err.response != null ? err.response.body : undefined, x1 => x1.value), x => x.message)))
      return finish()
    })

    return fn(
      client.init()
        .waitUntil(function () { return this.windowHandles().then(({ value }) => value.length > 0) }, 10000)
        .waitForExist('atom-workspace', 10000)
    ).then(finish)
  }
  , 30000)

  return waitsFor('webdriver to stop', chromeDriverDown, 15000)
}

function __guard__ (value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined
}
