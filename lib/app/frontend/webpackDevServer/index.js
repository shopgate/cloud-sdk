/**
 * Copyright (c) 2017, Shopgate, Inc. All rights reserved.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const Themes = require('../Themes')
const { optionsHost, optionsPort, theme } = process.env

// Match the theme names against the command option.
const currentTheme = Themes.getThemes().filter((theme) => process.env.theme === theme.name)

if (!currentTheme.length) {
  throw new Error(`Unknown theme ${theme}`)
}

Themes.setCurrentTheme(currentTheme[0].name)

// The default dev server config.
const defaultDevConfig = {
  hot: true,
  host: optionsHost,
  port: optionsPort,
  progress: true,
  stats: {
    colors: true
  }
}

// Import the webpack config for the theme.
const config = require(currentTheme[0].config)

const themeDevConfig = config.devServer || {}

// Combine all configs.
const devConfig = {
  ...defaultDevConfig,
  ...themeDevConfig
}

const server = new WebpackDevServer(webpack(config), devConfig)

server.listen(devConfig.port, devConfig.host)