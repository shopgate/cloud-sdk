const assert = require('assert')
const fsEx = require('fs-extra')
const os = require('os')
const path = require('path')
const proxyquire = require('proxyquire').noPreserveCache()
const sinon = require('sinon')
const { promisify } = require('util')
const config = require('../../../../lib/config')
const DcHttpClient = require('../../../../lib/DcHttpClient')
const AppSettings = require('../../../../lib/app/AppSettings')
const { EXTENSIONS_FOLDER, SETTINGS_FOLDER } = require('../../../../lib/app/Constants')
const StepExecutor = require('../../../../lib/app/backend/extensionRuntime/StepExecutor')
const UserSettings = require('../../../../lib/user/UserSettings')

let forkMock = () => (true)

describe('StepExecutor', () => {
  let tempDir
  let userDir
  let appPath

  before(async () => {
    tempDir = await promisify(fsEx.mkdtemp)(path.join(os.tmpdir(), 'sgtest-'))
    userDir = path.join(tempDir, 'user')
    appPath = path.join(tempDir, 'app')
    config.load({ userDirectory: userDir })
  })

  after(async () => {
    await fsEx.remove(tempDir)
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

      const pathes = [
        path.join(appPath, 'extensions', '**', 'extension', '*.js'),
        path.join(appPath, 'extensions', '**', 'extension', '**', '*.js')
      ]

      const StepExecutorMocked = proxyquire('../../../../lib/app/backend/extensionRuntime/StepExecutor', {
        chokidar: {
          watch: (actualPath, options) => {
            assert.deepEqual(actualPath, pathes)
            return watcher
          }
        }
      })
      const stepExecutor = new StepExecutorMocked({ info: () => {} }, { getApplicationFolder: () => appPath })
      stepExecutor.start = sinon.stub().resolves()
      stepExecutor.stop = () => {
        return new Promise((resolve, reject) => {
          done()
          resolve()
        })
      }

      assert.equal(stepExecutor.watcher, undefined)
      stepExecutor.startWatcher().then(() => watcher.emit('all'))
      watcher.emit('ready')
    })

    it('should stop the watcher', () => {
      let called = 0
      const watcher = {
        closed: false,
        close: function () {
          called++
          this.closed = true
        },
        events: {},
        on: function (event, fn) {
          this.events[event] = fn
        },
        emit: function (event, param1, param2, cb) {
          this.events[event](param1, param2)
        },
        removeAllListeners: () => {}
      }

      const pathes = [
        path.join(appPath, 'extensions', '**', 'extension', '*.js'),
        path.join(appPath, 'extensions', '**', 'extension', '**', '*.js')
      ]

      const StepExecutorMocked = proxyquire('../../../../lib/app/backend/extensionRuntime/StepExecutor', {
        chokidar: {
          watch: (actualPath, options) => {
            assert.deepEqual(actualPath, pathes)
            return watcher
          }
        }
      })

      const stepExecutor = new StepExecutorMocked({ info: () => {} }, { getApplicationFolder: () => appPath })

      stepExecutor.startWatcher()
      watcher.emit('ready')

      return stepExecutor.stopWatcher().then(() => assert.equal(called, 1))
    })
  })

  describe('childProcess', () => {
    let executor
    let log
    let appTestFolder
    let userTestFolder

    let appSettings
    let userSettings
    let dcHttpClient
    let extensionDir

    let basicProcessMock

    before(() => {
      extensionDir = path.join(appPath, EXTENSIONS_FOLDER, 'foobar', 'extension')
    })

    beforeEach(async function () {
      this.timeout(10000)

      basicProcessMock = {
        connected: true,
        on: (code, callback) => {
          callback()
        }
      }
      userTestFolder = path.join(tempDir, 'usersettings')
      config.load({ userDirectory: userTestFolder })
      appTestFolder = path.join(tempDir, 'appsettings')
      process.env.SGCLOUD_DC_WS_ADDRESS = `http://nockedDc`
      process.env.APP_PATH = appTestFolder
      log = { info: () => { }, error: () => { }, debug: () => { }, warn: () => { } }
      appSettings = new AppSettings(appTestFolder)
      await appSettings.setId('shop_123')
      userSettings = new UserSettings().setToken({})
      dcHttpClient = new DcHttpClient(userSettings, log)
      executor = new StepExecutor(log, appSettings, dcHttpClient)
      executor.stepTimeout = 1000
      executor.stepLogger = { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} }

      try {
        await fsEx.ensureDir(path.join(appTestFolder, SETTINGS_FOLDER))
        await fsEx.writeJson(appSettings.attachedExtensionsFile, { attachedExtensions: { '@foo/bar': { path: 'foobar' } } })
        await fsEx.emptyDir(extensionDir)
      } catch (error) {

      }
    })

    afterEach(async () => {
      delete process.env.SGCLOUD_DC_WS_ADDRESS
      delete process.env.APP_PATH
      delete process.env.USER_DIR

      try {
        await Promise.all([
          fsEx.remove(appTestFolder),
          fsEx.remove(userTestFolder)
        ])
      } catch (err) {
        assert.ifError(err)
      } finally {
        executor.childProcess = {}
        executor.childProcess.on = (code, callback) => {
          callback()
        }
        await executor.stop()
      }
    })

    it('should not start another childProcess when one is already running', async () => {
      try {
        executor.childProcess = true
        await executor.start()
      } catch (err) {
        assert.equal(err.message, 'childProcess already running')
      }
    })

    it('should call a local step action', (done) => {
      const input = { foo: 'bar' }
      const stepMeta = {
        id: '@foo/bar',
        path: '@foo/bar/simple.js',
        meta: { appId: 'shop_123' }
      }
      basicProcessMock.send = (given) => {
        assert.equal(input, given.input)
        assert.equal(stepMeta, given.stepMeta)
        const callId = Object.keys(executor.openCalls)[0]
        clearTimeout(executor.openTimeouts[callId])
        done()
      }
      executor.childProcess = basicProcessMock
      executor.onExit = () => { }
      executor.execute(input, stepMeta, (err, output) => {
        assert.ifError(err)
        assert.fail()
      })
    })

    it('should callback error', (done) => {
      const input = { foo: 'bar', bar: { nestedFoo: 'nestedBar' } }
      const callId = 1
      const stepMeta = {
        id: '@foo/bar',
        path: '@foo/bar/promise-reject.js',
        meta: { appId: 'shop_123' }
      }
      const err = { name: 'Error', message: 'crashed ' + stepMeta.meta.appId }
      Object.assign(err, input)

      const type = 'output'
      const level = 'debug'
      const output = null
      executor.openCalls[callId] = (caughtErr, returnedOutput) => {
        assert.deepEqual(caughtErr, Object.assign({ name: 'Error', message: 'crashed ' + stepMeta.meta.appId }, input))
        done()
      }
      executor.latestStepMeta = stepMeta
      executor.onMessage({ type, arguments, level, callId, output, err })
    })

    it('should callback error of promise step (with all fields)', (done) => {
      const callId = 1
      const output = { 'key': 'value' }
      const type = 'output'
      const level = 'debug'
      const err = null
      executor.openCalls[callId] = (caughtErr, returnedOutput) => {
        assert.equal(returnedOutput, output)
        done()
      }
      const stepMeta = {
        id: '@foo/bar',
        path: '@foo/bar/promise-reject.js',
        meta: { appId: 'shop_123' }
      }
      executor.latestStepMeta = stepMeta
      executor.onMessage({ type, arguments, level, callId, output, err })
    })

    it('should crash and recover if step crashed', (done) => {
      executor.childProcess = {}
      executor.childProcess.stop = false

      executor.start = () => {
        assert.equal(executor.childProcess, undefined)
        done()
      }

      executor.onExit(1, '')
    })

    it('should timeout', (done) => {
      executor.childProcess = basicProcessMock
      executor.childProcess.send = () => { }
      const stepMeta = {
        id: '@foo/bar',
        path: '@foo/bar/timeout.js',
        meta: { appId: 'shop_123' }
      }
      executor.onExit = () => { }
      executor.execute({}, stepMeta, (err) => {
        assert.ok(err)
        assert.equal(err.message, `Step '${stepMeta.path}' timeout`)
        assert.equal(err.code, 'ETIMEOUT')
        done()
      })
    })

    it('should start the sub process with "--inspect" if requested', async () => {
      const listeners = []
      forkMock = () => {
        return {
          on: (event, cb) => {
            if (event === 'message') {
              const data = { ready: true }
              return cb(data)
            }
            listeners.push({ event, cb })
          }
        }
      }
      const StepExecutorMocked = proxyquire('../../../../lib/app/backend/extensionRuntime/StepExecutor', {
        child_process: {
          fork: (program, { execArgv }, options) => {
            assert.ok(execArgv.includes('--inspect'))
            return forkMock(program, execArgv, options)
          }
        }
      })

      const executor = new StepExecutorMocked({ info: () => { } }, { getApplicationFolder: () => appPath }, null, true)
      await executor.start()

      const listeningToEvents = listeners.map(object => (object.event))
      assert.ok(listeningToEvents.includes('error'))
      assert.ok(listeningToEvents.includes('exit'))
      assert.ok(listeningToEvents.includes('disconnect'))
    })

    it('should send the DC response back to child process upon incoming request', (done) => {
      const expectedResourceName = 'some resource'
      const expectedAppId = 'shop_1337'
      const expectedDeviceId = 'shop_1773'

      const expectedInformation = { information: 'whatever DC may return' }
      const expectedRequestId = '1337'

      dcHttpClient.getInfos = (infoType, appId, deviceId) => {
        assert.equal(infoType, expectedResourceName)
        assert.equal(appId, expectedAppId)
        assert.equal(deviceId, expectedDeviceId)

        return expectedInformation
      }

      executor.childProcess = {
        send: message => {
          assert.equal(message.type, 'dcResponse')
          assert.equal(message.requestId, expectedRequestId)
          assert.equal(message.info, expectedInformation)
          done()
        }
      }

      executor.onMessage({
        type: 'dcRequest',
        dcRequest: {
          resourceName: expectedResourceName,
          appId: expectedAppId,
          deviceId: expectedDeviceId,
          requestId: expectedRequestId
        }
      })
    })

    it('should start the sub process without "--inspect" if not requested', async () => {
      const listeners = []
      forkMock = () => {
        return {
          on: (event, cb) => {
            if (event === 'message') {
              const data = { ready: true }
              return cb(data)
            }
            listeners.push({ event, cb })
          }
        }
      }
      const StepExecutorMocked = proxyquire('../../../../lib/app/backend/extensionRuntime/StepExecutor', {
        child_process: {
          fork: (program, { execArgv }, options) => {
            assert.ok(!execArgv.includes('--inspect'))
            return forkMock(program, execArgv, options)
          }
        }
      })

      const executor = new StepExecutorMocked({ info: () => { } }, { getApplicationFolder: () => appPath }, null, false)
      await executor.start()

      const listeningToEvents = listeners.map(object => (object.event))
      assert.ok(listeningToEvents.includes('error'))
      assert.ok(listeningToEvents.includes('exit'))
      assert.ok(listeningToEvents.includes('disconnect'))
    })

    it('should stop the connected child process if stop() is called', () => {
      return new Promise((resolve, reject) => {
        const executor = new StepExecutor(log, appSettings, dcHttpClient, false)
        let onCalled = false
        let disconnectCalled = false
        let killCalled = false

        executor.childProcess = {
          connected: true,
          on: event => {
            try {
              assert.equal(event, 'exit')
            } catch (err) {
              reject(err)
            }

            if (disconnectCalled && killCalled) resolve()
            onCalled = true
          },
          disconnect: () => {
            if (onCalled && killCalled) resolve()

            disconnectCalled = true
          },
          kill: (signal) => {
            try {
              assert.equal(signal, 'SIGINT')
            } catch (err) {
              reject(err)
            }

            if (onCalled && disconnectCalled) resolve()
            killCalled = true
          }
        }

        executor.stop()
      })
    })
  })
})
