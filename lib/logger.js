const bunyan = require('bunyan')
const bformat = require('bunyan-format')
const formatOut = bformat({outputMode: 'short', color: true})

/**
 * @type {{trace:Function, debug:Function, info:Function, warn:Function, error:Function, child:Function, level:Function, levels:Function}}
 */
module.exports = bunyan.createLogger({
  name: '\u0008',
  streams: [{
    level: 'debug',
    stream: formatOut
  }]
})