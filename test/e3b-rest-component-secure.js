/* RUN: LOG_LEVEL=off mocha test/18-exchange-promises.js */

var Promise = require('bluebird');
var sep = require('path').sep;
var spawn = require('child_process').spawn;
module.exports = SeeAbove;

function SeeAbove() {
}

SeeAbove.prototype.method1 = function (opts, callback) {

  if (opts.errorAs == 'callback') return callback(new Error('THIS IS JUST A TEST'));
  if (opts.errorAs == 'throw') throw new Error('THIS IS JUST A TEST');

  opts.number++;
  callback(null, opts);
};

SeeAbove.prototype.method2 = function (opts, callback) {

  if (opts.errorAs == 'callback') return callback(new Error('THIS IS JUST A TEST'));
  if (opts.errorAs == 'throw') throw new Error('THIS IS JUST A TEST');

  opts.number++;
  callback(null, opts);
};

SeeAbove.prototype.method3 = function ($happn, $origin, opts, callback) {

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
    'testComponent': {
      schema: {
        methods: {
          'methodName1': {
            alias: 'ancientmoth'
          },
          'methodName2': {
            alias: 'ancientmoth'
          },
          'synchronousMethod': {
            type: 'sync-promise'//NB - this is how you can wrap a synchronous method with a promise
          }
        }
      }
    }
  }
};


if (global.TESTING_E3B) return; // When 'requiring' the module above,

/**
 * Simon Bishop
 * @type {expect}
 */

// Uses unit test 2 modules
var expect = require('expect.js');
var Mesh = require('../');
var libFolder = __dirname + sep + 'lib' + sep;

//var REMOTE_MESH = 'e2-remote-mesh';
var REMOTE_MESH = 'e3-remote-mesh-secure';

describe('e3-rest-component-secure', function () {

  require('benchmarket').start();
  after(require('benchmarket').store());

  this.timeout(120000);

  var mesh;
  var remote;

  var startRemoteMesh = function(callback){

    var timedOut = setTimeout(function(){
      callback(new Error('remote mesh start timed out'));
    },5000);

    // spawn remote mesh in another process
    remote = spawn('node', [libFolder + REMOTE_MESH]);

    remote.stdout.on('data', function (data) {

      if (data.toString().match(/READY/)) {

        clearTimeout(timedOut);

        setTimeout(function(){
          callback();
        },1000);
      }
    });
  };

  before(function (done) {

    global.TESTING_E3B = true; //.............

    startRemoteMesh(function(e){

      if (e) return done(e);

      Mesh.create({
        name:'e3b-test',
        datalayer:{
          secure:true,
          adminPassword: 'happn',
          port: 10000
        },
        util: {
          // logger: {}
        },
        modules: {
          'testComponent': {
            path: __filename   // .............
          }
        },
        components: {
          'testComponent': {}
        },
        endpoints:{
          'remoteMesh': {  // remote mesh node
            config: {
              secure:true,
              port: 10001,
              host: 'localhost',
              username:'_ADMIN',
              password:'happn'
            }
          }
        }
      }, function (err, instance) {

        delete global.TESTING_E3B; //.............
        mesh = instance;

        if (err) return done(err);

        mesh.exchange.remoteMesh.remoteComponent.remoteFunction('one','two','three', function(err, result){
          if (err) return done(err);
          done();
        });
      });

    });
  });

  after(function (done) {

    this.timeout(30000);

    if (remote) remote.kill();
    if (mesh) mesh.stop({reconnect: false}, done);

  });

  var happnUtils = require('../lib/system/utilities');

  var mock$Happn = {
    datalayer:{

    },
    _mesh:{
      utilities:happnUtils,
      config:{
        datalayer:{
          secure:true,
          port: 10000
        }
      },
      description:{
        name:'e3b-test'
      },
      endpoints:{},
      datalayer:{
        server:{
          services:{}
        }
      }
    },
    exchange:{
      testComponent:{
        method1:function(opts, callback){
          opts.number++;
          callback(null, opts);
        }
      }
    }
  };

  var mock$Origin = {
    test:"data"
  };

  var mockResponse = {
    writeHead:function(code, header){
      this.header = {code:code, header:header};
    }
  };

  it('tests the rest components __respond method', function(done){

    var RestModule = require('../lib/modules/rest/index.js');
    var restModule = new RestModule();

    var testStage = 'success';

    mockResponse.end = function(responseString){

      try{

        if (testStage == "done") return;

        var response = JSON.parse(responseString);

        //TODO: an unexpected GET or POST with a non-json content

        if (testStage == 'success'){

          expect(response.message).to.be("test success response");
          expect(response.data.test).to.be("data");
          testStage = 'error';

          restModule.__respond(mock$Happn, 'test success response', {"test":"data"}, new Error('a test error'), mockResponse);

        }

        if (testStage == 'error'){

          expect(response.error).to.not.be(null);
          expect(response.error.message).to.be('a test error');

          testStage = "done";

          done();
        }

      }catch(e){
        done(e);
      }
    };

    restModule.__respond(mock$Happn, 'test success response', {"test":"data"}, null, mockResponse);

  });

  it('tests the rest components __parseBody method', function(done){

    var RestModule = require('../lib/modules/rest/index.js');
    var restModule = new RestModule();

    var MockRequest = require('./lib/helper_mock_req');
    var request = new MockRequest({
      method: 'POST',
      url: '/rest/api',
      headers: {
        'Accept': 'application/json'
      }
    });

    request.write({
      uri:'/testComponent/methodName1',
      parameters:{
        'opts':{
          number:1
        }
      }
    });

    request.end();

    mockResponse.end = function(responseString){
      var response = JSON.parse(responseString);

      if (!response.error) return done(new Error('bad response expected error'));

      done(new Error(response.error));
    };

    restModule.__parseBody(request, mockResponse, mock$Happn, function(body){

      expect(body).to.not.be(null);
      expect(body).to.not.be(undefined);
      expect(body.uri).to.be('/testComponent/methodName1');
      expect(body.parameters['opts'].number).to.be(1);

      done();

    });

  });

  var mockLogin = function(restModule, done){

    if (!mock$Happn._mesh.datalayer)
      mock$Happn._mesh.datalayer = {};

    if (!mock$Happn._mesh.datalayer.server)
      mock$Happn._mesh.datalayer.server = {};

    if (!mock$Happn._mesh.datalayer.server.services)
      mock$Happn._mesh.datalayer.server.services = {};

    if (!mock$Happn._mesh.datalayer.server.services.security)
      mock$Happn._mesh.datalayer.server.services.security = {};

    mock$Happn._mesh.datalayer.server.services.security.authorize = function(origin, accessPoint, action, callback){
        try{

          expect(origin.test).to.be("data");
          expect(action).to.be("set");

          callback();
        }catch(e){
          callback(e);
        }
      };

    mock$Happn._mesh.datalayer.server.services.security.login = function(opts, callback){
      try{
        callback(null, {token:'test'});
      }catch(e){
        callback(e);
      }
    };


    restModule.initialize(mock$Happn, function(e){

      if (e) return done(e);

      var MockRequest = require('./lib/helper_mock_req');
      var request = new MockRequest({
        method: 'POST',
        url: '/rest/login',
        headers: {
          'Accept': 'application/json'
        }
      });

      request.write({
        username:'_ADMIN',
        password:'happn'
      });

      request.end();

      mockResponse.end = function(responseString){

        var response = JSON.parse(responseString);

        if (response.error){
          console.log('RESPONSE FAILED:::', JSON.stringify(response));
          done(new Error(response.error.message));
        }

        expect(response.data.token).to.not.be(null);
        done();
      };

      restModule.login(mock$Happn, request, mockResponse);

    });
  };

  it('tests the rest components login method', function(done){

    var RestModule = require('../lib/modules/rest/index.js');
    var restModule = new RestModule();

    mockLogin(restModule, done);

  });

  var login = function(done){

    var restClient = require('restler');

    var operation = {
      username:'_ADMIN',
      password:'happn'
    };

    restClient.postJson('http://localhost:10000/rest/login', operation).on('complete', function(result){
      if (result.error) return done(new Error(result.error.message));
      done(null, result);
    });

  };

  it('tests the rest components login method over the wire', function(done){

    login(function(e, response){
      if (e) return done(e);
      expect(response.data.token).to.not.be(null);
      done();
    });

  });

  it('tests the rest components authorize method, successful', function(done){

    var RestModule = require('../lib/modules/rest/index.js');
    var restModule = new RestModule();

    //$happn._mesh.datalayer.services.security

    mock$Happn._mesh.datalayer.server.services.security = {
      authorize:function(origin, accessPoint, action, callback){

        try{

          expect(origin.test).to.be("data");
          expect(accessPoint).to.be("/_exchange/test/method");
          expect(action).to.be("set");

          callback();
        }catch(e){
          callback(e);
        }
      }
    };

    mockLogin(restModule, function(e){

      if (e) return done(e);

      //req, res, $happn, $origin, uri, successful

      var MockRequest = require('./lib/helper_mock_req');
      var request = new MockRequest({
        method: 'POST',
        url: '/rest/api',
        headers: {
          'Accept': 'application/json'
        }
      });

      request.write({
        uri:'/testComponent/methodName1',
        parameters:{
          'opts':{
            number:1
          }
        }
      });

      mockResponse.end = function(responseString){
        done(new Error('this was not meant to happn: ' + responseString));
      };

      restModule.__authorize(request, mockResponse, mock$Happn, mock$Origin, 'test/method', done);

    });
  });

  it('tests the rest components describe method over the api', function(done){

    var restClient = require('restler');

    login(function(e, result){

      if (e) return done(e);

      restClient.get('http://localhost:10000/rest/describe?happn_token=' + result.data.token).on('complete', function(result){

        expect(result.data.components.testComponent.method1).to.not.be(null);
        expect(result.data.components.testComponent.method2).to.not.be(null);
        expect(result.data.endpoints.remoteMesh.components.remoteComponent.remoteFunction).to.not.be(null);

        done();
      });

    });
  });

  it('tests the rest components handleRequest method', function(done){

    var RestModule = require('../lib/modules/rest/index.js');
    var restModule = new RestModule();

    var MockRequest = require('./lib/helper_mock_req');
    var request = new MockRequest({
      method: 'POST',
      url: '/rest/api',
      headers: {
        'Accept': 'application/json'
      }
    });

    var operation = {
      uri:'testComponent/method1',
      parameters:{
        'opts':{'number':1}
      }
    };

    request.write(operation);

    request.end();

    mock$Happn._mesh.datalayer.server.services.security = {
      authorize:function(origin, accessPoint, action, callback){
        callback();
      }
    };

    mockLogin(restModule, function(e){
      if (e) return done(e);

      mockResponse.end = function(responseString){

        var response = JSON.parse(responseString);

        expect(response.data.number).to.be(2);
        done();

      };

      restModule.__exchangeDescription = {
        components:{
          testComponent:{
            methods:{
              method1:{
                parameters:[
                  {name:'opts'},
                  {name:'callback'}
                ]
              }
            }
          }
        }
      };

      restModule.handleRequest(request, mockResponse, mock$Happn, mock$Origin);
    });

  });

  it('tests posting an operation to a local method', function(done){

    //TODO login function gives us a token, token is used in body of rest request

    login(function(e, result){

      if (e) return done(e);

      var restClient = require('restler');

      var operation = {
        uri:'testComponent/method1',
        parameters:{
          'opts':{'number':1}
        }
      };

      restClient.postJson('http://localhost:10000/rest/api?happn_token=' + result.data.token, operation).on('complete', function(result){
        expect(result.data.number).to.be(2);
        done();
      });
    });
  });

  it('tests posting an operation to a remote method', function(done){

    //TODO login function gives us a token, token is used in body of rest request

    login(function(e, result){

      if (e) return done(e);

      var restClient = require('restler');

      var operation = {
        uri:'/remoteMesh/remoteComponent/remoteFunction',
        parameters:{
          'one':'one',
          'two':'two',
          'three':'three'
        }
      };

      restClient.postJson('http://localhost:10000/rest/api?happn_token=' + result.data.token, operation).on('complete', function(result){

        expect(result.data).to.be('one two three, wheeeeeeeeeeeeheeee!');

        done();
      });
    });
  });

  require('benchmarket').stop();

});