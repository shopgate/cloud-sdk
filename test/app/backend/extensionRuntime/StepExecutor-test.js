const assert = require('assert')
const path = require('path')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const fs = require('fs-extra')
const async = require('neo-async')

const StepExecutor = require('../../../../lib/app/backend/extensionRuntime/StepExecutor')
const AppSettings = require('../../../../lib/app/AppSettings')
const UserSettings = require('../../../../lib/user/UserSettings')
const appPath = path.join('build', 'appsettings')
const proxyquire = require('proxyquire').noPreserveCache()

describe('StepExecutor', () => {
  let executor
  let log
  let appTestFolder
  let userTestFolder

  beforeEach(function (done) {
    this.timeout(10000)
    userTestFolder = path.join('build', 'usersettings')
    process.env.USER_PATH = userTestFolder
    appTestFolder = path.join('build', 'appsettings')
    process.env.SGCLOUD_DC_WS_ADDRESS = `http://nockedDc`
    process.env.APP_PATH = appTestFolder
    log = {info: () => {}, error: () => {}, debug: () => {}, warn: () => {}}
    executor = new StepExecutor(log)
    executor.stepTimeout = 1000

    const appSettings = new AppSettings()
    mkdirp.sync(path.join(appPath, AppSettings.SETTINGS_FOLDER))
    mkdirp.sync(path.join(appPath, AppSettings.EXTENSIONS_FOLDER, 'foobar', 'extension'))
    appSettings.setId('shop_10006').setAttachedExtensions({'@foo/bar': {path: 'foobar'}}).save().init()
    AppSettings.setInstance(appSettings)
    UserSettings.getInstance().getSession().token = {}

    const fakeStepDir = path.join(__dirname, 'fakeSteps')
    const extensionDir = path.join(appPath, AppSettings.EXTENSIONS_FOLDER, 'foobar', 'extension')
    async.parallel([
      cb => fs.copy(path.join(fakeStepDir, 'simple.js'), path.join(extensionDir, 'simple.js'), cb),
      cb => fs.copy(path.join(fakeStepDir, 'crashing.js'), path.join(extensionDir, 'crashing.js'), cb),
      cb => fs.copy(path.join(fakeStepDir, 'timeout.js'), path.join(extensionDir, 'timeout.js'), cb),
      cb => executor.start(cb)
    ], done)
  })

  afterEach((done) => {
    UserSettings.setInstance()
    AppSettings.setInstance()
    delete process.env.SGCLOUD_DC_WS_ADDRESS
    delete process.env.APP_PATH
    delete process.env.USER_PATH

    async.parallel([
      (cb) => executor.stop(cb),
      (cb) => rimraf(appTestFolder, cb),
      (cb) => rimraf(userTestFolder, cb)
    ], done)
  })

  describe('watcher', () => {
    it('should start the watcher', (done) => {
      const watcher = {
        events: {},
        on: function (event, fn) {
          this.events[event] = fn
        },
        emit: function (event, param1, param2, cb) {
          this.events[event](param1, param2)
        }
      }

      const StepExecutorMocked = proxyquire('../../../../lib/app/backend/extensionRuntime/StepExecutor', {
        chokidar: {
          watch: (path, options) => {
            assert.equal(path, 'extensions')
            return watcher
          }
        }
      })
      const stepExecutor = new StepExecutorMocked({info: () => {}})
      stepExecutor.start = (cb) => {
        done()
        cb()
      }
      stepExecutor.stop = (cb) => cb()

      assert.equal(stepExecutor.watcher, undefined)

      stepExecutor.startWatcher(() => {
        watcher.emit('all')
      })
      watcher.emit('ready')
    })

    it('should stop the watcher', (done) => {
      const watcher = {
        closed: false,
        close: function () {
          this.closed = true
        }
      }

      const StepExecutorMocked = proxyquire('../../../../lib/app/backend/extensionRuntime/StepExecutor', {
        chokidar: {
          watch: (path, options) => {
            assert.equal(path, 'extensions')
            return watcher
          }
        }
      })

      const stepExecutor = new StepExecutorMocked({info: () => {}})

      stepExecutor.stopWatcher((err) => {
        assert.ifError(err)
        done()
      })
    })
  })

  it('should not start another childProcess when one is already running', (done) => {
    executor.start((err) => {
      assert.ok(err)
      done()
    })
  })

  it('should call a local step action', (done) => {
    const input = {foo: 'bar'}
    const stepMeta = {
      id: '@foo/bar',
      path: '@foo/bar/simple.js',
      meta: {appId: 'shop_123'}
    }
    executor.execute(input, stepMeta, (err, output) => {
      assert.ifError(err)
      assert.deepEqual(output, input)
      done()
    })
  })

  it('should fail if step file is not existent', (done) => {
    const input = {foo: 'bar'}
    const stepMeta = {
      id: '@foo/bar',
      path: '@foo/bar/notThere.js',
      meta: {appId: 'shop_123'}
    }
    executor.execute(input, stepMeta, (err) => {
      assert.ok(err)
      assert.ok(err.message.endsWith('notThere.js" not found'))
      done()
    })
  })

  it('should crash and recover if step crashed', (done) => {
    const stepMeta = {
      id: '@foo/bar',
      path: '@foo/bar/crashing.js',
      meta: {appId: 'shop_123'}
    }

    let exitCalled = false
    executor.start = (cb) => {
      assert.equal(executor.childProcess, undefined)
      assert.ok(exitCalled)
      done()
    }

    const onExit = executor.onExit.bind(executor)
    executor.onExit = (code, signal) => {
      if (!exitCalled) {
        assert.equal(code, 1)
        assert.equal(signal, null)
      }
      assert.ok(executor.childProcess)
      exitCalled = true
      onExit(code, signal)
    }

    executor.execute({}, stepMeta, assert.ok)
  })

  it('should timeout', (done) => {
    const stepMeta = {
      id: '@foo/bar',
      path: '@foo/bar/timeout.js',
      meta: {appId: 'shop_123'}
    }
    executor.execute({}, stepMeta, (err) => {
      assert.ok(err)
      assert.equal(err.message, 'Step timeout')
      done()
    })
  })
})
