var expect = require('expect.js');

describe('e3-rest-component', function () {

  it('tests getting function parameters', function(done){
    var utils = require('../lib/system/utilities');

    var testFunc = function(param1/**param1 comment**/, param2/*param2 comment*/, option1, option2){

    };

    var params = utils.getFunctionParameters(testFunc);
    expect(params.length).to.be(4);
    expect(params[1]).to.be("param2");

    done();

  });

  it('tests getting function parameters', function(done){

    var utils = require('../lib/system/utilities');

    var params = utils.findInModules('async', function(e, results){
      done();
    });

  });

  it('tests stringifying errors', function(done){

    var utils = require('../lib/system/utilities');

    var error = new Error('test error');

    var stringifiedError = utils.stringifyError(error);

    var parsedError = JSON.parse(stringifiedError);

    expect(parsedError.stack).to.not.be(null);
    expect(parsedError.message).to.be("test error");

    done();

  });

});
