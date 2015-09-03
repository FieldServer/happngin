/**
 * Created by Johan on 4/14/2015.
 */

// process.env.NO_EXIT_ON_UNCAUGHT (not recommended - unless your boot-time is v/long and your confidence is v/high)
// process.env.NO_EXIT_ON_SIGTERM
// process.env.STOP_ON_SIGINT (just stops components and disconnects network, no exit) <--- functionality pending
// process.env.START_AS_ROOTED (exposes all mesh nodes in process at global.$happner)
// process.env.UNROOT_ON_REPL (removes $happner from global and attaches it to repl server context during startup)

var root = {
  WELCOME: true,
  nodes: {}
}

if (process.env.START_AS_ROOTED) global.$happner = root;

var API = require('./system/api')
  , Happn = require('happn')
  , DataLayer = require('./system/dataLayer')
  , Config = require('./system/config')
  , async = require('async')
  , MeshError = require('./system/error')
  , ComponentInstance = require('./system/componentInstance')
  , path = require("path")
  , repl = require('./system/repl')
  , warned = false
  , moment = require('moment')
  ;

module.exports = function () {
  return new Mesh();
}

module.exports.About = 'https://github.com/happner/happner/blob/master/docs/starting.md';
module.exports.Mesh = Mesh;
module.exports.MeshClient = API;

// Quick start.

module.exports.start = function(config, callback) {


  // node -e 'require("happner").start()'

  config = config || {};
  callback = callback || (typeof config == 'function' ? config : function(err) {
    if (err) {
      console.error(err.stack);
      process.exit(err.errno || 1);
    }
  });


  // node -e 'require("happner").start(9999)'

  if (typeof config == 'number') config = {
    datalayer: {
      port: config
    }
  };


  // node -e 'require("happner").start("5.6.7.88:7654")'

  if (typeof config == 'string') {
    var parts = config.split(':');
    config = {
      datalayer: {}
    };
    config.datalayer.host = parts[0];
    if (parts[1]) config.datalayer.port = parseInt(parts[1]);
  }

  ;(new Mesh()).initialize(config, function(err, mesh) {
    if (err) return callback(err);
    return mesh.start(function(err, mesh) {
      if (err) return callback(err);
      callback(null, mesh);
    });
  });
}


function Mesh(config) {

  this._mesh = {
    config: config || {},
    modules: {},
    components: {},
    description: {},
    endpoints: {},
    exchange: {},
  };

  this._stats = {
    proc:{
      up:moment.utc()
    },
    component:{}
  };

  this.initialize = this.initialize; // make visible
  Object.defineProperty(this, 'initialized', {
    value: false,
    configurable: true,
    writable: true,
    enumerable: true
  });
  Object.defineProperty(this, 'initializing', {
    value: false,
    configurable: true,
    writable: true,
    enumerable: true
  });

  this.start = this.start;
  this.stop = this.stop;
  this.describe = this.describe;
  this.test = this.test;

  var _this = this;
  Object.defineProperty(this, 'api', {
    get: function() {
      if (!warned) {
        _this.log.warn('Use of mesh.api.* is deprecated. Use mesh.*');
        warned = true;
      }
      return _this;
    }
  });
}

// Step1 of two step start with mandatory args (initialize(function Callback(){ start() }))
Mesh.prototype.initialize = function(config, callback){
  this.initialized = false;
  this.initializing = true;

  if (typeof config == 'function') {
    callback = config;
    // assume config came on constructor
  } else {
    this._mesh.config = config;
  }

  var _this = this;

  // Async config step for (ask what i should do)ness <--- functionality pending

  var configer = new Config();

  configer.process(this, config, function(e, config) {

    if (e) return callback(e);

    root.nodes[config.name] = _this;

    _this.log.createLogger('Mesh', _this.log);
    _this.log.$$DEBUG('initialize');
    _this.log.info('using name \''+config.name+'\',' + ' pid ' + process.pid);

    if (process.env.START_AS_ROOTED && !config.repl) {
      config.repl = {
        socket: '/tmp/sock.' + config.name
      }
    }
    
    _this.exchange = {};
    _this.event = {};

    Object.defineProperty(_this, 'data', {
      get: function() {
        return _this._mesh.data;
      },
      enumerable: true
    });

    repl.create(_this);

    process.on('uncaughtException', function(err) {
      _this.log.fatal('uncaughtException (or set NO_EXIT_ON_UNCAUGHT)', err);
      if (process.env.NO_EXIT_ON_UNCAUGHT) return;
      process.exit(1);
    });

    process.on('exit', function(code) {
      _this.stop();
      _this.log.info('exit ' + code);
    });

    var stopmesh = function() {
      if (!_this.initialized) process.exit(0)
      _this.stop({exitCode: 0, kill: true}, function(e) {
        _this.initialized = false;
        if (e) _this.log.warn('error during stop', e)
      });
    }

    var pausemesh = function() {
      _this.stop(function(e) {
        _this.initialized = false;
        if (e) _this.log.warn('error during stop', e)
      });
    }

    process.on('SIGTERM', function(code) {
      console.log();
      if (process.env.NO_EXIT_ON_SIGTERM) {
        _this.log.warn('SIGTERM ignored');
        return;
      }
      _this.log.warn('SIGTERM');
      stopmesh();
    });

    process.on('SIGINT', function() {
      console.log();
      if (process.env.STOP_ON_SIGINT) {
        _this.log.warn('SIGINT without exit');
        pausemesh();
        return;
      }
      _this.log.warn('SIGINT');
      return stopmesh();
    });

    process.on('SIGHUP', function() {
      _this.log.info('SIGHUP ignored');
    });

    _this.attachSystemComponents(config);

    async.series([
      function(callback) {
        _this._initializeDataLayer(config, callback);
      },
      function(callback) {
        _this.log.$$DEBUG('initialized data layer');
        _this._initializeModules(config, callback);
      },
      function(callback) {
        _this.log.$$DEBUG('initialized modules');
        _this._happnizeModules(callback);
      },
      function(callback) {
        _this.log.$$DEBUG('happnized modules');
        _this._instantiateComponents(config, callback);
      },
      function(callback) {
        _this.log.$$DEBUG('initialized components');
        _this._registerSchema(config, callback);
      },
      function(callback) {
        _this.log.$$DEBUG('registered schema');
        API._initializeLocal(_this, _this.describe(), Happn, config, callback);
      },
      function(callback) {
        _this.log.$$DEBUG('initialized local');
        _this._initializeEndpoints(callback);
      },
      function(callback) {
        _this.log.$$DEBUG('initialized endpoints');
        API._attachProxyPipeline(_this, _this.describe(), Happn, config, callback);
      },
      function(callback) {
        _this.log.$$DEBUG('attached to proxy pipeline');
        callback();
      }
    ], function(e){
      if (!e) _this.log.info('ready!');
      _this.initialized = true;
      _this.initializing = false;
      callback(e, _this);
    });
  });
}

// Step2 of two step start (initialize({},function callback(){ start() }))
Mesh.prototype.start = function(callback){
  if (!this.initialized) return console.warn('missing initialize()');

  var _this = this;
  var waiting = setTimeout(function() {
    _this.log.warn('awaiting startMethod callbacks');
  },10*1000);

  this.__startComponents(function(error) {
    clearTimeout(waiting);
    if (error) return callback(error);
    _this.log.info('started!');
    callback(null, _this);
  });
}

Mesh.prototype.stop = function(options, callback){

  if (!this.initialized) return;

  this.initialized = false;

  this.log.$$DEBUG('initiating stop');

  if (typeof options === 'function') 
    callback = options;
  else if (!options)
    options = {};
  
  if (options.kill && !options.wait)
    options.wait = 10000;

  var timeout;

  var kill = function(){
     process.exit((typeof options.exitCode == 'number') ? options.exitCode : 1);
  }

  var _this = this;
  if (options.kill){
    timeout = setTimeout(function(){
      _this.log.error("failed to stop components, force true");
      kill();
    }, options.wait);
  }
  
  var _this = this;
  this.__stopComponents(function(e){

    if (e){
                      // component instance already logged the err
      _this.log.error("failure to stop components");
    }else{

      clearTimeout(timeout);
      _this.log.info('stopped!');

      if (options.kill)
        kill();
    }

    if (callback)
      callback(e);

  });
}

Mesh.prototype.describe = function(cached){
  if (!this.initializing && !this.initialized) return console.warn('beggaring description!');
  if (this._mesh.description && cached == true) return this._mesh.description;

  var description = {
    name: this._mesh.config.name, 
    components: {},
    setOptions: this._mesh.config.datalayer.setOptions
  };

  for (var componentName in this._mesh.components){
    description.components[componentName] = this._mesh.components[componentName].instance.describe();
  }

  return this._mesh.description = description;
}

Mesh.prototype._initializeDataLayer = function(config, callback){
  var _this = this;
  this._mesh.datalayer = DataLayer.create( this.log, config,
    function(err, client) {
      if (err) return callback(err);
      _this._mesh.data = client;


      // log connections

      _this._mesh.data.on( '/mesh/system/endpoints/*',
        {event_type: 'set'},
        function event(data) {
          try {
            _this.log.info('connection from \'' + data.payload.path.split('/').pop() + '\'');
          } catch (e) {}
        },
        function requestStatus(e) {
          callback();
        }
      )
    }
  );
}

Mesh.prototype._initializeModules = function(config, callback){

  // Build list of modules that the components require
  // Won't start the rest (even if module in config)

  var needed = {};

  Object.keys(config.components).map(function(name){
    return [name, config.components[name]]
  }).forEach(function(array) {
    var componentName = array[0];
    var componentConfig = array[1];
    var moduleName = componentConfig.moduleName || componentName;
    
    needed[moduleName] = true;

    if (!config.modules[moduleName]) {
      // create default for missing module defintion
      config.modules[moduleName] = {};
    }
  });

  var _this = this;
  async.eachSeries(Object.keys(config.modules), function(moduleName, eachCallback) {

    if (!needed[moduleName]) {
      _this.log.$$DEBUG('skip unused module \''+moduleName+'\'');
      eachCallback();
      return;
    }

    _this._mesh.modules[moduleName] = {};
    var moduleInstance;
    var moduleConfig = config.modules[moduleName];
    var moduleBase;
    var callbackIndex = -1;
    var home;

    if (moduleConfig.instance) {
      moduleConfig.home = moduleConfig.home || '__NONE__';
      moduleBase = moduleConfig.instance;
      home = moduleConfig.home;
    }

    if (!moduleConfig.path) moduleConfig.path = moduleName;

    _this._mesh.modules[moduleName].config = config.modules[moduleName];

    try {

      var modulePath = moduleConfig.path;

      if (moduleConfig.path.indexOf('system:') == 0){
        var pathParts = moduleConfig.path.split(':');
        modulePath = __dirname + '/system/components/' + pathParts[1];
      }

      var moduleBasePath;

      if (!home) {

        try {

          modulePath.replace(/\.js$/, '').split('.').map(function(part, ind){

            if (ind == 0){
              moduleBasePath = part;
              moduleBase = require(part);
            }
            else
              moduleBase = moduleBase[part];

          });

        } catch (e) {
          try {
            moduleBase = require('happner-' + modulePath);
            moduleBasePath = 'happner-' + modulePath;
          } catch (f) {
            throw e;
          }
        }
      }

      home = home || path.dirname(require.resolve(moduleBasePath));
      Object.defineProperty(_this._mesh.modules[moduleName], 'directory', {
        get: function() {
          _this.log.warn('Use of module.directory is deprecated. Use module.home');
          return home;
        }
      });

      Object.defineProperty(_this._mesh.modules[moduleName], 'home', {
        get: function() {
          return home;
        }
      });

    } catch (e) {
      return eachCallback(new Error(e));
    }

    var getParameters = function() {
      try {
        var parameters = (moduleConfig.construct || moduleConfig.create).parameters;
        return parameters.map(function(p, i) {
          if (p.parameterType == 'callback'){
            callbackIndex = i;
            return;
          }
          if (p.value) return p.value;
          else return null
        });
      } catch (e) {
        return [];
      }
    }

    var errorIfNull = function(module) {
      if (typeof module === 'undefined') {
        _this.log.warn('undefined instance for \''+moduleName+'\'');
        return {};
      }
      return module;
    }

    var parameters = getParameters();

    if (moduleConfig.construct) {

      _this.log.$$DEBUG('construct module \''+moduleName+'\'');

      if (moduleConfig.construct.name)
        moduleBase = moduleBase[moduleConfig.construct.name];

      try {
        moduleInstance = new (Function.prototype.bind.apply(moduleBase, [null].concat(parameters)));
        _this._mesh.modules[moduleName].instance = errorIfNull(moduleInstance);
      } catch (e) {
        _this.log.error('error constructing '+moduleName+'\'', e);
        return eachCallback(e);
      }
      return eachCallback();

    }

    if (moduleConfig.create) {

      _this.log.$$DEBUG('create module \''+moduleName+'\'');

      if (moduleConfig.create.name)
        moduleBase = moduleBase[moduleConfig.create.name];

      if (moduleConfig.create.type != 'async') {
        var moduleInstance = moduleBase.apply(null, parameters);
        _this._mesh.modules[moduleName].instance = errorIfNull(moduleInstance);
        return eachCallback();
      }

      var constructorCallBack = function(){
        var callbackParameters;
        try {
          callbackParameters = moduleConfig.create.callback.parameters;
        } catch (e) {
          callbackParameters = [
            {parameterType: 'error'},
            {parameterType: 'instance'}
          ];
        }
      
        for (var index in arguments){
          var value = arguments[index];

          var callBackParameter = callbackParameters[index];
          if (callBackParameter.parameterType == 'error' && value){
            return eachCallback(new MeshError('Failed to construct module: ' + moduleName, value));
          }
            
          if (callBackParameter.parameterType == 'instance' && value){
            _this._mesh.modules[moduleName].instance = errorIfNull(value);
            return eachCallback();
          }
        }
      }

      if (callbackIndex > -1) parameters[callbackIndex] = constructorCallBack;
      else parameters.push(constructorCallBack);

      return moduleBase.apply(moduleBase, parameters);
    }

    if (typeof moduleBase == 'function') {
    
      _this.log.$$DEBUG('construct/create module \''+moduleName+'\'');

      try {
        moduleInstance = new (Function.prototype.bind.apply(moduleBase, [null].concat(parameters)));
      } catch (e) {
        _this.log.error('error construct/creating '+moduleName+'\'', e);
        return eachCallback(e);
      }

      _this._mesh.modules[moduleName].instance = errorIfNull(moduleInstance);
      return eachCallback();
    }

    _this.log.$$DEBUG('assign module \''+moduleName+'\'');

    _this._mesh.modules[moduleName].instance = errorIfNull(moduleBase);
    return eachCallback();

  },
  function(err){
      if (err){
        _this.log.error('Failed to initialize modules', err);
      }
      callback(err);
  });
}

Mesh.prototype._happnizeModules = function(callback){
  var _this = this;
  async.eachSeries(Object.keys(this._mesh.modules), function(moduleName, eachCallback) {

    var args, happnSeq, originalFn;
    var module = _this._mesh.modules[moduleName].instance;

    for(var fnName in module) {
      originalFn = module[fnName];
      if (typeof originalFn !== 'function') continue;
      
      args = UTILITIES.getFunctionParameters(originalFn);
      happnSeq = args.indexOf('$happn');
      if (happnSeq < 0) continue;

      Object.defineProperty(module[fnName],'$happnSeq',{value: happnSeq});
    }

    eachCallback(null);

  }, callback);

}

Mesh.prototype._instantiateComponents = function(config, callback){
  var _this = this;
  async.eachSeries(Object.keys(config.components), function(componentName, eachCallback) {

    var componentConfig = config.components[componentName];
    var componentInstance = new ComponentInstance({name: componentName, mesh: _this});
    
    componentConfig.meshName = config.name;
    componentConfig.meshPort = config.datalayer.port;
    componentConfig.setOptions = config.datalayer.setOptions;

    _this._stats.component[componentName] = {errors:0, calls:0, emits:0};
    componentInstance.stats = _this._stats;

    if (typeof componentConfig.moduleName == 'undefined') componentConfig.moduleName = componentName;

    componentInstance.initialize(
      root,
      _this._mesh.modules[componentConfig.moduleName],
      componentConfig,
      function(e){

        if (e) return eachCallback(e);

        _this._mesh.components[componentName] = {"instance":componentInstance, "config":componentConfig};
        eachCallback();

      });
    },
    function(err){
      if (err){
        //message, level, component, data
        _this.log.error('Failed to initialize components', err);
      }
      callback(err);
    });
}

Mesh.prototype._registerSchema = function(config, callback){
  var description = this.describe(false);
  var _this = this;
  this.data.set('/mesh/schema/description', this.describe(false), null, function(e, response){
    if (e) return callback(e);
     _this.data.set('/mesh/schema/config', config, null, function(e, response){
      callback(e);
     });
  });
}

Mesh.prototype._initializeEndpoints = function(callback) {

  var config = this._mesh.config;
  var _this = this;

  // Externals
  var exchangeAPI = _this.exchange = (_this.exchange || {});
  var eventAPI = _this.event = (_this.event || {});
  
  // Internals
  _this._mesh = _this._mesh || {};
  _this._mesh.exchange = _this._mesh.exchange || {};


  async.parallel(Object.keys(config.endpoints).map(function(endpointName) {

    // return array of functions for parallel([])

    return function(done) {

      _this.log.$$DEBUG('initialize endpoint \'' + endpointName + '\'');
      
      var endpointConfig = config.endpoints[endpointName];
      endpointConfig.config = endpointConfig.config || {};
      endpointConfig.config.secret = endpointConfig.config.secret || 'mesh';
      endpointConfig.config.authTokenSecret = endpointConfig.config.authTokenSecret || 'mesh';

      Happn.client.create(endpointConfig, function(error, client){

        if (error) {
          _this.log.error('failed connection to endpoint \'' + endpointName + '\'', error);
          return done(error);
        }

        client.get('/mesh/schema/description', {}, function(error, response) {

          if (error) {
            _this.log.error('failed getting description from \'' + endpointName + '\'', error);
            return done(error);
          }

          _this.log.$$TRACE('got description from \'' + endpointName + '\'');

          //make sure if the description changes, we know it
          client.on('/mesh/schema/description', {}, function(eventData){
            // TODO: handle changed description (rebuild build exchange / event)
            _this._mesh.endpoints[endpointName].description = eventData.payload.data;
          }, function(error) {

            if (error) {
              _this.log.warn('Unable to subscribe to remote endpoint \''+endpointName+'\' description.', error);
            }

            try {
              _this._mesh.endpoints[endpointName] = {
                "data":client,
                "description":response.payload[0].data,
                "name":endpointName
              }
              _this.log.$$DEBUG('assigned endpoint \'' + endpointName + '\'');

            } catch (error) {
              _this.log.warn('Malformed describe from mesh \''+endpointName+'\' ignored.', error);
            }

            var registerPath = '/mesh/system/endpoints/' + _this._mesh.config.name
            client.set(registerPath, {}, {}, function(e, result) {
              // not a requirement
            });

            API._createEndpoint(_this, endpointName, exchangeAPI, eventAPI, function(error) {
              if (error) return done(error);
              _this.log.info('ready endpoint \''+endpointName+'\'');
              done();
            });
          });
        });
      });
    }
  }), callback);
}

Mesh.prototype._eachComponent = function(flow, operator, callback){
  var _this = this;
  async[flow](
    Object.keys(this._mesh.components).map(function(componentName) {
      return function(done) {
        var component = _this._mesh.components[componentName];
        operator(componentName, component, done);
      }
    }),
    callback
  )
}

Mesh.prototype._eachComponentDo = function(options, callback){

  if (!options.methodCategory && !options.methodName)
    return callback(new MeshError("methodName or methodCategory not included in options"));

  if (!options.flow) options.flow = 'series';

  var _this = this;

  this._eachComponent(options.flow, function(componentName, component, done){

    var config = component.config;

    if (options.methodCategory)
      options.methodName = config[options.methodCategory];



    if (!options.methodName) {
      return done(); // error?
    }

    // default assume async with no args and callback as (error){} only
    if (!config.schema || !config.schema.methods || !config.schema.methods[options.methodName]) {
      _this.log.$$DEBUG('calling ' + options.methodCategory + ' \''+componentName+'.'+options.methodName+'()\' as default async');
      return component.instance.operate(options.methodName, [], function(e, responseArgs) {
        if (e) return done(e);
        _this.log.info((options.log || '') + ' component \''+componentName+'\'');
        done.apply(_this, responseArgs);
      });
    }

    var methodConfig = config.schema.methods[options.methodName];
    var methodParameters = (
      methodConfig.parameters?methodConfig.parameters:[]
    ).map(function(p) {return p.value;})
    .filter(function(p) {
      // Assumes startMthod and stopMethod schema either defines values
      // or are optional. Filter out undefines. 
      // IMPORTANT because otherwise method receives (undefined, undefined, undefined, callback)
      return typeof p !== 'undefined';
    });


    if (methodConfig.type == "sync") {
      try{
        _this.log.$$DEBUG('calling ' + options.methodCategory + ' \''+componentName+'.'+options.methodName+'()\' as configured sync');
        component.instance.operate(options.methodName, methodParameters);
        _this.log.info((options.log || '') + ' component \''+componentName+'\'');
        done();
      }catch(e){
        done(new Error(e));
      }
      return;
    }
    _this.log.$$DEBUG('calling ' + options.methodCategory + ' \''+componentName+'.'+options.methodName+'()\' as configured async');
    component.instance.operate(options.methodName, methodParameters, function(e, responseArgs){

      if (e) return done(e);
      _this.log.info((options.log || '') + ' component \''+componentName+'\'');
      done.apply(_this, responseArgs);
    });

  }, callback);
}

Mesh.prototype.__startComponents = function(callback){
  this.log.$$DEBUG('starting');
  this._eachComponentDo({
    methodCategory:'startMethod',
    flow: 'series',
    log: 'started'
  }, callback);
}

Mesh.prototype.__stopComponents = function(callback){
  this.log.$$DEBUG('stopping');
  this._eachComponentDo({
    methodCategory:'stopMethod',
    flow: 'parallel',
    log: 'stopped'
  }, callback);
}

Mesh.prototype.attachSystemComponents = function(config){
  
  if (!config.modules) config.modules = {};
  if (!config.components) config.components = {};

  config.modules.terminal = {
    path:"system:terminal"
  }

  config.modules.api = {
    path:"system:api"
  }

  config.modules.resources = {
    path:"system:resources"
  }

  config.modules.dashboard = {
    path:"system:dashboard"
  }

  config.modules.proxy = {
    path:"system:proxy"
  }

  config.modules.system = {
    path:"system:system"
  }

  config.components.api = {
    schema:{
      "exclusive":false
    },
    web:{
      routes:{
        "client":"handleRequest",
        "app":"static"
      }
    }
  };

  config.components.resources = {
    schema:{
      "exclusive":false
    },
    web:{
      routes:{
        "client":"handleRequest",
        "resources":"static"
      }
    }
  }

  config.components.dashboard = {
    schema:{
      "exclusive":false
    },
    web:{
      routes:{
        "page":"handleRequest",
        "dashboard":"static"
      }
    }
  }

  config.components.proxy = {
    schema:{
      "exclusive":false
    },
    web:{
      routes: {
        "app":"static"
      }
    }
  }

  config.components.system = {
    startMethod: 'initialize',
    schema:{
      "exclusive":false
    },
    web:{
      routes: {
        "dashboard":"static"
      }
    }
  }
}

//if we are running this mesh in test mode, we iterate through the tests and run them, to return a test report
Mesh.prototype.test = function(callback){

}
