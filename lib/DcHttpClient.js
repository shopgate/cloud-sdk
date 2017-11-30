const request = require('request')

class DcHttpClient {
  constructor (userSettings) {
    this.userSettings = userSettings
    this.dcAddress = process.env.SGCLOUD_DC_ADDRESS || 'https://developer-connector.shopgate.cloud'
  }

  /**
   * @param {String} username
   * @param {String} password
   * @param {Function} cb
   */
  login (username, password, cb) {
    const opts = {
      method: 'POST',
      url: `${this.dcAddress}/login`,
      json: true,
      body: {username, password},
      timeout: 2000
    }

    request(opts, (err, res, body) => {
      if (err) return cb(err)
      if (res.statusCode !== 200) return cb(new Error(body ? body.message : 'Login failed'))

      this.userSettings.getSession().setToken(body.accessToken)
      this.userSettings.save()
      cb()
    })
  }

  /**
   * @param {string} infoType
   * @param {string} appId
   * @param {string} deviceId
   * @param {function} cb
   */
  getInfos (infoType, appId, deviceId, cb) {
    const opts = {
      method: 'GET',
      url: `${this.dcAddress}/applications/${appId}/${infoType}/${deviceId}`,
      json: true,
      timeout: 2000,
      headers: {
        authorization: 'Bearer ' + this.userSettings.getSession().getToken()
      }
    }

    request(opts, (err, res, body) => {
      if (err) return cb(err)
      if (res.statusCode !== 200) return cb(new Error(body ? body.message : `could not get ${infoType}`))

      if (res.headers['x-jwt']) {
        this.userSettings.getSession().setToken(res.headers['x-jwt'])
        this.userSettings.save()
      }

      cb(null, body)
    })
  }

  /**
   * @param {String} applicationId
   * @param {Function} cb
   */
  downloadPipelines (applicationId, cb) {
    const opts = {
      method: 'GET',
      url: `${this.dcAddress}/applications/${applicationId}/pipelines`,
      timeout: 10000,
      json: true,
      headers: {
        authorization: 'Bearer ' + this.userSettings.getSession().getToken()
      }
    }

    request(opts, (err, res, body) => {
      if (err) return cb(err)
      if (res.statusCode === 404) return cb(new Error(`The application with id '${applicationId}' was not found`))
      if (res.statusCode !== 200) return cb(new Error(body ? body.message : 'Could not retrieve pipelines'))

      if (res.headers['x-jwt']) {
        this.userSettings.getSession().setToken(res.headers['x-jwt'])
        this.userSettings.save()
      }

      cb(null, body.pipelines)
    })
  }

  /**
   * @param {Object} pipeline
   * @param {String} applicationId
   * @param {Function} cb
   */
  uploadPipeline (pipeline, applicationId, cb) {
    const opts = {
      method: 'PUT',
      url: `${this.dcAddress}/applications/${applicationId}/pipelines/${pipeline.pipeline.id}`,
      json: true,
      body: pipeline,
      timeout: 10000,
      headers: {
        authorization: 'Bearer ' + this.userSettings.getSession().getToken()
      }
    }
    request(opts, (err, res, body) => {
      if (err) return cb(err)

      if (res.statusCode !== 204) return cb(new Error(body ? body.message || body : 'Pipeline update failed'))

      if (res.headers['x-jwt']) {
        this.userSettings.getSession().setToken(res.headers['x-jwt'])
        this.userSettings.save()
      }
      cb()
    })
  }

  /**
   *
   * @param {Object} config
   * @param {String} applicationId
   * @param {Function} cb
   */
  generateExtensionConfig (config, applicationId, cb) {
    const opts = {
      method: 'POST',
      url: `${this.dcAddress}/applications/${applicationId}/extensions/${encodeURIComponent(config.id)}/generateConfig`,
      json: true,
      body: config,
      timeout: 5000,
      headers: {
        authorization: 'Bearer ' + this.userSettings.getSession().getToken()
      }
    }

    request(opts, (err, res, body) => {
      if (err) return cb(err)
      if (res.statusCode !== 200) return cb(new Error((body && body.message) ? body.message : 'Could not generate Extension-Config'))

      if (res.headers['x-jwt']) {
        this.userSettings.getSession().setToken(res.headers['x-jwt'])
        this.userSettings.save()
      }

      cb(null, body)
    })
  }

  setStartPageUrl (applicationId, startPageUrl, cb) {
    const opts = {
      method: 'PUT',
      url: `${this.dcAddress}/applications/${applicationId}/settings/startpage`,
      json: true,
      body: {startPageUrl},
      timeout: 5000,
      headers: {
        authorization: 'Bearer ' + this.userSettings.getSession().getToken()
      }
    }
    request(opts, (err, res, body) => {
      if (err) return cb(err)
      if (res.statusCode !== 204) return cb(new Error(body ? body.message || body : 'Setting start page url failed'))

      if (res.headers['x-jwt']) {
        this.userSettings.getSession().setToken(res.headers['x-jwt'])
        this.userSettings.save()
      }
      cb()
    })
  }
}

module.exports = DcHttpClient
