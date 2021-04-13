/**
 * Copyright (c) 2017, Shopgate, Inc. All rights reserved.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const sinon = require('sinon')
const assert = require('assert')
const proxyquire = require('proxyquire')
const helper = require('../helper')

let logFail = false

const logHelper = {
  logLogo: sinon.spy(() => {
    if (logFail) {
      throw new Error('Log failed!')
    }
  }),
  logStartUp: sinon.spy()
}

const logger = {
  plain: sinon.spy()
}

const RapidApi = function (options) {
  this.handle = sinon.spy()
  this.init = sinon.spy((callback) => {
    callback()
  })
}

const server = {
  listen: sinon.spy((port, callback) => {
    callback()
  }),
  on: sinon.spy(),
  use: sinon.spy(),
  post: sinon.spy(),
  opts: sinon.spy()
}

let serverNull = false

const restify = {
  createServer: () => {
    if (serverNull) {
      return null
    }

    return server
  }
}

const requestFailError = new Error('The request failed!')
let requestFail = false
let statusCode = 200

const request = {
  get: sinon.spy((url, callback) => {
    if (requestFail) {
      return callback(requestFailError)
    }

    return callback(null, {
      statusCode
    })
  })
}

let rapidDevServer

describe('RapidDevServer', () => {
  beforeEach(async () => {
    rapidDevServer = proxyquire('../../../../lib/app/frontend/rapidDevServer/RapidDevServer', {
      '../LogHelper': logHelper,
      '../../../logger': logger,
      './RapidApi': RapidApi,
      restify,
      request
    })

    await helper.setupAppEnvironment()
  })

  afterEach(async () => {
    await helper.clearAppEnviroment()
    logHelper.logLogo.resetHistory()
    logHelper.logStartUp.resetHistory()
    logger.plain.resetHistory()
    server.listen.resetHistory()
    server.on.resetHistory()
    server.use.resetHistory()
    server.post.resetHistory()
    request.get.resetHistory()
    this.rapidApi = null
  })

  describe('start()', () => {
    it('should throw an error if server already exists', async () => {
      try {
        rapidDevServer.server = {}
        await rapidDevServer.start()
        rapidDevServer.server = null
        throw new Error('Did not throw!')
      } catch (error) {
        assert.equal(error, rapidDevServer.existingServerError)
        rapidDevServer.server = null
        return true
      }
    })

    it('should throw an error if no IP and no port are set', (done) => {
      rapidDevServer.start()
        .then(() => {
          done('Did not throw')
        })
        .catch((error) => {
          assert.equal(error, rapidDevServer.noIpPortSuppliedError)
          done()
        })
    })

    it('should validate the environment', (done) => {
      const spy = sinon.spy(rapidDevServer, 'validateEnvironment')

      process.env.ip = '127.0.0.1'
      process.env.apiPort = 9666

      rapidDevServer.start()
        .then(() => {
          sinon.assert.calledOnce(spy)
          done()
        })
        .catch(error => done(error))
        .then(() => {
          delete process.env.ip
          delete process.env.apiPort
        })
    })
  })

  describe('createServer()', () => {
    beforeEach(() => {
      process.env.ip = '127.0.0.1'
      process.env.apiPort = 9666
    })

    afterEach(() => {
      delete process.env.ip
      delete process.env.apiPort
      logFail = false
    })

    it('should throw an error if something failed', (done) => {
      logFail = true
      rapidDevServer.start()
        .then(() => {
          done('Did not fail!')
        })
        .catch(() => {
          done()
        })
    })

    it('should create the server', (done) => {
      const spy = sinon.spy(rapidDevServer, 'createServer')
      rapidDevServer.start()
        .then(() => {
          sinon.assert.calledOnce(spy)
          sinon.assert.calledOnce(server.listen)
          sinon.assert.calledOnce(logHelper.logLogo)
          done()
        })
        .catch(error => done(error))
    })
  })

  describe('setErrorHandlers()', () => {
    beforeEach(() => {
      process.env.ip = '127.0.0.1'
      process.env.apiPort = 9666
    })

    afterEach(() => {
      delete process.env.ip
      delete process.env.apiPort
      logFail = false
      serverNull = false
    })

    it('should not set errors handlers if server is not created', (done) => {
      serverNull = true
      rapidDevServer.start()
        .then(() => {
          sinon.assert.notCalled(server.on)
          done()
        })
        .catch(() => done())
    })

    it('should set the error handlers', (done) => {
      rapidDevServer.start()
        .then(() => {
          sinon.assert.calledOnce(server.on)
          done()
        })
        .catch(error => done(error))
    })
  })

  describe('setRoutes()', () => {
    beforeEach(() => {
      process.env.ip = '127.0.0.1'
      process.env.apiPort = 9666
    })

    afterEach(() => {
      delete process.env.ip
      delete process.env.apiPort
      logFail = false
      serverNull = false
      requestFail = false
      statusCode = 200
    })

    it('should set routes', (done) => {
      const spy = sinon.spy(rapidDevServer, 'setRoutes')
      rapidDevServer.start()
        .then(() => {
          sinon.assert.calledOnce(spy)
          sinon.assert.calledOnce(request.get)
          done()
        })
        .catch(error => done(error))
    })

    it('should throw an error if the request fails', (done) => {
      requestFail = true
      rapidDevServer.start()
        .then(() => {
          done('Did not throw!')
        })
        .catch(() => done())
    })

    it('should throw an error on wrong status code', (done) => {
      statusCode = 300
      rapidDevServer.start()
        .then(() => {
          done('Did not throw!')
        })
        .catch((error) => {
          assert.equal(error, rapidDevServer.rapidNotAvailableError)
          done()
        })
    })

    it('should create a post entry point', (done) => {
      rapidDevServer.start()
        .then(() => {
          sinon.assert.calledThrice(server.post)
          done()
        })
        .catch(error => done(error))
    })
  })

  describe('handleRestifyError()', () => {
    it('calls next, if no error is supplied', () => {
      const spy = sinon.spy()
      rapidDevServer.handleRestifyError({}, {}, null, spy)
      sinon.assert.calledOnce(spy)
    })

    it('should simply log the error', () => {
      const spy = sinon.spy()
      rapidDevServer.handleRestifyError({}, {}, 'Some error', spy)
      sinon.assert.calledOnce(logger.plain)
    })

    it('should responde with json object', () => {
      const json = sinon.spy()
      const spy = sinon.spy()
      rapidDevServer.handleRestifyError({ xhr: true }, { json }, 'Some error', spy)
      sinon.assert.calledOnce(json)
      sinon.assert.calledWith(spy, false)
    })
  })

  describe('setContentTypeHeaders()', () => {
    it('should change the encoding string', () => {
      const before = 'Some header with utf8'
      const after = 'Some header with utf-8'
      const req = { headers: { 'content-type': before } }
      const spy = sinon.spy()
      rapidDevServer.setContentTypeHeaders(req, {}, spy)
      sinon.assert.calledOnce(spy)
      assert.equal(req.headers['content-type'], after)
    })

    it('should not do anything if headers are not set', () => {
      const req = { headers: {} }
      const after = req
      const spy = sinon.spy()
      rapidDevServer.setContentTypeHeaders(req, {}, spy)
      sinon.assert.calledOnce(spy)
      assert.equal(JSON.stringify(req), JSON.stringify(after))
    })
  })
})
