var expect = require('chai').expect
var wrapQuery = require('./wrapQuery')
var microtime = require('../../optionalDependencies/microtime')

describe('wrapQuery', function () {
  var agent
  var clientSendResult

  beforeEach(function () {
    clientSendResult = {
      duffelBag: {
        timestamp: 5
      },
      briefcase: {
        communication: {
          id: 'parent-id',
          transactionId: 'tr-id'
        },
        csCtx: {
          communicationId: 'child-id',
          transactionId: 'tr-id'
        }
      }
    }
    agent = {
      tracer: {
        collector: {
          clientSend: this.sandbox.stub().returns(clientSendResult),
          clientRecv: this.sandbox.stub().returns({}),
          mustCollectSeverity: 9,
          defaultSeverity: 0
        }
      },
      storage: {
        get: this.sandbox.stub().returns({
          communication: {}
        })
      },
      externalEdgeMetrics: {
        EDGE_STATUS: { OK: 0, NOT_OK: 1 },
        report: this.sandbox.spy()
      }
    }

    this.sandbox.stub(microtime, 'now').returns(5)
  })

  describe('callback api', function () {
    it('should call tracer.collector.clientSend on send', function (done) {
      var query = this.sandbox.spy(function (cb) {
        cb()
      })

      function cb () {
        expect(agent.tracer.collector.clientSend).to.have.been.calledWith({
          action: 'fakeMethod',
          data: undefined,
          host: 'fakeHost',
          protocol: 'protocol',
          resource: 'fakeUrl',
          severity: 0
        }, {
          communication: {}
        })
        done()
      }

      wrapQuery(query, [ cb ], agent, {
        protocol: 'protocol',
        url: 'fakeUrl',
        host: 'fakeHost',
        method: 'fakeMethod',
        continuationMethod: 'callback',
        severity: 0
      })
    })
    it('should call the original', function () {
      var query = this.sandbox.spy()
      wrapQuery(query, [], agent)
      expect(query).to.have.been.calledWith()
    })

    it('should pass the callback', function () {
      var query = function (cb) {
        expect(cb).to.be.a('function')
      }
      var cb = this.sandbox.spy()

      wrapQuery(query, [ cb ], agent, {
        continuationMethod: 'callback'
      })
    })

    it('should pass the callback if it\'s in an array', function () {
      var query = function (_, cb) {
        expect(cb[ 0 ]).to.be.a('function')
      }
      var cb = this.sandbox.spy()
      wrapQuery(query, [ 'otherArgument', [ cb ] ], agent)
    })

    it('should shove a callback', function () {
      var query = function (cb) {
        expect(cb).to.be.a('function')
      }

      wrapQuery(query, [], agent, {
        continuationMethod: 'callback'
      })
    })

    it('should call tracer.collector.clientRecv on receive', function () {
      var query = function (cb) {
        cb()
      }

      wrapQuery(query, [], agent, {
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        protocol: 'fakeProtocol',
        continuationMethod: 'callback'
      })
      expect(agent.tracer.collector.clientRecv).to.have.been.calledWith({
        protocol: 'fakeProtocol',
        status: 'ok'
      }, {
        severity: agent.tracer.collector.defaultSeverity
      }, clientSendResult.briefcase)
    })

    it('should set mustCollect severity on error', function () {
      var query = function (cb) {
        cb(new Error('damn'))
      }

      wrapQuery(query, [], agent, {
        continuationMethod: 'callback'
      })
      expect(agent.tracer.collector.clientRecv.args[ 0 ][ 1 ].severity)
        .to.eql(agent.tracer.collector.mustCollectSeverity)
    })

    it('should report external edge', function () {
      var query = function (cb) {
        cb(new Error(null))
      }
      wrapQuery(query, [], agent, {
        protocol: 'mongodb',
        host: 'target',
        continuationMethod: 'callback'
      })
      expect(agent.externalEdgeMetrics.report).to.be.calledWith({
        protocol: 'mongodb',
        responseTime: 0,
        status: 1,
        targetHost: 'target'
      })
    })
  })

  describe('promise api', function () {
    it('should notify agent on send', function (done) {
      var query = this.sandbox.spy(function () {
        return Promise.resolve()
      })
      wrapQuery(query, [], agent, {
        protocol: 'protocol',
        url: 'fakeUrl',
        host: 'fakeHost',
        method: 'fakeMethod',
        continuationMethod: 'promise'
      })
        .then(function () {
          expect(agent.tracer.collector.clientSend).to.have.been.calledWith({
            action: 'fakeMethod',
            data: undefined,
            host: 'fakeHost',
            protocol: 'protocol',
            resource: 'fakeUrl',
            severity: undefined
          }, { communication: {} })
          done()
        })
        .catch(function (err) {
          done(err)
        })
    })

    it('should call the original', function () {
      var query = this.sandbox.spy(function () {
        return Promise.resolve()
      })
      wrapQuery(query, [], agent, {
        continuationMethod: 'promise'
      })
      expect(query).to.have.been.called
    })

    it('should return a promise', function () {
      var query = this.sandbox.spy(function () {
        return Promise.resolve()
      })
      var returnValue = wrapQuery(query, [], agent, {
        continuationMethod: 'promise'
      })
      expect(returnValue).to.be.a('promise')
    })

    it('should not shove a callback', function () {
      var query = function () {
        var args = Array.prototype.slice.call(arguments)
        var callbacks = args.filter(function (arg) { return typeof arg === 'function' })
        expect(callbacks).to.have.length(0)
        return Promise.resolve()
      }
      wrapQuery(query, [], agent, {
        continuationMethod: 'promise'
      })
    })

    it('should notify tracer on receive', function (done) {
      var query = function () {
        return Promise.resolve()
      }
      wrapQuery(query, [], agent, {
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        protocol: 'fakeProtocol',
        continuationMethod: 'promise'
      })
        .then(function () {
          expect(agent.tracer.collector.clientRecv).to.have.been.calledWith({
            protocol: 'fakeProtocol',
            status: 'ok'
          }, {
            severity: agent.tracer.collector.defaultSeverity
          }, clientSendResult.briefcase
          )

          done()
        })
        .catch(function (err) {
          done(err)
        })
    })

    it('should notify externalEdgeMetrics on receive', function (done) {
      var query = function () {
        return Promise.resolve()
      }
      wrapQuery(query, [], agent, {
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        protocol: 'fakeProtocol',
        continuationMethod: 'promise'
      })
        .then(function () {
          expect(agent.externalEdgeMetrics.report).to.have.been.calledWith({
            targetHost: 'fakeHost',
            protocol: 'fakeProtocol',
            responseTime: 0,
            status: agent.externalEdgeMetrics.EDGE_STATUS.OK
          })
          done()
        })
        .catch(function (err) {
          done(err)
        })
    })

    it('should set mustCollect severity on error', function (done) {
      var query = function () {
        return Promise.reject(new Error())
      }
      wrapQuery(query, [], agent, {
        continuationMethod: 'promise'
      })
        .then(function () {
          done('It should have failed')
        })
        .catch(function () {
          expect(agent.tracer.collector.clientRecv.args[0][1].severity)
            .to.eql(agent.tracer.collector.mustCollectSeverity)
          done()
        })
        .catch(function (err) {
          done(err)
        })
    })
  })

  describe('stream api', function () {
    // create our own readable stream
    var Readable = require('stream').Readable

    it('should notify agent on send', function () {
      var query = this.sandbox.spy(function () {
        return new Readable()
      })

      wrapQuery(query, [], agent, {
        protocol: 'protocol',
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        continuationMethod: 'eventEmitter',
        severity: 0
      })
      expect(agent.tracer.collector.clientSend).to.have.been.calledWith({
        action: 'fakeMethod',
        data: undefined,
        host: 'fakeHost',
        protocol: 'protocol',
        resource: 'fakeUrl',
        severity: 0
      }, {
        communication: {}
      })
    })

    it('should call the original', function () {
      var query = this.sandbox.spy(function () {
        return new Readable()
      })
      wrapQuery(query, [], agent, {
        continuationMethod: 'eventEmitter'
      })
      expect(query).to.have.been.called
    })

    it('should return the original readable stream', function () {
      var readStream = new Readable()
      var query = this.sandbox.spy(function () {
        return readStream
      })
      var returnValue = wrapQuery(query, [], agent, {
        continuationMethod: 'eventEmitter'
      })
      expect(returnValue).to.be.eql(readStream)
    })

    it('should not shove a callback', function () {
      var query = function () {
        var args = Array.prototype.slice.call(arguments)
        var callbacks = args.filter(function (arg) { return typeof arg === 'function' })
        expect(callbacks).to.have.length(0)
        return new Readable()
      }
      wrapQuery(query, [], agent, {
        continuationMethod: 'eventEmitter'
      })
    })

    it('should notify tracer on receive', function (done) {
      var query = function () {
        return new Readable()
      }
      var readStream = wrapQuery(query, [], agent, {
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        protocol: 'fakeProtocol',
        continuationMethod: 'eventEmitter'
      })

      readStream.resume()

      readStream.on('end', function () {
        expect(agent.tracer.collector.clientRecv).to.have.been.calledWith({
          protocol: 'fakeProtocol',
          status: 'ok'
        }, {
          severity: agent.tracer.collector.defaultSeverity
        }, clientSendResult.briefcase
        )
        done()
      })

      // end the read stream by pushing null to it
      readStream.push(null)
    })

    it('should notify externalEdgeMetrics on receive', function (done) {
      var query = function () {
        return new Readable()
      }
      var readStream = wrapQuery(query, [], agent, {
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        protocol: 'fakeProtocol',
        continuationMethod: 'eventEmitter'
      })

      readStream.resume()

      readStream.on('end', function () {
        expect(agent.externalEdgeMetrics.report).to.have.been.calledWith({
          targetHost: 'fakeHost',
          protocol: 'fakeProtocol',
          responseTime: 0,
          status: agent.externalEdgeMetrics.EDGE_STATUS.OK
        })
        done()
      })

      // end the read stream by pushing null to it
      readStream.push(null)
    })

    it('should let data through', function (done) {
      var testData = 'data'
      var query = function () {
        return new Readable()
      }
      var readStream = wrapQuery(query, [], agent, {
        url: 'fakeUrl',
        host: 'fakeHost',
        parameter: 'fakeParam',
        method: 'fakeMethod',
        protocol: 'fakeProtocol',
        continuationMethod: 'eventEmitter'
      })

      readStream.on('data', function (data) {
        expect(data.toString('utf-8')).to.eql(testData)
        done()
      })

      // end the read stream by pushing null to it
      readStream.push(testData)
      readStream.push(null)
    })

    it('should set mustCollect severity on error', function () {
      var query = function () {
        return new Readable()
      }
      var readStream = wrapQuery(query, [], agent, {
        continuationMethod: 'eventEmitter'
      })

      readStream.resume()

      readStream.on('error', function () {
        expect(agent.tracer.collector.clientRecv.args[0][1].severity)
          .to.eql(agent.tracer.collector.mustCollectSeverity)
      })

      readStream.emit('error', new Error('damn'))
    })

    it('should throw an error if no error listener is set', function () {
      var err = new Error('damn')
      var query = function () {
        return new Readable()
      }
      var parseError = this.sandbox.spy()

      var readStream = wrapQuery(query, [], agent, {
        parseError: parseError,
        continuationMethod: 'eventEmitter'
      })

      try {
        readStream.emit('error', err)
      } catch (ex) {
        expect(ex).to.eql(err)
      }
    })
  })
})
