/* RUN: LOG_LEVEL=off mocha test/18-exchange-promises.js */

module.exports = SeeAbove;

function SeeAbove() {
}

SeeAbove.prototype.methodName1 = function (opts, callback) {

  if (opts.errorAs == 'callback') return callback(new Error('THIS IS JUST A TEST'));
  if (opts.errorAs == 'throw') throw new Error('THIS IS JUST A TEST');

  opts.number++;
  callback(null, opts);
};

SeeAbove.prototype.synchronousMethod = function(opts, opts2){
  return opts + opts2;
};

SeeAbove.prototype.$happner = {
  config: {
    'component': {
      schema: {
        methods: {
          'methodName1': {
            alias: 'ancientmoth'
          },
          'synchronousMethod': {
            type: 'sync'//NB - this is how you can wrap a synchronous method with a promise
          }
        }
      }
    }
  }
};


if (global.TESTING_18) return; // When 'requiring' the module above,
// don't run the tests below
//.............
var should = require('chai').should();

describe('a8 - exchange supports promises', function () {

  require('benchmarket').start();
  after(require('benchmarket').store());

  var Mesh = require('../');
  var mesh;

  this.timeout(120000);

  before(function (done) {

    global.TESTING_18 = true; //.............

    mesh = this.mesh = new Mesh();

    mesh.initialize({
      util: {
        // logger: {}
      },
      modules: {
        'component': {
          path: __filename   // .............
        }
      },
      components: {
        'component': {}
      }
    }, function (err) {
      delete global.TESTING_18; //.............
      if (err) return done(err);
      done();
    });
  });

  after(function (done) {
    mesh.stop({reconnect: false}, done);
  });

  it('supports non-promises in the exchange', function (done) {

    this.mesh.exchange.component.methodName1({number: 1}, function (err, res) {

      res.should.eql({number: 2});
      done();

    });

  });


  it('supports promises in the exchange', function (done) {

    this.mesh.exchange.component.methodName1({number: 1})

      .then(function (res) {
        res.should.eql({number: 2});
        done();
      })

  });


  it('the promise implementation supports .catch from callback error', function (done) {

    this.mesh.exchange.component.methodName1({errorAs: 'callback'})

      .then(function (res) {
        done(new Error('did not catch'));
      })

      .catch(function (err) {
        err.should.match(/THIS IS JUST A TEST/);
        done();
      })

  });


  it('the promise implementation supports .catch from thrown error', function (done) {

    this.mesh.exchange.component.methodName1({errorAs: 'throw'})

      .then(function (res) {
        ;
        console.log(res)
        done(new Error('did not catch'));
      })

      .catch(function (err) {
        err.should.match(/THIS IS JUST A TEST/);
        done();
      })

  });


  it('supports non-promises on the alias', function (done) {

    this.mesh.exchange.component.ancientmoth({number: 1}, function (err, res) {

      res.should.eql({number: 2});
      done();

    });

  })


  it('supports promises on the alias', function (done) {

    this.mesh.exchange.component.ancientmoth({number: 1})

      .then(function (res) {
        res.should.eql({number: 2});
        done();
      });

  });

  it('supports fire and forget', function (done) {

    this.timeout(1500);

    this.mesh.exchange.component.methodName1({errorAs: 'throw'});
    done();
  });

  it('supports calling a synchronous method and getting a promise back', function (done) {

    this.timeout(1500);

    this.mesh.exchange.component.synchronousMethod(1, 2)

      .then(function (res) {
        res.should.eql(3);
        done();
      })

      .catch(function (err) {
        done(err);
      })
    ;

  });

  it('supports calling a synchronous method fire and forget', function (done) {

    this.timeout(1500);
    this.mesh.exchange.component.synchronousMethod(1, 2);
    done();

  });


  require('benchmarket').stop();

});

