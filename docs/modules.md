[&#9664;](datalayer.md) datalayer | events [&#9654;](events.md)

## Modules and Components

### What are Modules?

In essence happngin modules are simply node modules that have the additional capacity to be created asyncronously and instantiated by configuration.

This paves the way for `code re-use by configuration` and `remote runtime initialization`

### What are Components?

Components are 'mesh aware' encapsulations of the Module they employ. It is the Components which become accessable as units of functionality on the mesh network.

### Mesh Awareness (with $happn)

Service injection is used to provide mesh awareness into modules. By declaring `$happn` in the arguments to a mesh visible function the mesh can be used by that function. This injection methodology was selected to minimize the code footprint necessary to extend an existing codebase for use in the mesh.

##### The `$happn` service contains:

* `$happn.name` is the name of the ComponentInstance of __this__ Module
* `$happn.config` is the config of the ComponentInstance
* `$happn.module` contains the config and instance of __this__ Module as used by multiple ComponentInstances
* `$happn.emit()` to emit events from the ComponentInstance into the mesh. See [Emitting Events](events.md#emitting-events)
* `$happn.mesh` the ComponentInstance's view into the mesh
* `$happn.mesh.data.*` provides direct access to __this__ MeshNode's dataLayer. See [Data Api](data.md)
* `$happn.mesh.exchange.*` provides access to local `componentName.methodName()` and remote `meshName.componentName.methodName()`. See [Exchange Api](exchange.md)
* `$happn.mesh.event.*` provides subscriber services for events emitted from local `componentName` and remote `meshName.componentName`


##### The ComponentInstance

This refers to the instance of __this__ Module running as a component of the mesh. Multiple components can be configured to use the same module instance. In the example below both `employees` and `clients` are ComponentInstances of `group-of-people`.

eg. (config)

```javascript
  ...
  name: 'company1',
  modules: {
    'group-of-people': {} // npm install group-of-people
  },
  components: {
    'employees': {
        moduleName: 'group-of-people'
    },
    'clients': {
        moduleName: 'group-of-people'
    }
  }
  ...
```

The result is that there are two seprate instances of mesh and web functionality each sharing the same module instance.

eg. (web routes)

`http://localhost:port/company1/employees/...`<br/>
`http://localhost:port/company1/clients/...`

The above example implies that there is polymorphism at play. It is not strictly so. All functionality must be defined in the module. The components are simply views into the module, each exposing a selected subset of functionality by configuration. And each having __it's own unique mesh ""channel"" by way of the `$happn`__ service injection (which is itself the actual ComponentInstance).

__NOTE:__ The module is __shared by all components that use it__. This includes the case of the module as an instance of a class. "You are not alone with your 'this'".

### A Imaginary Module (as example)

Having just done `npm install functionality --save` you will find:

In file `node_modules/functionality/index.js`
```javascript
module.exports.doThing = function(opts, callback) {
  callback(null, {/* result */});
}
```

Because the 'functionality' module requires no configuration it can be up and running in the mesh with a minimum of config.

```javascript
meshConfig = {
  name: 'nodename', // name for this MeshNode
  components: {
    'functionality': {}
  }
}
```

`$happn.mesh.exchange.nodename.functionality.doThing()` can now be called (as if a local function) from other MeshNodes in the network that have endpoints configured to connect to __this__ MeshNode. See [Endpoint Config](configuration.md#endpoint-config) 

All [System Components](system.md) are available by default. This includes the browser MeshClient that can be fetched from the defaut host and port: [http://localhost:8001/api/client](http://localhost:8001/api/client)






`$happngin.ignore`
