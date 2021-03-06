var debug = require('./utils/debug')()
var Agent = require('./agent')
var Instrumentation = require('./instrumentations')
var ConfigReader = require('./utils/configReader')
var format = require('util').format

var INSTRUMENTED_LIBS = {
  'http': './core/http',
  'https': './core/https',
  'mongoose': './mongoose',
  'mongodb': './mongodb',
  'redis': './redis',
  'ioredis': './ioredis',
  'mysql': './mysql',
  'q': './q',
  'koa': './koa',
  'express': './express',
  'pg': './pg',
  'amqplib': './amqplib'
}

var traceNoop = {
  report: function () {},
  reportError: function () {},
  getTransactionId: function () {},
  sendMemorySnapshot: function () {},
  recordMetric: function () {},
  incrementMetric: function () {},
  stop: function (cb) {
    if (typeof cb === 'function') {
      cb()
    }
  }
}

function Trace (config) {
  debug.info('Trace',
    format('constructing with configuration %s', config))
  this._agent = Agent.create({
    config: config
  })

  this._instrumentation = Instrumentation.create({
    agent: this._agent,
    instrumentations: INSTRUMENTED_LIBS,
    config: config
  })

  this._agent.start()
}

Trace.prototype.report = function (name) {
  var data = Array.prototype.slice.call(arguments, 1)
  if (typeof name !== 'string' || name === '') {
    throw new Error('First parameter invalid, should be a string')
  }
  var briefcase = this._agent.storage.get('tracer.briefcase')
  this._agent.tracer.collector.userSentEvent(briefcase, name, data)
}

Trace.prototype.reportError = function (errorName, error) {
  if (typeof errorName !== 'string' || errorName === '') {
    throw new Error('First parameter invalid, should be a string')
  }
  var briefcase = this._agent.storage.get('tracer.briefcase')
  this._agent.tracer.collector.userSentError(briefcase, errorName, error)
}

Trace.prototype.getTransactionId = function () {
  var briefcase = this._agent.storage.get('tracer.briefcase')
  var transactionId = this._agent.tracer.collector.getTransactionId(briefcase)
  return transactionId
}

Trace.prototype.sendMemorySnapshot = function () {
  this._agent.memoryProfiler.sendSnapshot()
}

Trace.prototype.incrementMetric = function (name, amount) {
  this._agent.customMetrics.increment(name, amount)
}

Trace.prototype.recordMetric = function (name, value) {
  this._agent.customMetrics.record(name, value)
}

Trace.prototype.stop = function (cb) {
  this._agent.stop(cb)
}

module.exports.Trace = Trace
module.exports.noop = traceNoop

module.exports.create = function () {
  if (process.env.NODE_ENV === 'test') {
    debug.error('create',
      "Trace disabled. Reason: NODE_ENV is set to 'test'")
    return module.exports.noop
  }

  try {
    var configReader = ConfigReader.create()
    var config = configReader.getConfig()

    return new module.exports.Trace(config)
  } catch (ex) {
    debug.error('create',
      format('Trace disabled. Reason: %s', ex.message))
    return module.exports.noop
  }
}
