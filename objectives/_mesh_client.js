module.exports = function() {

  context('Simultaneous start with slow server', function() {

    before(function(done, Mesh, ConfigFactory, Promise) {

      this.timeout(20000);

      mock(Mesh.prototype).stub(
        function _registerSchema(config) {
          var _registerSchema = mock.original;
          var _this = this;
          var args = arguments;
          setTimeout(function() {
            return _registerSchema.apply(_this, args);
          }, 200);
        }
      );

      Promise.all([

        Mesh.start(ConfigFactory.mesh.fullSingle({
          port: 12345
        })),
        Mesh.MeshClient(12345),

      ])

      .spread(function(mesh, client) {
        mock('client', client);
        mock('Xc', client.exchange);
        mock('mesh', mesh);
      })

      .then(done).catch(done);

    });

    after(function(done, mesh) {
      mesh.stop().then(done).catch(done);
    });

    it('waits for the unready mesh', function(done, expect, Xc) {

      expect(Object.keys(Xc.mesh_name)).to.eql([
        "as_class",
        "as_async_factory",
        "as_sync_factory",
        "as_module",
        "api",
        "resources",
        "proxy",
        "system"
      ]); 
      done();
    })

  });


  context('New component into running mesh informs clientside api', function() {

    require('./__start_stop').mesh(1).client(1);

    it('can call the new component', function(done, expect, Promise, mesh, Xc) {

      expect(Object.keys(Xc.mesh_name)).to.eql([
        "as_class",
        "as_async_factory",
        "as_sync_factory",
        "as_module",
        "api",
        "resources",
        "proxy",
        "system"
      ]);

      mesh._createElement({
        module: {
          name: 'late',
          config: {
            path: 'happner-test-modules.AsLate',
            construct: {
              parameters: [ // TODO: wishlist: rename to params, or args
                {value: 'ARGU'},
                {value: 'MENT'},
                {value: 'S'},
              ]
            }
          }
        },
        component: {
          name: 'late',
          config: {
            module: 'late',
          }
        }
      })

      .delay(200)

      // Call new component from client.

      .then(function() {
        return Xc.mesh_name.late.exchangeMethod({opt:'ions'});
      })

      .then(function(r) {
        expect(r).to.eql({
          opt: 'ions',
          args: 'ARGUMENTS',
          started: true
        });
      })

      .then(done).catch(done);

    })

  });


  context.only('Client (browser) internal event emitter', function() {

    require('./__start_stop').mesh(1).client(1);

    it('emits "create/components" array for all components on start()',
      function(done, expect, client) {

        // client.on(...
        client.once('create/components', function(components) {

          components.length.should.equal(8)
          expect(components.map(
            function(comp) {
              return Object.keys(comp);
            }
          )).to.eql([
            ['name', 'description'],
            ['name', 'description'],
            ['name', 'description'],
            ['name', 'description'],
            ['name', 'description'],
            ['name', 'description'],
            ['name', 'description'],
            ['name', 'description'],
          ]);
          done();
        });

        client.start();
      }
    );

    it('emits "create/components" array (1 element) when components are added to the mesh',
      function(done, expect, client, mesh) {

        var actualDescription = mesh._mesh.endpoints.mesh_name.description.components.late;

        client.start();

        // client.on(...
        client.once('create/components', function(newComponents) {

          try {
            expect(newComponents).to.eql(
              [
                {
                  name: 'late',
                  description: actualDescription
                }
              ]
            );
            done();
          } catch (e) { done(e); }
          
        });

        mesh._createElement({
          module: {
            name: 'late',
            config: {
              path: 'happner-test-modules.AsLate',
              construct: {
                parameters: [ // TODO: wishlist: rename to params, or args
                  {value: 'ARGU'},
                  {value: 'MENT'},
                  {value: 'S'},
                ]
              }
            }
          },
          component: {
            name: 'late',
            config: {
              module: 'late',
            }
          }
        });
      }
    );

    it('emits "destroy/components" when components are removed from the mesh')

  });  

  context('exchange api', function() {

    it('pending');

  });

  context('event api', function() {

    it('pending');

  });

  context('data api', function() {

    it('pending');

  });

}