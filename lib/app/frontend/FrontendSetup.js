/**
 * Copyright (c) 2017, Shopgate, Inc. All rights reserved.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const inquirer = require('inquirer')
const { green } = require('chalk')
const logHelper = require('./LogHelper')
const setupQuestions = require('./setupQuestions')
const logger = require('../../logger')
const t = require('../../i18n')(__filename)
const { getLocalIpAdresses } = require('../../utils/utils')

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
      .then(() => this.save(answers))
  }

  /**
   * Saves the input to the configuration file.
   * @param {Object} answers The provided answers.
   */
  async save (answers) {
    if (!answers.confirmed) {
      logger.info(t('SETUP_ABORTED'))
      return
    }

    const frontendSettings = this.appSettings.getFrontendSettings()
    await frontendSettings.setIpAddress()
    await frontendSettings.setStartpageIpAddress(answers.startpageIp)
    await frontendSettings.setPort(parseInt(answers.port, 10))
    await frontendSettings.setApiPort(parseInt(answers.apiPort, 10))
    await frontendSettings.setHmrPort(parseInt(answers.hmrPort, 10))
    await frontendSettings.setRemotePort(parseInt(answers.remotePort, 10))
    await frontendSettings.setSourceMapsType(answers.sourceMapsType)
    logger.plain(`\n${green(t('SUCCESS'))}: ${t('PROJECT_READY', { project: logHelper.getPrefix() })}`)
    logger.debug(t('FRONTEND_SETUP_DONE'))
  }

  /**
   * Builds and returns the default configuration.
   * @return {Object}
   */
  async getDefaultConfig () {
    const settings = this.appSettings.getFrontendSettings()

    const startpageIp = await settings.getStartpageIpAddress()
    const port = await settings.getPort()
    const apiPort = await settings.getApiPort()
    const hmrPort = await settings.getHmrPort()
    const remotePort = await settings.getRemotePort()
    const sourceMapsType = await settings.getSourceMapsType()

    return {
      ip: startpageIp || getLocalIpAdresses(),
      startpageIp: startpageIp || getLocalIpAdresses(),
      port: port || 8080,
      apiPort: apiPort || 9666,
      hmrPort: hmrPort || 3000,
      remotePort: remotePort || 8000,
      sourceMapsType: sourceMapsType || 'cheap-module-eval-source-map'
    }
  }
}

module.exports = FrontendSetup
