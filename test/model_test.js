var assert = require('assert');
var model = require('../');
var Emitter = require('events').EventEmitter;
var util = require('util');
var seraph = require('disposable-seraph');

function SeraphMock() {
  Emitter.call(this);
  var self = this;

  self.options = {id: 'id'};

  function mockMethod(methodName) {
    self[methodName] = function() {
      var args = [].slice.call(arguments);
      self.emit(methodName, args);
      args.pop()(null, args.unshift());
    };
  }

  self._getId = function(obj) {
    return obj;
  };
  ['save', 'index', 'find'].forEach(mockMethod);
}
util.inherits(SeraphMock, Emitter);

describe('Seraph Model', function() {
  var neo;
  var db;
  before(function(done) {
    seraph(function(err, _db, _neo) {
      if (err) return done(err);
      db = _db;
      neo = _neo;
      done();
    });
  });

  after(function(done) {
    neo.stop(function(err) {
      neo.clean(done);
    });
  });
  describe('validation', function() {
    it('should fail save call when validation fails', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');
      beer.on('validate', function(beer, callback) {
        callback(beer.age > 15 ? 'fail!' : null);
      });

      mockdb.on('save', function() {
        assert.fail('called save', 'should not call save');
        done();
      });

      var ipa = {type:'IPA', age:25};
      beer.save(ipa, function(err, ipa) {
        assert.ok(err);
        done();
      })
    });
  });
  describe('indexing', function() {
    it ('should index a new object', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');
      
      var ipa = {type: 'IPA', age: 25};
      
      var hasBeenIndexed = false;
      mockdb.on('index', function(args) {
        hasBeenIndexed = true;
      });
      beer.save(ipa, function(err, ipa) {
        assert(!err);
        assert(hasBeenIndexed);
        done();
      });
    });
    it ('should not index an old object', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');
      
      var ipa = {type: 'IPA', age: 25, id: 54};
      
      var hasBeenIndexed = false;
      mockdb.on('index', function(args) {
        hasBeenIndexed = true;
      });
      beer.save(ipa, function(err, ipa) {
        assert(!err);
        assert(!hasBeenIndexed);
        done();
      });
    });
    it ('should manually index an object', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');
      
      var ipa = {type: 'IPA', age: 25, id: 54};
      
      var hasBeenIndexed = false;
      mockdb.on('index', function(args) {
        hasBeenIndexed = true;
      });
      beer.index(ipa, function(err, ipa) {
        assert(!err);
        assert(hasBeenIndexed);
        done();
      });
    });
    it ('should add to more than one index', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');
      
      beer.addIndex('otherIndex', 'something', 'stuff');
      
      var ipa = {type: 'IPA', age: 25, id: 54};
      
      var indexCount = 0;
      mockdb.on('index', function(args) {
        indexCount++;
      });
      beer.index(ipa, function(err, ipa) {
        assert(!err);
        assert(indexCount == 3, indexCount);
        done();
      });
    });
  });
  describe('save events', function() {
    it('should fire the beforeSave event', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');

      var evfired = false;
      beer.on('beforeSave', function() {
        evfired = true;
      });

      beer.save({type:'IPA'}, function(err,obj) {
        assert(evfired);
        assert(!err);
        done();
      });
    });
    it('should fire the afterSave event', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');

      var evfired = false;
      beer.on('afterSave', function() {
        evfired = true;
      });

      beer.save({type:'IPA'}, function(err,obj) {
        assert(evfired);
        assert(!err);
        done();
      });
    });
    it('should fire the beforeSave event after prep & val', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');

      var evfired = false;
      var validated = false;
      var prepared = false;
      beer.on('beforeSave', function() {
        evfired = validated && prepared;
      });

      beer.on('validate', function(obj,cb) { validated = true, cb(); });
      beer.on('prepare', function(obj,cb) { prepared = true, cb(null, obj) });

      beer.save({type:'IPA'}, function(err,obj) {
        assert(evfired);
        assert(!err);
        done();
      });
    });
    it('should fire the afterSever event after indexing', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');

      var evfired = false;
      var indexed = false;
      beer.on('afterSave', function() {
        evfired = indexed;
      });

      beer.addIndex('testthingy', 'stuff', function(obj,cb) { 
        indexed = true, cb(null, 'thing');
      });

      beer.save({type:'IPA'}, function(err,obj) {
        assert(evfired);
        assert(!err);
        done();
      });
    });
  });
  describe('preparation', function() {
    it('should transform the object by calling preparers', function(done) {
      var numberThinger = model(null, 'NumberThinger');
      var numberThing = { number: 10 };
      numberThinger.on('prepare', function(numberThing, callback) {
        numberThing.number *= 15;
        callback(null, numberThing);
      });
      numberThinger.prepare(numberThing, function(err, thingedNumber) {
        assert.ok(!err);
        assert.notDeepEqual(numberThing, thingedNumber);
        assert.ok(thingedNumber.number === 10 * 15);
        done();
      });
    });
    it('should fail save call when a preparer fails', function(done) {
      var mockdb = new SeraphMock();
      var beer = model(mockdb, 'Beer');
      beer.on('prepare', function(beer, callback) {
        callback('fail!');
      });

      mockdb.on('save', function() {
        assert.fail('called save', 'should not call save');
        done();
      });

      var ipa = {type:'IPA', age:10};
      beer.save(ipa, function(err, ipa) {
        assert.ok(err);
        done();
      })
    });
  });
  describe('whitelisting/fields', function() {
    it('should whitelist a series of properties', function(done) {
      var beer = model(new SeraphMock(), 'Beer');
      beer.fields = [ 'type', 'brewery', 'name' ];

      var ipa = {type:'IPA', brewery:'Lervig', name:'Rye IPA', country:'Norway'};
      beer.prepare(ipa, function(err, preparedIpa) {
        assert.ok(!err);
        assert.notDeepEqual(ipa, preparedIpa);
        assert.deepEqual(preparedIpa, {type:'IPA', brewery:'Lervig', name:'Rye IPA'});
        done();
      });
    });
    it('should not whitelist any fields by default', function(done) {
      var beer = model(null, 'Beer');
      var ipa = {type:'IPA', brewery:'Lervig', name:'Rye IPA', country:'Norway'};
      beer.prepare(ipa, function(err, preparedIpa) {
        assert.ok(!err);
        assert.deepEqual(ipa, preparedIpa);
        done();
      });
    });
  });
  it('it should read a model from the db', function(done) {
    var beer = model(db, 'Beer');
    beer.save({name:"120m IPA"}, function(err, dfh) {
      assert(!err,err);
      beer.read(dfh.id, function(err, thebeer) {
        assert(!err);
        assert(thebeer.name == "120m IPA");
        done();
      });
    });
  });
  it('reading should only read the relevant model', function(done) {
    var beer = model(db, 'Beer');
    var food = model(db, 'Food');
  
    beer.save({name:"Heady Topper"}, function(err, heady) {
      assert(!err);
      food.save({name:"Pinnekjøtt"}, function(err, meat) {
        assert(!err);
        beer.read(meat.id, function(err, nothing) {
          assert(!nothing);
          food.read(beer.id, function(err, nothing) {
            assert(!nothing);
            done();
          });
        });
      })
    });
    
  });
  it('it should check if a model exists', function(done) {
    var beer = model(db, 'Beer');
    beer.save({name:"120m IPA"}, function(err, dfh) {
      assert(!err);
      beer.exists(dfh.id, function(err, exists) {
        assert(!err);
        assert(exists);
        done();
      });
    });
  });
  it('exists should only return true for the relevant model', 
  function(done) {
    var beer = model(db, 'Beer');
    var food = model(db, 'Food');
  
    beer.save({name:"Heady Topper"}, function(err, heady) {
      assert(!err);
      food.save({name:"Pinnekjøtt"}, function(err, meat) {
        assert(!err);
        beer.exists(meat.id, function(err, exists) {
          assert(!exists);
          food.read(beer.id, function(err, exists) {
            assert(!exists);
            done();
          });
        });
      })
    });
    
  });
  describe('Composition', function() {
    it('it should allow composing of models and save them properly', 
    function(done) {
      var beer = model(db, 'Beer');
      var food = model(db, 'Food');
      food.compose(beer, 'matchingBeers', 'matches');
    
      food.save({name:"Pinnekjøtt", matchingBeers:[
        {name:"Heady Topper"},
        {name:"Hovistuten"}
      ]}, function(err, meal) {
        assert(!err);
        assert(meal.id)
        assert(meal.matchingBeers[0].id);
        assert(meal.matchingBeers[1].id);
        db.relationships(meal, function(err, rels) {
          assert(!err);
          assert(rels.length == 2);
          done();
        });
      });
      
    });
    it('it should allow more than one level of nested composition', 
    function(done) {
      var beer = model(db, 'Beer');
      var food = model(db, 'Food');
      var hop = model(db, 'Hop');
      food.compose(beer, 'matchingBeers', 'matches');
      beer.compose(hop, 'hops', 'contains_hop');
    
      food.save({name:"Pinnekjøtt", matchingBeers:[
        {name:"Heady Topper", hops: {name: 'CTZ'}},
        {name:"Hovistuten", hops: [{name: 'Galaxy'},{name: 'Simcoe'}]}
      ]}, function(err, meal) {
        assert(!err);
        assert(meal.id)
        assert(meal.matchingBeers[0].id);
        assert(meal.matchingBeers[1].id);
        assert(meal.matchingBeers[0].hops.id)
        assert(meal.matchingBeers[1].hops[0].id);
        assert(meal.matchingBeers[1].hops[1].id);
        db.relationships(meal, function(err, rels) {
          assert(!err);
          assert(rels.length == 2);
          db.relationships(meal.matchingBeers[1], 'out', function(err, rels) {
            assert(!err)
            assert(rels.length == 2);
            done();
          });
        });
      });
      
    });
    it('it should fire the before and after save events for composed models', 
    function(done) {
      var beforeBeerSaveCount = 0,
          afterBeerSaveCount = 0,
          beforeFoodSaveCount = 0,
          afterFoodSaveCount = 0;

      var beer = model(db, 'Beer');
      var food = model(db, 'Food');

      beer.on('beforeSave', function() { ++beforeBeerSaveCount });
      beer.on('afterSave', function() { ++afterBeerSaveCount });
      food.on('beforeSave', function() { ++beforeFoodSaveCount });
      food.on('afterSave', function() { ++afterFoodSaveCount });

      food.compose(beer, 'matchingBeers', 'matches');
    
      food.save({name:"Pinnekjøtt", matchingBeers:[
        {name:"Heady Topper"},
        {name:"Hovistuten"}
      ]}, function(err, meal) {
        assert(!err);
        assert(beforeBeerSaveCount == 2);
        assert(afterBeerSaveCount == 2);
        assert(beforeFoodSaveCount == 1);
        assert(afterFoodSaveCount == 1);
        done();
      });
      
    });
    it('should handle presave async transforms', 
    function(done) {
      var beer = model(db, 'Beer');
      var food = model(db, 'Food');
      
      beer.on('prepare', function(obj, cb) {
        setTimeout(function() {
          obj.thingy = "prepared";
          cb(null, obj);
        }, 20);
      });

      food.on('prepare', function(obj, cb) {
        setTimeout(function() {
          obj.otherthing = "prepared?";
          cb(null, obj);
        }, 20);
      });

      food.compose(beer, 'matchingBeers', 'matches');
    
      food.save({name:"Pinnekjøtt", matchingBeers:[
        {name:"Heady Topper"},
        {name:"Hovistuten"}
      ]}, function(err, meal) {
        assert(!err);
        assert(meal.otherthing == 'prepared?');
        assert(meal.matchingBeers[0].thingy == 'prepared');
        assert(meal.matchingBeers[1].thingy == 'prepared');
        done();
      });
      
    });

    it('should properly index models', function(done) {
      var beer = model(db, 'Beer');
      var food = model(db, 'Food');

      food.compose(beer, 'matchingBeers', 'matches');
    
      food.save({name:"Pinnekjøtt", matchingBeers:[
        {name:"Heady Topper"},
        {name:"Hovistuten"}
      ]}, function(err, meal) {
          db.index.read('nodes', 'Beer', meal.matchingBeers[0].id, 
          function(err, node) {
            assert(!err, err);
            assert(node);
            assert(node.id == meal.matchingBeers[0].id);
            done();
          });
      });
    });
  });
});
