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
      if (err || res.statusCode !== 200) return cb(err || new Error(body ? body.message : 'Login failed'))

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
      if (err || res.statusCode !== 200) return cb(err || new Error(body ? body.message : `could not get ${infoType}`))

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
  getPipelines (applicationId, cb) {
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
      if (err || res.statusCode !== 200) return cb(err || new Error(body ? body.message || body : 'Could not retrieve pipelines'))

      if (res.headers['x-jwt']) {
        this.userSettings.getSession().setToken(res.headers['x-jwt'])
        this.userSettings.save()
      }

      cb(null, body.pipelines)
    })
  }
}

module.exports = DcHttpClient