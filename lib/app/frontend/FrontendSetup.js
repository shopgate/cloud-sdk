/**
 * Copyright (c) 2017, Shopgate, Inc. All rights reserved.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const inquirer = require('inquirer')
const os = require('os')
const { green } = require('chalk')
const logHelper = require('./LogHelper')
const setupQuestions = require('./setupQuestions')
const logger = require('../../logger')

/**
 * The FrontendSetup class.
 */
class FrontendSetup {
  /**
   * @param {DcHttpClient} dcClient
   * @param {AppSettings} appSettings
   */
  constructor (dcClient, appSettings) {
    this.appSettings = appSettings
    this.dcClient = dcClient
  }

  /**
   * Runs the setup process.
   * @param {boolean} [showWelcomeMessage=true] If a welcome message should be shown.
   * @return {Promise}
   */
  async run (showWelcomeMessage = true) {
    if (showWelcomeMessage) {
      logHelper.logSetupLogo()
    }

    let answers
    await inquirer.prompt(setupQuestions(await this.getDefaultConfig()))
      .then((inquirerAnswers) => { answers = inquirerAnswers })
      .then(() => this.registerSettings(answers))
      .then(() => this.save(answers))
  }

  /**
   * Registers the settings with the RAPID server.
   * @param {Object} answers The provided answers.
   */
  registerSettings (answers) {
    const { confirmed, ip, port } = answers
    const appId = this.appSettings.getId()

    if (!confirmed) throw new Error('Sorry, you canceled the setup! Please try again.')

    const startPageUrl = `http://${ip}:${port}/`
    return new Promise((resolve, reject) => {
      this.dcClient.setStartPageUrl(appId, startPageUrl, (err) => {
        if (err) return reject(new Error(`Error while setting the start page url in the dev stack: ${err.message}`))
        resolve()
      })
    })
  }

  /**
   * Saves the input to the configuration file.
   * @param {Object} answers The provided answers.
   */
  async save (answers) {
    const frontendSettings = this.appSettings.getFrontendSettings()
    await frontendSettings.setIpAddress(answers.ip)
    await frontendSettings.setPort(parseInt(answers.port, 10))
    await frontendSettings.setApiPort(parseInt(answers.apiPort, 10))
    await frontendSettings.setHmrPort(parseInt(answers.hmrPort, 10))
    await frontendSettings.setRemotePort(parseInt(answers.remotePort, 10))
    await frontendSettings.setSourceMapsType(answers.sourceMapsType)
    logger.plain(`\n${green('SUCCESSS')}: Your ${logHelper.getPrefix()} project is now ready!`)
  }

  /**
   * Returns the client's local IP address.
   * @return {string}
   */
  getLocalIpAdresses () {
    // Resolve the local area network ip.
    const ifaces = os.networkInterfaces()
    let localIp = '127.0.0.1'

    Object.keys(ifaces).forEach((ifname) => {
      ifaces[ifname].forEach((iface) => {
        if (iface.family !== 'IPv4' || iface.internal !== false) {
          // Skip over internal and non-ipv4 addresses
          return
        }

        localIp = iface.address
      })
    })

    return localIp
  }

  /**
   * Builds and returns the default configuration.
   * @return {Object}
   */
  async getDefaultConfig () {
    const settings = this.appSettings.getFrontendSettings()

    const ip = await settings.getIpAddress()
    const port = await settings.getPort()
    const apiPort = await settings.getApiPort()
    const hmrPort = await settings.getHmrPort()
    const remotePort = await settings.getRemotePort()
    const sourceMapsType = await settings.getSourceMapsType()

    return {
      ip: ip || this.getLocalIpAdresses(),
      port: port || 8080,
      apiPort: apiPort || 9666,
      hmrPort: hmrPort || 3000,
      remotePort: remotePort || 8000,
      sourceMapsType: sourceMapsType || 'cheap-module-eval-source-map'
    }
  }
}

module.exports = FrontendSetup
