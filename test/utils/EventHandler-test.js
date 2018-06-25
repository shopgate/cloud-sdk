const assert = require('assert')
const path = require('path')
const mockFs = require('mock-fs')
const fsEx = require('fs-extra')
const proxyquire = require('proxyquire')

const logger = {}

let extensionConfigValidated = false
let validateExtensionConfig

let generatedComponentJson = false
let generateComponentsJson

let pushedHooks = false
let pushHooks

let wroteLocalPipelines = false
let writeLocalPipelines

const EventHandler = proxyquire('../../lib/utils/EventHandler', {
  '../logger': logger,
  './utils': {
    generateComponentsJson: async () => { return generateComponentsJson() },
    validateExtensionConfig: async () => { return validateExtensionConfig() },
    pushHooks: async () => { return pushHooks() },
    writeLocalPipelines: async () => { return writeLocalPipelines() }
  }
})

describe('EventHandler', () => {
  const config = {
    file: { id: 'foo' },
    path: 'bar'
  }

  const settings = { getId: async () => (1) }

  const expectedBackendConfig = { something: 'something' }
  const expectedFrontendConfig = { somethingElse: 'somethingElse' }

  const dcClient = {
    generateExtensionConfig: async (file, appId) => {
      return {
        backend: expectedBackendConfig,
        frontend: expectedFrontendConfig
      }
    }
  }

  beforeEach(async () => {
    generateComponentsJson = async () => {
      generatedComponentJson = true
      return true
    }
    validateExtensionConfig = async () => { extensionConfigValidated = true }
    pushHooks = async () => { pushedHooks = true }
    writeLocalPipelines = async () => { wroteLocalPipelines = true }

    logger.debug = (message) => { }
    logger.warn = (message) => { }
    logger.info = (message) => { }
    logger.error = (message) => { }

    mockFs()
  })

  afterEach(async () => { mockFs.restore() })

  it('should write config.json and components.json on change', (done) => {
    fsEx.ensureDirSync(path.join(config.path, 'extension'))
    fsEx.ensureDirSync(path.join(config.path, 'frontend'))

    EventHandler.extensionConfigChanged(config, settings, dcClient).then(async () => {
      assert.equal(extensionConfigValidated, true)
      assert.equal(generatedComponentJson, true)
      assert.equal(pushedHooks, true)
      assert.equal(wroteLocalPipelines, true)
      assert.deepEqual(await fsEx.readJson(path.join(config.path, 'extension', 'config.json')), expectedBackendConfig)
      assert.deepEqual(await fsEx.readJson(path.join(config.path, 'frontend', 'config.json')), expectedFrontendConfig)
      done()
    })
  })

  it('should fail because validateExtensionConfig fails', async () => {
    validateExtensionConfig = async () => { throw new Error('error_validateExtensionConfig') }

    const dcClient = {}

    let loggedError = false
    logger.debug = (err) => {
      loggedError = true
      assert.equal(err.message, 'error_validateExtensionConfig')
    }

    await EventHandler.extensionConfigChanged(config, settings, dcClient)
    assert.ok(loggedError)
  })

  it('should fail because generateComponentsJson fails', async () => {
    fsEx.ensureDirSync(path.join(config.path, 'extension'))
    fsEx.ensureDirSync(path.join(config.path, 'frontend'))

    generateComponentsJson = async () => { throw new Error('error_generateComponentsJson') }

    let loggedError = false
    logger.debug = (err) => {
      loggedError = true
      assert.equal(err.message, 'error_generateComponentsJson')
    }

    await EventHandler.extensionConfigChanged(config, settings, dcClient)
    assert.equal(extensionConfigValidated, true)
    assert.ok(loggedError)
  })

  it('should fail because pushHooks fails', async () => {
    fsEx.ensureDirSync(path.join(config.path, 'extension'))
    fsEx.ensureDirSync(path.join(config.path, 'frontend'))

    pushHooks = async () => { throw new Error('error_pushHooks') }

    let loggedError = false
    logger.debug = (err) => {
      loggedError = true
      assert.equal(err.message, 'error_pushHooks')
    }

    await EventHandler.extensionConfigChanged(config, settings, dcClient)
    assert.equal(extensionConfigValidated, true)
    assert.equal(generatedComponentJson, true)
    assert.ok(loggedError)
  })
})
