(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Butler = require('noddity-butler')
var levelup = require('levelup')
var leveljs = require('level-js')

module.exports = function keepUpdated(ractive) {
	var converter = new Markdown.Converter()
	var butler = new Butler('http://localhost.com/joshduff.com/content/', levelup('content', { db: leveljs }))

	function doSomethingAboutThisError(err) {
		console.log(err)
	}

	butler.getPosts(function(err, posts) {
		if (!err) {
			ractive.set('postList', posts.reverse())
		} else {
			doSomethingAboutThisError(err)
		}
	})


	function updatePostInView(post) {
		var posts = ractive.get('posts')
		posts[post.filename] = post
		ractive.update('posts')
	}

	function download(key) {
		butler.getPost(key, function(err, post) {
			if (!err) {
				post.html = converter.makeHtml(post.content)
				updatePostInView(post)
			} else {
				doSomethingAboutThisError(err)
			}
		})
	}

	ractive.observe('current', function(key) {
		download(key)
	})

	butler.on('post changed', function(key, newValue, oldValue) {
		updatePostInView(newValue)
	})

	return download
}

},{"level-js":4,"levelup":13,"noddity-butler":64}],2:[function(require,module,exports){
module.exports = function(ractive, onChange) {
	return Satnav({}).navigate({
		path: 'post/{name}',
		directions: function(params) {
			ractive.set('current', params.name)
		}
	}).navigate({
		path: '/',
		directions: function(params) {
			ractive.set('current', 'home.md')
		}
	}).change(function(params, old) {
		window.scrollTo(0,0)
	}).otherwise('/').go()
}

},{}],3:[function(require,module,exports){
var routing = require('./js/routing.js')
var model = require('./js/model.js')
var Ractive = require('ractive')

var ractive = new Ractive({
	el: 'body',
	template: '#main',
	data: {
		posts: {}
	}
})

model(ractive)

routing(ractive)

},{"./js/model.js":1,"./js/routing.js":2,"ractive":102}],4:[function(require,module,exports){
module.exports = Level

var IDB = require('idb-wrapper')
var AbstractLevelDOWN = require('abstract-leveldown').AbstractLevelDOWN
var util = require('util')
var Iterator = require('./iterator')
var isBuffer = require('isbuffer')

function Level(location) {
  if (!(this instanceof Level)) return new Level(location)
  if (!location) throw new Error("constructor requires at least a location argument")
  
  this.location = location
}

util.inherits(Level, AbstractLevelDOWN)

Level.prototype._open = function(options, callback) {
  var self = this
  
  this.idb = new IDB({
    storeName: this.location,
    autoIncrement: false,
    keyPath: null,
    onStoreReady: function () {
      callback && callback(null, self.idb)
    }, 
    onError: function(err) {
      callback && callback(err)
    }
  })
}

Level.prototype._get = function (key, options, callback) {
  this.idb.get(key, function (value) {
    if (value === undefined) {
      // 'NotFound' error, consistent with LevelDOWN API
      return callback(new Error('NotFound'))
    }
    if (options.asBuffer !== false && !isBuffer(value))
      value = StringToArrayBuffer(String(value))
    return callback(null, value, key)
  }, callback)
}

Level.prototype._del = function(id, options, callback) {
  this.idb.remove(id, callback, callback)
}

Level.prototype._put = function (key, value, options, callback) {
  this.idb.put(key, value, function() { callback() }, callback)
}

Level.prototype.iterator = function (options) {
  if (typeof options !== 'object') options = {}
  return new Iterator(this.idb, options)
}

Level.prototype._batch = function (array, options, callback) {
  var op
    , i

  for (i=0; i < array.length; i++) {
    op = array[i]

    if (op.type === 'del') {
      op.type = 'remove'
    }
  }

  return this.idb.batch(array, function(){ callback() }, callback)
}

Level.prototype._close = function (callback) {
  this.idb.db.close()
  callback()
}

Level.prototype._approximateSize = function() {
  throw new Error('Not implemented')
}

Level.prototype._isBuffer = isBuffer

var checkKeyValue = Level.prototype._checkKeyValue = function (obj, type) {
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')
  if (isBuffer(obj) && obj.byteLength === 0)
    return new Error(type + ' cannot be an empty ArrayBuffer')
  if (String(obj) === '')
    return new Error(type + ' cannot be an empty String')
  if (obj.length === 0)
    return new Error(type + ' cannot be an empty Array')
}

function ArrayBufferToString(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf))
}

function StringToArrayBuffer(str) {
  var buf = new ArrayBuffer(str.length * 2) // 2 bytes for each char
  var bufView = new Uint16Array(buf)
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

},{"./iterator":5,"abstract-leveldown":8,"idb-wrapper":9,"isbuffer":10,"util":130}],5:[function(require,module,exports){
var util = require('util')
var AbstractIterator  = require('abstract-leveldown').AbstractIterator
module.exports = Iterator

function Iterator (db, options) {
  if (!options) options = {}
  this.options = options
  AbstractIterator.call(this, db)
  this._order = !!options.reverse ? 'DESC': 'ASC'
  this._start = options.start
  this._limit = options.limit
  if (this._limit) this._count = 0
  this._end   = options.end
  this._done = false
}

util.inherits(Iterator, AbstractIterator)

Iterator.prototype.createIterator = function() {
  var lower, upper
  var onlyStart = typeof this._start !== 'undefined' && typeof this._end === 'undefined'
  var onlyEnd = typeof this._start === 'undefined' && typeof this._end !== 'undefined'
  var startAndEnd = typeof this._start !== 'undefined' && typeof this._end !== 'undefined'
  if (onlyStart) {
    var index = this._start
    if (this._order === 'ASC') {
      lower = index
    } else {
      upper = index
    }
  } else if (onlyEnd) {
    var index = this._end
    if (this._order === 'DESC') {
      lower = index
    } else {
      upper = index
    }
  } else if (startAndEnd) {
    lower = this._start
    upper = this._end
    if (this._start > this._end) {
      lower = this._end
      upper = this._start
    }
  }
  if (lower || upper) {
    this._keyRange = this.options.keyRange || this.db.makeKeyRange({
      lower: lower,
      upper: upper
      // TODO expose excludeUpper/excludeLower
    })
  }
  this.iterator = this.db.iterate(this.onItem.bind(this), {
    keyRange: this._keyRange,
    autoContinue: false,
    order: this._order,
    onError: function(err) { console.log('horrible error', err) },
  })
}

// TODO the limit implementation here just ignores all reads after limit has been reached
// it should cancel the iterator instead but I don't know how
Iterator.prototype.onItem = function (value, cursor, cursorTransaction) {
  if (!cursor && this.callback) {
    this.callback()
    this.callback = false
    return
  }
  if (this._limit && this._limit > 0) {
    if (this._limit > this._count) this.callback(false, cursor.key, cursor.value)
  } else {
    this.callback(false, cursor.key, cursor.value)
  }
  if (this._limit) this._count++
  if (cursor) cursor.continue()
}

Iterator.prototype._next = function (callback) {
  if (!callback) return new Error('next() requires a callback argument')
  if (!this._started) {
    this.createIterator()
    this._started = true
  }
  this.callback = callback
}
},{"abstract-leveldown":8,"util":130}],6:[function(require,module,exports){
var process=require("__browserify_process");/* Copyright (c) 2013 Rod Vagg, MIT License */

function AbstractChainedBatch (db) {
  this._db         = db
  this._operations = []
  this._written    = false
}

AbstractChainedBatch.prototype._checkWritten = function () {
  if (this._written)
    throw new Error('write() already called on this batch')
}

AbstractChainedBatch.prototype.put = function (key, value) {
  this._checkWritten()

  var err = this._db._checkKeyValue(key, 'key', this._db._isBuffer)
  if (err) throw err
  err = this._db._checkKeyValue(value, 'value', this._db._isBuffer)
  if (err) throw err

  if (!this._db._isBuffer(key)) key = String(key)
  if (!this._db._isBuffer(value)) value = String(value)

  this._operations.push({ type: 'put', key: key, value: value })

  return this
}

AbstractChainedBatch.prototype.del = function (key) {
  this._checkWritten()

  var err = this._db._checkKeyValue(key, 'key', this._db._isBuffer)
  if (err) throw err

  if (!this._db._isBuffer(key)) key = String(key)

  this._operations.push({ type: 'del', key: key })

  return this
}

AbstractChainedBatch.prototype.clear = function () {
  this._checkWritten()

  this._operations = []
  return this
}

AbstractChainedBatch.prototype.write = function (options, callback) {
  this._checkWritten()

  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('write() requires a callback argument')
  if (typeof options != 'object')
    options = {}

  this._written = true

  if (typeof this._db._batch == 'function')
    return this._db._batch(this._operations, options, callback)

  process.nextTick(callback)
}

module.exports = AbstractChainedBatch
},{"__browserify_process":112}],7:[function(require,module,exports){
var process=require("__browserify_process");/* Copyright (c) 2013 Rod Vagg, MIT License */

function AbstractIterator (db) {
  this.db = db
  this._ended = false
  this._nexting = false
}

AbstractIterator.prototype.next = function (callback) {
  var self = this

  if (typeof callback != 'function')
    throw new Error('next() requires a callback argument')

  if (self._ended)
    return callback(new Error('cannot call next() after end()'))
  if (self._nexting)
    return callback(new Error('cannot call next() before previous next() has completed'))

  self._nexting = true
  if (typeof self._next == 'function') {
    return self._next(function () {
      self._nexting = false
      callback.apply(null, arguments)
    })
  }

  process.nextTick(function () {
    self._nexting = false
    callback()
  })
}

AbstractIterator.prototype.end = function (callback) {
  if (typeof callback != 'function')
    throw new Error('end() requires a callback argument')

  if (this._ended)
    return callback(new Error('end() already called on iterator'))

  this._ended = true

  if (typeof this._end == 'function')
    return this._end(callback)

  process.nextTick(callback)
}

module.exports = AbstractIterator

},{"__browserify_process":112}],8:[function(require,module,exports){
var process=require("__browserify_process"),Buffer=require("__browserify_Buffer");/* Copyright (c) 2013 Rod Vagg, MIT License */

var AbstractIterator     = require('./abstract-iterator')
  , AbstractChainedBatch = require('./abstract-chained-batch')

function AbstractLevelDOWN (location) {
  if (!arguments.length || location === undefined)
    throw new Error('constructor requires at least a location argument')

  if (typeof location != 'string')
    throw new Error('constructor requires a location string argument')

  this.location = location
}

AbstractLevelDOWN.prototype.open = function (options, callback) {
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('open() requires a callback argument')
  if (typeof options != 'object')
    options = {}

  if (typeof this._open == 'function')
    return this._open(options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.close = function (callback) {
  if (typeof callback != 'function')
    throw new Error('close() requires a callback argument')

  if (typeof this._close == 'function')
    return this._close(callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.get = function (key, options, callback) {
  var self = this
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('get() requires a callback argument')
  var err = self._checkKeyValue(key, 'key', self._isBuffer)
  if (err) return callback(err)
  if (!self._isBuffer(key)) key = String(key)
  if (typeof options != 'object')
    options = {}

  if (typeof self._get == 'function')
    return self._get(key, options, callback)

  process.nextTick(function () { callback(new Error('NotFound')) })
}

AbstractLevelDOWN.prototype.put = function (key, value, options, callback) {
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('put() requires a callback argument')
  var err = this._checkKeyValue(key, 'key', this._isBuffer)
  if (err) return callback(err)
  err = this._checkKeyValue(value, 'value', this._isBuffer)
  if (err) return callback(err)
  if (!this._isBuffer(key)) key = String(key)
  // coerce value to string in node, dont touch it in browser
  // (indexeddb can store any JS type)
  if (!this._isBuffer(value) && !process.browser) value = String(value)
  if (typeof options != 'object')
    options = {}
  if (typeof this._put == 'function')
    return this._put(key, value, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.del = function (key, options, callback) {
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('del() requires a callback argument')
  var err = this._checkKeyValue(key, 'key', this._isBuffer)
  if (err) return callback(err)
  if (!this._isBuffer(key)) key = String(key)
  if (typeof options != 'object')
    options = {}


  if (typeof this._del == 'function')
    return this._del(key, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.batch = function (array, options, callback) {
  if (!arguments.length)
    return this._chainedBatch()

  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('batch(array) requires a callback argument')
  if (!Array.isArray(array))
    return callback(new Error('batch(array) requires an array argument'))
  if (typeof options != 'object')
    options = {}

  var i = 0
    , l = array.length
    , e
    , err

  for (; i < l; i++) {
    e = array[i]
    if (typeof e != 'object') continue;

    err = this._checkKeyValue(e.type, 'type', this._isBuffer)
    if (err) return callback(err)

    err = this._checkKeyValue(e.key, 'key', this._isBuffer)
    if (err) return callback(err)

    if (e.type == 'put') {
      err = this._checkKeyValue(e.value, 'value', this._isBuffer)
      if (err) return callback(err)
    }
  }

  if (typeof this._batch == 'function')
    return this._batch(array, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.approximateSize = function (start, end, callback) {
  if (start == null || end == null || typeof start == 'function' || typeof end == 'function')
    throw new Error('approximateSize() requires valid `start`, `end` and `callback` arguments')
  if (typeof callback != 'function')
    throw new Error('approximateSize() requires a callback argument')

  if (!this._isBuffer(start)) start = String(start)
  if (!this._isBuffer(end)) end = String(end)
  if (typeof this._approximateSize == 'function')
    return this._approximateSize(start, end, callback)

  process.nextTick(function () { callback(null, 0) })
}

AbstractLevelDOWN.prototype.iterator = function (options) {
  if (typeof options != 'object')
    options = {}

  if (typeof this._iterator == 'function')
    return this._iterator(options)

  return new AbstractIterator(this)
}

AbstractLevelDOWN.prototype._chainedBatch = function () {
  return new AbstractChainedBatch(this)
}

AbstractLevelDOWN.prototype._isBuffer = function (obj) {
  return Buffer.isBuffer(obj)
}

AbstractLevelDOWN.prototype._checkKeyValue = function (obj, type) {
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')
  if (this._isBuffer(obj)) {
    if (obj.length === 0)
      return new Error(type + ' cannot be an empty Buffer')
  } else if (String(obj) === '')
    return new Error(type + ' cannot be an empty String')
}

module.exports.AbstractLevelDOWN = AbstractLevelDOWN
module.exports.AbstractIterator  = AbstractIterator

},{"./abstract-chained-batch":6,"./abstract-iterator":7,"__browserify_Buffer":111,"__browserify_process":112}],9:[function(require,module,exports){
/*jshint expr:true */
/*global window:false, console:false, define:false, module:false */

/**
 * @license IDBWrapper - A cross-browser wrapper for IndexedDB
 * Copyright (c) 2011 - 2013 Jens Arps
 * http://jensarps.de/
 *
 * Licensed under the MIT (X11) license
 */

(function (name, definition, global) {
  if (typeof define === 'function') {
    define(definition);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = definition();
  } else {
    global[name] = definition();
  }
})('IDBStore', function () {

  "use strict";

  var defaults = {
    storeName: 'Store',
    storePrefix: 'IDBWrapper-',
    dbVersion: 1,
    keyPath: 'id',
    autoIncrement: true,
    onStoreReady: function () {
    },
    onError: function(error){
      throw error;
    },
    indexes: []
  };

  /**
   *
   * The IDBStore constructor
   *
   * @constructor
   * @name IDBStore
   * @version 1.1.0
   *
   * @param {Object} [kwArgs] An options object used to configure the store and
   *  set callbacks
   * @param {String} [kwArgs.storeName='Store'] The name of the store
   * @param {String} [kwArgs.storePrefix='IDBWrapper-'] A prefix that is
   *  internally used to construct the name of the database, which will be
   *  kwArgs.storePrefix + kwArgs.storeName
   * @param {Number} [kwArgs.dbVersion=1] The version of the store
   * @param {String} [kwArgs.keyPath='id'] The key path to use. If you want to
   *  setup IDBWrapper to work with out-of-line keys, you need to set this to
   *  `null`
   * @param {Boolean} [kwArgs.autoIncrement=true] If set to true, IDBStore will
   *  automatically make sure a unique keyPath value is present on each object
   *  that is stored.
   * @param {Function} [kwArgs.onStoreReady] A callback to be called when the
   *  store is ready to be used.
   * @param {Function} [kwArgs.onError=throw] A callback to be called when an
   *  error occurred during instantiation of the store.
   * @param {Array} [kwArgs.indexes=[]] An array of indexData objects
   *  defining the indexes to use with the store. For every index to be used
   *  one indexData object needs to be passed in the array.
   *  An indexData object is defined as follows:
   * @param {Object} [kwArgs.indexes.indexData] An object defining the index to
   *  use
   * @param {String} kwArgs.indexes.indexData.name The name of the index
   * @param {String} [kwArgs.indexes.indexData.keyPath] The key path of the index
   * @param {Boolean} [kwArgs.indexes.indexData.unique] Whether the index is unique
   * @param {Boolean} [kwArgs.indexes.indexData.multiEntry] Whether the index is multi entry
   * @param {Function} [onStoreReady] A callback to be called when the store
   * is ready to be used.
   * @example
      // create a store for customers with an additional index over the
      // `lastname` property.
      var myCustomerStore = new IDBStore({
        dbVersion: 1,
        storeName: 'customer-index',
        keyPath: 'customerid',
        autoIncrement: true,
        onStoreReady: populateTable,
        indexes: [
          { name: 'lastname', keyPath: 'lastname', unique: false, multiEntry: false }
        ]
      });
   * @example
      // create a generic store
      var myCustomerStore = new IDBStore({
        storeName: 'my-data-store',
        onStoreReady: function(){
          // start working with the store.
        }
      });
   */
  var IDBStore = function (kwArgs, onStoreReady) {

    for(var key in defaults){
      this[key] = typeof kwArgs[key] != 'undefined' ? kwArgs[key] : defaults[key];
    }

    this.dbName = this.storePrefix + this.storeName;
    this.dbVersion = parseInt(this.dbVersion, 10);

    onStoreReady && (this.onStoreReady = onStoreReady);

    this.idb = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
    this.keyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange;

    this.consts = {
      'READ_ONLY':         'readonly',
      'READ_WRITE':        'readwrite',
      'VERSION_CHANGE':    'versionchange',
      'NEXT':              'next',
      'NEXT_NO_DUPLICATE': 'nextunique',
      'PREV':              'prev',
      'PREV_NO_DUPLICATE': 'prevunique'
    };

    this.openDB();
  };

  IDBStore.prototype = /** @lends IDBStore */ {

    /**
     * The version of IDBStore
     *
     * @type String
     */
    version: '1.2.0',

    /**
     * A reference to the IndexedDB object
     *
     * @type Object
     */
    db: null,

    /**
     * The full name of the IndexedDB used by IDBStore, composed of
     * this.storePrefix + this.storeName
     *
     * @type String
     */
    dbName: null,

    /**
     * The version of the IndexedDB used by IDBStore
     *
     * @type Number
     */
    dbVersion: null,

    /**
     * A reference to the objectStore used by IDBStore
     *
     * @type Object
     */
    store: null,

    /**
     * The store name
     *
     * @type String
     */
    storeName: null,

    /**
     * The key path
     *
     * @type String
     */
    keyPath: null,

    /**
     * Whether IDBStore uses autoIncrement
     *
     * @type Boolean
     */
    autoIncrement: null,

    /**
     * The indexes used by IDBStore
     *
     * @type Array
     */
    indexes: null,

    /**
     * A hashmap of features of the used IDB implementation
     *
     * @type Object
     * @proprty {Boolean} autoIncrement If the implementation supports
     *  native auto increment
     */
    features: null,

    /**
     * The callback to be called when the store is ready to be used
     *
     * @type Function
     */
    onStoreReady: null,

    /**
     * The callback to be called if an error occurred during instantiation
     * of the store
     *
     * @type Function
     */
    onError: null,

    /**
     * The internal insertID counter
     *
     * @type Number
     * @private
     */
    _insertIdCount: 0,

    /**
     * Opens an IndexedDB; called by the constructor.
     *
     * Will check if versions match and compare provided index configuration
     * with existing ones, and update indexes if necessary.
     *
     * Will call this.onStoreReady() if everything went well and the store
     * is ready to use, and this.onError() is something went wrong.
     *
     * @private
     *
     */
    openDB: function () {

      var features = this.features = {};
      features.hasAutoIncrement = !window.mozIndexedDB;

      var openRequest = this.idb.open(this.dbName, this.dbVersion);
      var preventSuccessCallback = false;

      openRequest.onerror = function (error) {

        var gotVersionErr = false;
        if ('error' in error.target) {
          gotVersionErr = error.target.error.name == "VersionError";
        } else if ('errorCode' in error.target) {
          gotVersionErr = error.target.errorCode == 12;
        }

        if (gotVersionErr) {
          this.onError(new Error('The version number provided is lower than the existing one.'));
        } else {
          this.onError(error);
        }
      }.bind(this);

      openRequest.onsuccess = function (event) {

        if (preventSuccessCallback) {
          return;
        }

        if(this.db){
          this.onStoreReady();
          return;
        }

        this.db = event.target.result;

        if(typeof this.db.version == 'string'){
          this.onError(new Error('The IndexedDB implementation in this browser is outdated. Please upgrade your browser.'));
          return;
        }

        if(!this.db.objectStoreNames.contains(this.storeName)){
          // We should never ever get here.
          // Lets notify the user anyway.
          this.onError(new Error('Something is wrong with the IndexedDB implementation in this browser. Please upgrade your browser.'));
          return;
        }

        var emptyTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
        this.store = emptyTransaction.objectStore(this.storeName);

        // check indexes
        this.indexes.forEach(function(indexData){
          var indexName = indexData.name;

          if(!indexName){
            preventSuccessCallback = true;
            this.onError(new Error('Cannot create index: No index name given.'));
            return;
          }

          this.normalizeIndexData(indexData);

          if(this.hasIndex(indexName)){
            // check if it complies
            var actualIndex = this.store.index(indexName);
            var complies = this.indexComplies(actualIndex, indexData);
            if(!complies){
              preventSuccessCallback = true;
              this.onError(new Error('Cannot modify index "' + indexName + '" for current version. Please bump version number to ' + ( this.dbVersion + 1 ) + '.'));
            }
          } else {
            preventSuccessCallback = true;
            this.onError(new Error('Cannot create new index "' + indexName + '" for current version. Please bump version number to ' + ( this.dbVersion + 1 ) + '.'));
          }

        }, this);

        preventSuccessCallback || this.onStoreReady();
      }.bind(this);

      openRequest.onupgradeneeded = function(/* IDBVersionChangeEvent */ event){

        this.db = event.target.result;

        if(this.db.objectStoreNames.contains(this.storeName)){
          this.store = event.target.transaction.objectStore(this.storeName);
        } else {
          this.store = this.db.createObjectStore(this.storeName, { keyPath: this.keyPath, autoIncrement: this.autoIncrement});
        }

        this.indexes.forEach(function(indexData){
          var indexName = indexData.name;

          if(!indexName){
            preventSuccessCallback = true;
            this.onError(new Error('Cannot create index: No index name given.'));
          }

          this.normalizeIndexData(indexData);

          if(this.hasIndex(indexName)){
            // check if it complies
            var actualIndex = this.store.index(indexName);
            var complies = this.indexComplies(actualIndex, indexData);
            if(!complies){
              // index differs, need to delete and re-create
              this.store.deleteIndex(indexName);
              this.store.createIndex(indexName, indexData.keyPath, { unique: indexData.unique, multiEntry: indexData.multiEntry });
            }
          } else {
            this.store.createIndex(indexName, indexData.keyPath, { unique: indexData.unique, multiEntry: indexData.multiEntry });
          }

        }, this);

      }.bind(this);
    },

    /**
     * Deletes the database used for this store if the IDB implementations
     * provides that functionality.
     */
    deleteDatabase: function () {
      if (this.idb.deleteDatabase) {
        this.idb.deleteDatabase(this.dbName);
      }
    },

    /*********************
     * data manipulation *
     *********************/

    /**
     * Puts an object into the store. If an entry with the given id exists,
     * it will be overwritten. This method has a different signature for inline
     * keys and out-of-line keys; please see the examples below.
     *
     * @param {*} [key] The key to store. This is only needed if IDBWrapper
     *  is set to use out-of-line keys. For inline keys - the default scenario -
     *  this can be omitted.
     * @param {Object} value The data object to store.
     * @param {Function} [onSuccess] A callback that is called if insertion
     *  was successful.
     * @param {Function} [onError] A callback that is called if insertion
     *  failed.
     * @example
        // Storing an object, using inline keys (the default scenario):
        var myCustomer = {
          customerid: 2346223,
          lastname: 'Doe',
          firstname: 'John'
        };
        myCustomerStore.put(myCustomer, mySuccessHandler, myErrorHandler);
        // Note that passing success- and error-handlers is optional.
     * @example
        // Storing an object, using out-of-line keys:
       var myCustomer = {
         lastname: 'Doe',
         firstname: 'John'
       };
       myCustomerStore.put(2346223, myCustomer, mySuccessHandler, myErrorHandler);
      // Note that passing success- and error-handlers is optional.
     */
    put: function (key, value, onSuccess, onError) {
      if (this.keyPath !== null) {
        onError = onSuccess;
        onSuccess = value;
        value = key;
      }
      onError || (onError = function (error) {
        console.error('Could not write data.', error);
      });
      onSuccess || (onSuccess = noop);

      var hasSuccess = false,
          result = null,
          putRequest;

      var putTransaction = this.db.transaction([this.storeName], this.consts.READ_WRITE);
      putTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      putTransaction.onabort = onError;
      putTransaction.onerror = onError;

      if (this.keyPath !== null) { // in-line keys
        this._addIdPropertyIfNeeded(value);
        putRequest = putTransaction.objectStore(this.storeName).put(value);
      } else { // out-of-line keys
        putRequest = putTransaction.objectStore(this.storeName).put(value, key);
      }
      putRequest.onsuccess = function (event) {
        hasSuccess = true;
        result = event.target.result;
      };
      putRequest.onerror = onError;
    },

    /**
     * Retrieves an object from the store. If no entry exists with the given id,
     * the success handler will be called with null as first and only argument.
     *
     * @param {*} key The id of the object to fetch.
     * @param {Function} [onSuccess] A callback that is called if fetching
     *  was successful. Will receive the object as only argument.
     * @param {Function} [onError] A callback that will be called if an error
     *  occurred during the operation.
     */
    get: function (key, onSuccess, onError) {
      onError || (onError = function (error) {
        console.error('Could not read data.', error);
      });
      onSuccess || (onSuccess = noop);

      var hasSuccess = false,
          result = null;
      
      var getTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
      getTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      getTransaction.onabort = onError;
      getTransaction.onerror = onError;
      var getRequest = getTransaction.objectStore(this.storeName).get(key);
      getRequest.onsuccess = function (event) {
        hasSuccess = true;
        result = event.target.result;
      };
      getRequest.onerror = onError;
    },

    /**
     * Removes an object from the store.
     *
     * @param {*} key The id of the object to remove.
     * @param {Function} [onSuccess] A callback that is called if the removal
     *  was successful.
     * @param {Function} [onError] A callback that will be called if an error
     *  occurred during the operation.
     */
    remove: function (key, onSuccess, onError) {
      onError || (onError = function (error) {
        console.error('Could not remove data.', error);
      });
      onSuccess || (onSuccess = noop);

      var hasSuccess = false,
          result = null;

      var removeTransaction = this.db.transaction([this.storeName], this.consts.READ_WRITE);
      removeTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      removeTransaction.onabort = onError;
      removeTransaction.onerror = onError;

      var deleteRequest = removeTransaction.objectStore(this.storeName)['delete'](key);
      deleteRequest.onsuccess = function (event) {
        hasSuccess = true;
        result = event.target.result;
      };
      deleteRequest.onerror = onError;
    },

    /**
     * Runs a batch of put and/or remove operations on the store.
     *
     * @param {Array} dataArray An array of objects containing the operation to run
     *  and the data object (for put operations).
     * @param {Function} [onSuccess] A callback that is called if all operations
     *  were successful.
     * @param {Function} [onError] A callback that is called if an error
     *  occurred during one of the operations.
     */
    batch: function (dataArray, onSuccess, onError) {
      onError || (onError = function (error) {
        console.error('Could not apply batch.', error);
      });
      onSuccess || (onSuccess = noop);

      if(Object.prototype.toString.call(dataArray) != '[object Array]'){
        onError(new Error('dataArray argument must be of type Array.'));
      }
      var batchTransaction = this.db.transaction([this.storeName] , this.consts.READ_WRITE);
      batchTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(hasSuccess);
      };
      batchTransaction.onabort = onError;
      batchTransaction.onerror = onError;
      
      var count = dataArray.length;
      var called = false;
      var hasSuccess = false;

      var onItemSuccess = function () {
        count--;
        if (count === 0 && !called) {
          called = true;
          hasSuccess = true;
        }
      };

      dataArray.forEach(function (operation) {
        var type = operation.type;
        var key = operation.key;
        var value = operation.value;

        var onItemError = function (err) {
          batchTransaction.abort();
          if (!called) {
            called = true;
            onError(err, type, key);
          }
        };

        if (type == "remove") {
          var deleteRequest = batchTransaction.objectStore(this.storeName)['delete'](key);
          deleteRequest.onsuccess = onItemSuccess;
          deleteRequest.onerror = onItemError;
        } else if (type == "put") {
          var putRequest;
          if (this.keyPath !== null) { // in-line keys
            this._addIdPropertyIfNeeded(value);
            putRequest = batchTransaction.objectStore(this.storeName).put(value);
          } else { // out-of-line keys
            putRequest = batchTransaction.objectStore(this.storeName).put(value, key);
          }
          putRequest.onsuccess = onItemSuccess;
          putRequest.onerror = onItemError;
        }
      }, this);
    },

    /**
     * Fetches all entries in the store.
     *
     * @param {Function} [onSuccess] A callback that is called if the operation
     *  was successful. Will receive an array of objects.
     * @param {Function} [onError] A callback that will be called if an error
     *  occurred during the operation.
     */
    getAll: function (onSuccess, onError) {
      onError || (onError = function (error) {
        console.error('Could not read data.', error);
      });
      onSuccess || (onSuccess = noop);
      var getAllTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
      var store = getAllTransaction.objectStore(this.storeName);
      if (store.getAll) {
        this._getAllNative(getAllTransaction, store, onSuccess, onError);
      } else {
        this._getAllCursor(getAllTransaction, store, onSuccess, onError);
      }
    },

    /**
     * Implements getAll for IDB implementations that have a non-standard
     * getAll() method.
     *
     * @param {Object} getAllTransaction An open READ transaction.
     * @param {Object} store A reference to the store.
     * @param {Function} onSuccess A callback that will be called if the
     *  operation was successful.
     * @param {Function} onError A callback that will be called if an
     *  error occurred during the operation.
     * @private
     */
    _getAllNative: function (getAllTransaction, store, onSuccess, onError) {
      var hasSuccess = false,
          result = null;

      getAllTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      getAllTransaction.onabort = onError;
      getAllTransaction.onerror = onError;

      var getAllRequest = store.getAll();
      getAllRequest.onsuccess = function (event) {
        hasSuccess = true;
        result = event.target.result;
      };
      getAllRequest.onerror = onError;
    },

    /**
     * Implements getAll for IDB implementations that do not have a getAll()
     * method.
     *
     * @param {Object} getAllTransaction An open READ transaction.
     * @param {Object} store A reference to the store.
     * @param {Function} onSuccess A callback that will be called if the
     *  operation was successful.
     * @param {Function} onError A callback that will be called if an
     *  error occurred during the operation.
     * @private
     */
    _getAllCursor: function (getAllTransaction, store, onSuccess, onError) {
      var all = [],
          hasSuccess = false,
          result = null;

      getAllTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      getAllTransaction.onabort = onError;
      getAllTransaction.onerror = onError;

      var cursorRequest = store.openCursor();
      cursorRequest.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          all.push(cursor.value);
          cursor['continue']();
        }
        else {
          hasSuccess = true;
          result = all;
        }
      };
      cursorRequest.onError = onError;
    },

    /**
     * Clears the store, i.e. deletes all entries in the store.
     *
     * @param {Function} [onSuccess] A callback that will be called if the
     *  operation was successful.
     * @param {Function} [onError] A callback that will be called if an
     *  error occurred during the operation.
     */
    clear: function (onSuccess, onError) {
      onError || (onError = function (error) {
        console.error('Could not clear store.', error);
      });
      onSuccess || (onSuccess = noop);

      var hasSuccess = false,
          result = null;

      var clearTransaction = this.db.transaction([this.storeName], this.consts.READ_WRITE);
      clearTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      clearTransaction.onabort = onError;
      clearTransaction.onerror = onError;

      var clearRequest = clearTransaction.objectStore(this.storeName).clear();
      clearRequest.onsuccess = function (event) {
        hasSuccess = true;
        result = event.target.result;
      };
      clearRequest.onerror = onError;
    },

    /**
     * Checks if an id property needs to present on a object and adds one if
     * necessary.
     *
     * @param {Object} dataObj The data object that is about to be stored
     * @private
     */
    _addIdPropertyIfNeeded: function (dataObj) {
      if (!this.features.hasAutoIncrement && typeof dataObj[this.keyPath] == 'undefined') {
        dataObj[this.keyPath] = this._insertIdCount++ + Date.now();
      }
    },

    /************
     * indexing *
     ************/

    /**
     * Returns a DOMStringList of index names of the store.
     *
     * @return {DOMStringList} The list of index names
     */
    getIndexList: function () {
      return this.store.indexNames;
    },

    /**
     * Checks if an index with the given name exists in the store.
     *
     * @param {String} indexName The name of the index to look for
     * @return {Boolean} Whether the store contains an index with the given name
     */
    hasIndex: function (indexName) {
      return this.store.indexNames.contains(indexName);
    },

    /**
     * Normalizes an object containing index data and assures that all
     * properties are set.
     *
     * @param {Object} indexData The index data object to normalize
     * @param {String} indexData.name The name of the index
     * @param {String} [indexData.keyPath] The key path of the index
     * @param {Boolean} [indexData.unique] Whether the index is unique
     * @param {Boolean} [indexData.multiEntry] Whether the index is multi entry
     */
    normalizeIndexData: function (indexData) {
      indexData.keyPath = indexData.keyPath || indexData.name;
      indexData.unique = !!indexData.unique;
      indexData.multiEntry = !!indexData.multiEntry;
    },

    /**
     * Checks if an actual index complies with an expected index.
     *
     * @param {Object} actual The actual index found in the store
     * @param {Object} expected An Object describing an expected index
     * @return {Boolean} Whether both index definitions are identical
     */
    indexComplies: function (actual, expected) {
      var complies = ['keyPath', 'unique', 'multiEntry'].every(function (key) {
        // IE10 returns undefined for no multiEntry
        if (key == 'multiEntry' && actual[key] === undefined && expected[key] === false) {
          return true;
        }
        return expected[key] == actual[key];
      });
      return complies;
    },

    /**********
     * cursor *
     **********/

    /**
     * Iterates over the store using the given options and calling onItem
     * for each entry matching the options.
     *
     * @param {Function} onItem A callback to be called for each match
     * @param {Object} [options] An object defining specific options
     * @param {Object} [options.index=null] An IDBIndex to operate on
     * @param {String} [options.order=ASC] The order in which to provide the
     *  results, can be 'DESC' or 'ASC'
     * @param {Boolean} [options.autoContinue=true] Whether to automatically
     *  iterate the cursor to the next result
     * @param {Boolean} [options.filterDuplicates=false] Whether to exclude
     *  duplicate matches
     * @param {Object} [options.keyRange=null] An IDBKeyRange to use
     * @param {Boolean} [options.writeAccess=false] Whether grant write access
     *  to the store in the onItem callback
     * @param {Function} [options.onEnd=null] A callback to be called after
     *  iteration has ended
     * @param {Function} [options.onError=console.error] A callback to be called
     *  if an error occurred during the operation.
     */
    iterate: function (onItem, options) {
      options = mixin({
        index: null,
        order: 'ASC',
        autoContinue: true,
        filterDuplicates: false,
        keyRange: null,
        writeAccess: false,
        onEnd: null,
        onError: function (error) {
          console.error('Could not open cursor.', error);
        }
      }, options || {});

      var directionType = options.order.toLowerCase() == 'desc' ? 'PREV' : 'NEXT';
      if (options.filterDuplicates) {
        directionType += '_NO_DUPLICATE';
      }

      var hasSuccess = false;
      var cursorTransaction = this.db.transaction([this.storeName], this.consts[options.writeAccess ? 'READ_WRITE' : 'READ_ONLY']);
      var cursorTarget = cursorTransaction.objectStore(this.storeName);
      if (options.index) {
        cursorTarget = cursorTarget.index(options.index);
      }

      cursorTransaction.oncomplete = function () {
        if (!hasSuccess) {
          options.onError(null);
          return;
        }
        if (options.onEnd) {
          options.onEnd();
        } else {
          onItem(null);
        }
      };
      cursorTransaction.onabort = options.onError;
      cursorTransaction.onerror = options.onError;

      var cursorRequest = cursorTarget.openCursor(options.keyRange, this.consts[directionType]);
      cursorRequest.onerror = options.onError;
      cursorRequest.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          onItem(cursor.value, cursor, cursorTransaction);
          if (options.autoContinue) {
            cursor['continue']();
          }
        } else {
          hasSuccess = true;
        }
      };
    },

    /**
     * Runs a query against the store and passes an array containing matched
     * objects to the success handler.
     *
     * @param {Function} onSuccess A callback to be called when the operation
     *  was successful.
     * @param {Object} [options] An object defining specific query options
     * @param {Object} [options.index=null] An IDBIndex to operate on
     * @param {String} [options.order=ASC] The order in which to provide the
     *  results, can be 'DESC' or 'ASC'
     * @param {Boolean} [options.filterDuplicates=false] Whether to exclude
     *  duplicate matches
     * @param {Object} [options.keyRange=null] An IDBKeyRange to use
     * @param {Function} [options.onError=console.error] A callback to be called if an error
     *  occurred during the operation.
     */
    query: function (onSuccess, options) {
      var result = [];
      options = options || {};
      options.onEnd = function () {
        onSuccess(result);
      };
      this.iterate(function (item) {
        result.push(item);
      }, options);
    },

    /**
     *
     * Runs a query against the store, but only returns the number of matches
     * instead of the matches itself.
     *
     * @param {Function} onSuccess A callback to be called if the opration
     *  was successful.
     * @param {Object} [options] An object defining specific options
     * @param {Object} [options.index=null] An IDBIndex to operate on
     * @param {Object} [options.keyRange=null] An IDBKeyRange to use
     * @param {Function} [options.onError=console.error] A callback to be called if an error
     *  occurred during the operation.
     */
    count: function (onSuccess, options) {

      options = mixin({
        index: null,
        keyRange: null
      }, options || {});

      var onError = options.onError || function (error) {
        console.error('Could not open cursor.', error);
      };

      var hasSuccess = false,
          result = null;

      var cursorTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
      cursorTransaction.oncomplete = function () {
        var callback = hasSuccess ? onSuccess : onError;
        callback(result);
      };
      cursorTransaction.onabort = onError;
      cursorTransaction.onerror = onError;

      var cursorTarget = cursorTransaction.objectStore(this.storeName);
      if (options.index) {
        cursorTarget = cursorTarget.index(options.index);
      }
      var countRequest = cursorTarget.count(options.keyRange);
      countRequest.onsuccess = function (evt) {
        hasSuccess = true;
        result = evt.target.result;
      };
      countRequest.onError = onError;
    },

    /**************/
    /* key ranges */
    /**************/

    /**
     * Creates a key range using specified options. This key range can be
     * handed over to the count() and iterate() methods.
     *
     * Note: You must provide at least one or both of "lower" or "upper" value.
     *
     * @param {Object} options The options for the key range to create
     * @param {*} [options.lower] The lower bound
     * @param {Boolean} [options.excludeLower] Whether to exclude the lower
     *  bound passed in options.lower from the key range
     * @param {*} [options.upper] The upper bound
     * @param {Boolean} [options.excludeUpper] Whether to exclude the upper
     *  bound passed in options.upper from the key range
     * @return {Object} The IDBKeyRange representing the specified options
     */
    makeKeyRange: function(options){
      /*jshint onecase:true */
      var keyRange,
          hasLower = typeof options.lower != 'undefined',
          hasUpper = typeof options.upper != 'undefined';

      switch(true){
        case hasLower && hasUpper:
          keyRange = this.keyRange.bound(options.lower, options.upper, options.excludeLower, options.excludeUpper);
          break;
        case hasLower:
          keyRange = this.keyRange.lowerBound(options.lower, options.excludeLower);
          break;
        case hasUpper:
          keyRange = this.keyRange.upperBound(options.upper, options.excludeUpper);
          break;
        default:
          throw new Error('Cannot create KeyRange. Provide one or both of "lower" or "upper" value.');
      }

      return keyRange;

    }

  };

  /** helpers **/

  var noop = function () {
  };
  var empty = {};
  var mixin = function (target, source) {
    var name, s;
    for (name in source) {
      s = source[name];
      if (s !== empty[name] && s !== target[name]) {
        target[name] = s;
      }
    }
    return target;
  };

  IDBStore.version = IDBStore.prototype.version;

  return IDBStore;

}, this);

},{}],10:[function(require,module,exports){
var Buffer = require('buffer').Buffer;

module.exports = isBuffer;

function isBuffer (o) {
  return Buffer.isBuffer(o)
    || /\[object (.+Array|Array.+)\]/.test(Object.prototype.toString.call(o));
}

},{"buffer":113}],11:[function(require,module,exports){
/* Copyright (c) 2012-2013 LevelUP contributors
 * See list at <https://github.com/rvagg/node-levelup#contributing>
 * MIT +no-false-attribs License
 * <https://github.com/rvagg/node-levelup/blob/master/LICENSE>
 */

var util          = require('./util')
  , WriteError    = require('./errors').WriteError

  , getOptions    = util.getOptions
  , dispatchError = util.dispatchError

function Batch (levelup) {
  this._levelup = levelup
  this.batch = levelup.db.batch()
  this.ops = []
}

Batch.prototype.put = function (key_, value_, options) {
  options = getOptions(this._levelup, options)

  var key   = util.encodeKey(key_, options)
    , value = util.encodeValue(value_, options)

  try {
    this.batch.put(key, value)
  } catch (e) {
    throw new WriteError(e)
  }
  this.ops.push({ type : 'put', key : key, value : value })

  return this
}

Batch.prototype.del = function (key_, options) {
  options = getOptions(this._levelup, options)

  var key = util.encodeKey(key_, options)

  try {
    this.batch.del(key)
  } catch (err) {
    throw new WriteError(err)
  }
  this.ops.push({ type : 'del', key : key })

  return this
}

Batch.prototype.clear = function () {
  try {
    this.batch.clear()
  } catch (err) {
    throw new WriteError(err)
  }

  this.ops = []
  return this
}

Batch.prototype.write = function (callback) {
  var levelup = this._levelup
    , ops     = this.ops

  try {
    this.batch.write(function (err) {
      if (err)
        return dispatchError(levelup, new WriteError(err), callback)
      levelup.emit('batch', ops)
      if (callback)
        callback()
    })
  } catch (err) {
    throw new WriteError(err)
  }
}

module.exports = Batch

},{"./errors":12,"./util":15}],12:[function(require,module,exports){
/* Copyright (c) 2012-2013 LevelUP contributors
 * See list at <https://github.com/rvagg/node-levelup#contributing>
 * MIT +no-false-attribs License
 * <https://github.com/rvagg/node-levelup/blob/master/LICENSE>
 */

var createError   = require('errno').create
  , LevelUPError  = createError('LevelUPError')
  , NotFoundError = createError('NotFoundError', LevelUPError)

NotFoundError.prototype.notFound = true
NotFoundError.prototype.status   = 404

module.exports = {
    LevelUPError        : LevelUPError
  , InitializationError : createError('InitializationError', LevelUPError)
  , OpenError           : createError('OpenError', LevelUPError)
  , ReadError           : createError('ReadError', LevelUPError)
  , WriteError          : createError('WriteError', LevelUPError)
  , NotFoundError       : NotFoundError
  , EncodingError       : createError('EncodingError', LevelUPError)
}
},{"errno":49}],13:[function(require,module,exports){
var process=require("__browserify_process");/* Copyright (c) 2012-2013 LevelUP contributors
 * See list at <https://github.com/rvagg/node-levelup#contributing>
 * MIT +no-false-attribs License
 * <https://github.com/rvagg/node-levelup/blob/master/LICENSE>
 */

var EventEmitter   = require('events').EventEmitter
  , inherits       = require('util').inherits
  , extend         = require('xtend')
  , prr            = require('prr')
  , DeferredLevelDOWN = require('deferred-leveldown')

  , WriteError     = require('./errors').WriteError
  , ReadError      = require('./errors').ReadError
  , NotFoundError  = require('./errors').NotFoundError
  , OpenError      = require('./errors').OpenError
  , EncodingError  = require('./errors').EncodingError
  , InitializationError = require('./errors').InitializationError

  , ReadStream     = require('./read-stream')
  , WriteStream    = require('./write-stream')
  , util           = require('./util')
  , Batch          = require('./batch')

  , getOptions     = util.getOptions
  , defaultOptions = util.defaultOptions
  , getLevelDOWN   = util.getLevelDOWN
  , dispatchError  = util.dispatchError

function getCallback (options, callback) {
  return typeof options == 'function' ? options : callback
}

// Possible LevelUP#_status values:
//  - 'new'     - newly created, not opened or closed
//  - 'opening' - waiting for the database to be opened, post open()
//  - 'open'    - successfully opened the database, available for use
//  - 'closing' - waiting for the database to be closed, post close()
//  - 'closed'  - database has been successfully closed, should not be
//                 used except for another open() operation

function LevelUP (location, options, callback) {
  if (!(this instanceof LevelUP))
    return new LevelUP(location, options, callback)

  var error

  EventEmitter.call(this)
  this.setMaxListeners(Infinity)

  if (typeof location == 'function') {
    options = typeof options == 'object' ? options : {}
    options.db = location
    location = null
  } else if (typeof location == 'object' && typeof location.db == 'function') {
    options = location
    location = null
  }

  if (typeof options == 'function') {
    callback = options
    options  = {}
  }

  if ((!options || typeof options.db != 'function') && typeof location != 'string') {
    error = new InitializationError(
        'Must provide a location for the database')
    if (callback) {
      return process.nextTick(function () {
        callback(error)
      })
    }
    throw error
  }

  options      = getOptions(this, options)
  this.options = extend(defaultOptions, options)
  this._status = 'new'
  // set this.location as enumerable but not configurable or writable
  prr(this, 'location', location, 'e')

  this.open(callback)
}

inherits(LevelUP, EventEmitter)

LevelUP.prototype.open = function (callback) {
  var self = this
    , dbFactory
    , db

  if (this.isOpen()) {
    if (callback)
      process.nextTick(function () { callback(null, self) })
    return this
  }

  if (this._isOpening()) {
    return callback && this.once(
        'open'
      , function () { callback(null, self) }
    )
  }

  this.emit('opening')

  this._status = 'opening'
  this.db      = new DeferredLevelDOWN(this.location)
  dbFactory    = this.options.db || getLevelDOWN()
  db           = dbFactory(this.location)

  db.open(this.options, function (err) {
    if (err) {
      return dispatchError(self, new OpenError(err), callback)
    } else {
      self.db.setDb(db)
      self.db = db
      self._status = 'open'
      if (callback)
        callback(null, self)
      self.emit('open')
      self.emit('ready')
    }
  })
}

LevelUP.prototype.close = function (callback) {
  var self = this

  if (this.isOpen()) {
    this._status = 'closing'
    this.db.close(function () {
      self._status = 'closed'
      self.emit('closed')
      if (callback)
        callback.apply(null, arguments)
    })
    this.emit('closing')
    this.db = null
  } else if (this._status == 'closed' && callback) {
    return process.nextTick(callback)
  } else if (this._status == 'closing' && callback) {
    this.once('closed', callback)
  } else if (this._isOpening()) {
    this.once('open', function () {
      self.close(callback)
    })
  }
}

LevelUP.prototype.isOpen = function () {
  return this._status == 'open'
}

LevelUP.prototype._isOpening = function () {
  return this._status == 'opening'
}

LevelUP.prototype.isClosed = function () {
  return (/^clos/).test(this._status)
}

LevelUP.prototype.get = function (key_, options, callback) {
  var self = this
    , key

  callback = getCallback(options, callback)

  if (typeof callback != 'function') {
    return dispatchError(
        this
      , new ReadError('get() requires key and callback arguments')
    )
  }

  if (!this._isOpening() && !this.isOpen()) {
    return dispatchError(
        this
      , new ReadError('Database is not open')
      , callback
    )
  }

  options = util.getOptions(this, options)
  key = util.encodeKey(key_, options)

  options.asBuffer = util.isValueAsBuffer(options)

  this.db.get(key, options, function (err, value) {
    if (err) {
      if ((/notfound/i).test(err)) {
        err = new NotFoundError(
            'Key not found in database [' + key_ + ']', err)
      } else {
        err = new ReadError(err)
      }
      return dispatchError(self, err, callback)
    }
    if (callback) {
      try {
        value = util.decodeValue(value, options)
      } catch (e) {
        return callback(new EncodingError(e))
      }
      callback(null, value)
    }
  })
}

LevelUP.prototype.put = function (key_, value_, options, callback) {
  var self = this
    , key
    , value

  callback = getCallback(options, callback)

  if (key_ === null || key_ === undefined
        || value_ === null || value_ === undefined) {
    return dispatchError(
        this
       , new WriteError('put() requires key and value arguments')
       , callback
    )
  }

  if (!this._isOpening() && !this.isOpen()) {
    return dispatchError(
        this
      , new WriteError('Database is not open')
      , callback
    )
  }

  options = getOptions(this, options)
  key     = util.encodeKey(key_, options)
  value   = util.encodeValue(value_, options)

  this.db.put(key, value, options, function (err) {
    if (err) {
      return dispatchError(self, new WriteError(err), callback)
    } else {
      self.emit('put', key_, value_)
      if (callback)
        callback()
    }
  })
}

LevelUP.prototype.del = function (key_, options, callback) {
  var self = this
    , key

  callback = getCallback(options, callback)

  if (key_ === null || key_ === undefined) {
    return dispatchError(
        this
      , new WriteError('del() requires a key argument')
      , callback
    )
  }

  if (!this._isOpening() && !this.isOpen()) {
    return dispatchError(
        this
      , new WriteError('Database is not open')
      , callback
    )
  }

  options = getOptions(this, options)
  key     = util.encodeKey(key_, options)

  this.db.del(key, options, function (err) {
    if (err) {
      return dispatchError(self, new WriteError(err), callback)
    } else {
      self.emit('del', key_)
      if (callback)
        callback()
    }
  })
}

LevelUP.prototype.batch = function (arr_, options, callback) {
  var self = this
    , keyEnc
    , valueEnc
    , arr

  if (!arguments.length)
    return new Batch(this)

  callback = getCallback(options, callback)

  if (!Array.isArray(arr_)) {
    return dispatchError(
        this
      , new WriteError('batch() requires an array argument')
      , callback
    )
  }

  if (!this._isOpening() && !this.isOpen()) {
    return dispatchError(
        this
      , new WriteError('Database is not open')
      , callback
    )
  }

  options  = getOptions(this, options)
  keyEnc   = options.keyEncoding
  valueEnc = options.valueEncoding

  arr = arr_.map(function (e) {
    if (e.type === undefined || e.key === undefined)
      return {}

    // inherit encoding
    var kEnc = e.keyEncoding || keyEnc
      , vEnc = e.valueEncoding || e.encoding || valueEnc
      , o

    // If we're not dealing with plain utf8 strings or plain
    // Buffers then we have to do some work on the array to
    // encode the keys and/or values. This includes JSON types.

    if (kEnc != 'utf8' && kEnc != 'binary'
        || vEnc != 'utf8' && vEnc != 'binary') {
      o = {
          type: e.type
        , key: util.encodeKey(e.key, options, e)
      }

      if (e.value !== undefined)
        o.value = util.encodeValue(e.value, options, e)

      return o
    } else {
      return e
    }
  })

  this.db.batch(arr, options, function (err) {
    if (err) {
      return dispatchError(self, new WriteError(err), callback)
    } else {
      self.emit('batch', arr_)
      if (callback)
        callback()
    }
  })
}

// DEPRECATED: prefer accessing LevelDOWN for this: db.db.approximateSize()
LevelUP.prototype.approximateSize = function (start_, end_, callback) {
  var self = this
    , start
    , end

  if (start_ === null || start_ === undefined
        || end_ === null || end_ === undefined
        || typeof callback != 'function') {
    return dispatchError(
        this
      , new ReadError('approximateSize() requires start, end and callback arguments')
      , callback
    )
  }

  start = util.encodeKey(start_, this.options)
  end   = util.encodeKey(end_, this.options)

  if (!this._isOpening() && !this.isOpen()) {
    return dispatchError(
        this
      , new WriteError('Database is not open')
      , callback
    )
  }

  this.db.approximateSize(start, end, function (err, size) {
    if (err) {
      return dispatchError(self, new OpenError(err), callback)
    } else if (callback) {
      callback(null, size)
    }
  })
}

LevelUP.prototype.readStream =
LevelUP.prototype.createReadStream = function (options) {
  var self = this
  options = extend(this.options, options)
  return new ReadStream(
      options
    , this
    , function (options) {
        return self.db.iterator(options)
      }
  )
}

LevelUP.prototype.keyStream =
LevelUP.prototype.createKeyStream = function (options) {
  return this.createReadStream(extend(options, { keys: true, values: false }))
}

LevelUP.prototype.valueStream =
LevelUP.prototype.createValueStream = function (options) {
  return this.createReadStream(extend(options, { keys: false, values: true }))
}

LevelUP.prototype.writeStream =
LevelUP.prototype.createWriteStream = function (options) {
  return new WriteStream(extend(options), this)
}

LevelUP.prototype.toString = function () {
  return 'LevelUP'
}

function utilStatic (name) {
  return function (location, callback) {
    getLevelDOWN()[name](location, callback || function () {})
  }
}

module.exports         = LevelUP
module.exports.copy    = util.copy
// DEPRECATED: prefer accessing LevelDOWN for this: require('leveldown').destroy()
module.exports.destroy = utilStatic('destroy')
// DEPRECATED: prefer accessing LevelDOWN for this: require('leveldown').repair()
module.exports.repair  = utilStatic('repair')

},{"./batch":11,"./errors":12,"./read-stream":14,"./util":15,"./write-stream":16,"__browserify_process":112,"deferred-leveldown":31,"events":105,"prr":50,"util":130,"xtend":58}],14:[function(require,module,exports){
/* Copyright (c) 2012-2013 LevelUP contributors
 * See list at <https://github.com/rvagg/node-levelup#contributing>
 * MIT +no-false-attribs License <https://github.com/rvagg/node-levelup/blob/master/LICENSE>
 */

// NOTE: we are fixed to readable-stream@1.0.x for now
// for pure Streams2 across Node versions
var Readable      = require('readable-stream').Readable
  , inherits      = require('util').inherits
  , extend        = require('xtend')
  , EncodingError = require('./errors').EncodingError
  , util          = require('./util')

  , defaultOptions = { keys: true, values: true }

  , makeKeyValueData = function (key, value) {
      return {
          key: util.decodeKey(key, this._options)
        , value: util.decodeValue(value, this._options)
      }
    }
  , makeKeyData = function (key) {
      return util.decodeKey(key, this._options)
    }
  , makeValueData = function (_, value) {
      return util.decodeValue(value, this._options)
    }
  , makeNoData = function () { return null }

function ReadStream (options, db, iteratorFactory) {
  if (!(this instanceof ReadStream))
    return new ReadStream(options, db, iteratorFactory)

  Readable.call(this, { objectMode: true, highWaterMark: options.highWaterMark })

  // purely to keep `db` around until we're done so it's not GCed if the user doesn't keep a ref
  this._db = db

  options = this._options = extend(defaultOptions, options)

  this._keyEncoding   = options.keyEncoding   || options.encoding
  this._valueEncoding = options.valueEncoding || options.encoding

  if (typeof this._options.start != 'undefined')
    this._options.start = util.encodeKey(this._options.start, this._options)
  if (typeof this._options.end != 'undefined')
    this._options.end = util.encodeKey(this._options.end, this._options)
  if (typeof this._options.limit != 'number')
    this._options.limit = -1

  this._options.keyAsBuffer   = util.isKeyAsBuffer(this._options)

  this._options.valueAsBuffer = util.isValueAsBuffer(this._options)

  this._makeData = this._options.keys && this._options.values
    ? makeKeyValueData : this._options.keys
      ? makeKeyData : this._options.values
        ? makeValueData : makeNoData

  var self = this
  if (!this._db.isOpen()) {
    this._db.once('ready', function () {
      self._iterator = iteratorFactory(self._options)
    })
  } else
    this._iterator = iteratorFactory(this._options)
}

inherits(ReadStream, Readable)

ReadStream.prototype._read = function read () {
  var self = this
  if (!self._db.isOpen()) {
    return self._db.once('ready', function () { read.call(self) })
  }
  if (self._destroyed)
    return
 
  self._iterator.next(function(err, key, value) {
    if (err || (key === undefined && value === undefined)) {
      if (!err && !self._destroyed)
        self.push(null)
      return self._cleanup(err)
    }

    try {
      value = self._makeData(key, value)
    } catch (e) {
      return self._cleanup(new EncodingError(e))
    }
    if (!self._destroyed)
      self.push(value)
  })
}

ReadStream.prototype._cleanup = function (err) {
  if (this._destroyed)
    return

  this._destroyed = true

  var self = this
  if (err)
    self.emit('error', err)

  self._iterator.end(function () {
    self._iterator = null
    self.emit('close')
  })
}

ReadStream.prototype.destroy = function () {
  this._cleanup()
}

ReadStream.prototype.toString = function () {
  return 'LevelUP.ReadStream'
}

module.exports = ReadStream

},{"./errors":12,"./util":15,"readable-stream":56,"util":130,"xtend":58}],15:[function(require,module,exports){
/* Copyright (c) 2012-2013 LevelUP contributors
 * See list at <https://github.com/rvagg/node-levelup#contributing>
 * MIT +no-false-attribs License
 * <https://github.com/rvagg/node-levelup/blob/master/LICENSE>
 */

var extend        = require('xtend')
  , LevelUPError  = require('./errors').LevelUPError
  , bops          = require('bops')

  , encodingNames = [
        'hex'
      , 'utf8'
      , 'utf-8'
      , 'ascii'
      , 'binary'
      , 'base64'
      , 'ucs2'
      , 'ucs-2'
      , 'utf16le'
      , 'utf-16le'
    ]

  , defaultOptions = {
        createIfMissing : true
      , errorIfExists   : false
      , keyEncoding     : 'utf8'
      , valueEncoding   : 'utf8'
      , compression     : true
    }

  , leveldown

  , encodings = (function () {
      function isBinary (data) {
        return data === undefined || data === null || bops.is(data)
      }

      var encodings = {}
      encodings.utf8 = encodings['utf-8'] = {
          encode : function (data) {
            return isBinary(data) ? data : String(data)
          }
        , decode : function (data) { return data }
        , buffer : false
        , type   : 'utf8'
      }
      encodings.json = {
          encode : JSON.stringify
        , decode : JSON.parse
        , buffer : false
        , type   : 'json'
      }
      encodingNames.forEach(function (type) {
        if (encodings[type])
          return
        encodings[type] = {
            encode : function (data) {
              return isBinary(data) ? data : bops.from(data, type)
            }
          , decode : function (buffer) {
              return bops.from(buffer, type)
            }
          , buffer : true
          , type   : type // useful for debugging purposes
        }
      })
      return encodings
    })()

  , encodingOpts = (function () {
      var eo = {}
      encodingNames.forEach(function (e) {
        eo[e] = { valueEncoding : e }
      })
      return eo
    }())

function copy (srcdb, dstdb, callback) {
  srcdb.readStream()
    .pipe(dstdb.writeStream())
    .on('close', callback ? callback : function () {})
    .on('error', callback ? callback : function (err) { throw err })
}

function getOptions (levelup, options) {
  var s = typeof options == 'string' // just an encoding
  if (!s && options && options.encoding && !options.valueEncoding)
    options.valueEncoding = options.encoding
  return extend(
      (levelup && levelup.options) || {}
    , s ? encodingOpts[options] || encodingOpts[defaultOptions.valueEncoding]
        : options
  )
}

function getLevelDOWN () {
  if (leveldown)
    return leveldown

  var requiredVersion       = require('../package.json').devDependencies.leveldown
    , missingLevelDOWNError = 'Could not locate LevelDOWN, try `npm install leveldown`'
    , leveldownVersion

  try {
    leveldownVersion = require('leveldown/package').version
  } catch (e) {
    throw new LevelUPError(missingLevelDOWNError)
  }

  if (!require('semver').satisfies(leveldownVersion, requiredVersion)) {
    throw new LevelUPError(
        'Installed version of LevelDOWN ('
      + leveldownVersion
      + ') does not match required version ('
      + requiredVersion
      + ')'
    )
  }

  try {
    return leveldown = require('leveldown')
  } catch (e) {
    throw new LevelUPError(missingLevelDOWNError)
  }
}

function dispatchError (levelup, error, callback) {
  return typeof callback == 'function'
    ? callback(error)
    : levelup.emit('error', error)
}

function getKeyEncoder (options, op) {
  var type = ((op && op.keyEncoding) || options.keyEncoding) || 'utf8'
  return encodings[type] || type
}

function getValueEncoder (options, op) {
  var type = (((op && (op.valueEncoding || op.encoding))
      || options.valueEncoding || options.encoding)) || 'utf8'
  return encodings[type] || type
}

function encodeKey (key, options, op) {
  return getKeyEncoder(options, op).encode(key)
}

function encodeValue (value, options, op) {
  return getValueEncoder(options, op).encode(value)
}

function decodeKey (key, options) {
  return getKeyEncoder(options).decode(key)
}

function decodeValue (value, options) {
  return getValueEncoder(options).decode(value)
}

function isValueAsBuffer (options, op) {
  return getValueEncoder(options, op).buffer
}

function isKeyAsBuffer (options, op) {
  return getKeyEncoder(options, op).buffer
}

module.exports = {
    defaultOptions  : defaultOptions
  , copy            : copy
  , getOptions      : getOptions
  , getLevelDOWN    : getLevelDOWN
  , dispatchError   : dispatchError
  , encodeKey       : encodeKey
  , encodeValue     : encodeValue
  , isValueAsBuffer : isValueAsBuffer
  , isKeyAsBuffer   : isKeyAsBuffer
  , decodeValue     : decodeValue
  , decodeKey       : decodeKey
}

},{"../package.json":63,"./errors":12,"bops":17,"leveldown":104,"leveldown/package":104,"semver":104,"xtend":58}],16:[function(require,module,exports){
var process=require("__browserify_process"),global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};/* Copyright (c) 2012-2013 LevelUP contributors
 * See list at <https://github.com/rvagg/node-levelup#contributing>
 * MIT +no-false-attribs License
 * <https://github.com/rvagg/node-levelup/blob/master/LICENSE>
 */

var Stream       = require('stream').Stream
  , inherits     = require('util').inherits
  , extend       = require('xtend')
  , concatStream = require('concat-stream')

  , setImmediate = global.setImmediate || process.nextTick

  , getOptions   = require('./util').getOptions

  , defaultOptions = { type: 'put' }

function WriteStream (options, db) {
  if (!(this instanceof WriteStream))
    return new WriteStream(options, db)

  Stream.call(this)
  this._options = extend(defaultOptions, getOptions(db, options))
  this._db      = db
  this._buffer  = []
  this._status  = 'init'
  this._end     = false
  this.writable = true
  this.readable = false

  var self = this
    , ready = function () {
        if (!self.writable)
          return
        self._status = 'ready'
        self.emit('ready')
        self._process()
      }

  if (db.isOpen())
    setImmediate(ready)
  else
    db.once('ready', ready)
}

inherits(WriteStream, Stream)

WriteStream.prototype.write = function (data) {
  if (!this.writable)
    return false
  this._buffer.push(data)
  if (this._status != 'init')
    this._processDelayed()
  if (this._options.maxBufferLength &&
      this._buffer.length > this._options.maxBufferLength) {
    this._writeBlock = true
    return false
  }
  return true
}

WriteStream.prototype.end = function (data) {
  var self = this
  if (data)
    this.write(data)
  setImmediate(function () {
    self._end = true
    self._process()
  })
}

WriteStream.prototype.destroy = function () {
  this.writable = false
  this.end()
}

WriteStream.prototype.destroySoon = function () {
  this.end()
}

WriteStream.prototype.add = function (entry) {
  if (!entry.props)
    return
  if (entry.props.Directory)
    entry.pipe(this._db.writeStream(this._options))
  else if (entry.props.File || entry.File || entry.type == 'File')
    this._write(entry)
  return true
}

WriteStream.prototype._processDelayed = function () {
  var self = this
  setImmediate(function () {
    self._process()
  })
}

WriteStream.prototype._process = function () {
  var buffer
    , self = this

    , cb = function (err) {
        if (!self.writable)
          return
        if (self._status != 'closed')
          self._status = 'ready'
        if (err) {
          self.writable = false
          return self.emit('error', err)
        }
        self._process()
      }

  if (self._status != 'ready' && self.writable) {
    if (self._buffer.length && self._status != 'closed')
      self._processDelayed()
    return
  }

  if (self._buffer.length && self.writable) {
    self._status = 'writing'
    buffer       = self._buffer
    self._buffer = []

    self._db.batch(buffer.map(function (d) {
      return {
          type          : d.type || self._options.type
        , key           : d.key
        , value         : d.value
        , keyEncoding   : d.keyEncoding || self._options.keyEncoding
        , valueEncoding : d.valueEncoding
            || d.encoding
            || self._options.valueEncoding
      }
    }), cb)

    if (self._writeBlock) {
      self._writeBlock = false
      self.emit('drain')
    }

    // don't allow close until callback has returned
    return
  }

  if (self._end && self._status != 'closed') {
    self._status  = 'closed'
    self.writable = false
    self.emit('close')
  }
}

WriteStream.prototype._write = function (entry) {
  var key = entry.path || entry.props.path
    , self = this

  if (!key)
    return

  entry.pipe(concatStream(function (err, data) {
    if (err) {
      self.writable = false
      return self.emit('error', err)
    }

    if (self._options.fstreamRoot &&
        key.indexOf(self._options.fstreamRoot) > -1)
      key = key.substr(self._options.fstreamRoot.length + 1)

    self.write({ key: key, value: data })
  }))
}

WriteStream.prototype.toString = function () {
  return 'LevelUP.WriteStream'
}

module.exports = WriteStream

},{"./util":15,"__browserify_process":112,"concat-stream":30,"stream":121,"util":130,"xtend":58}],17:[function(require,module,exports){
var proto = {}
module.exports = proto

proto.from = require('./from.js')
proto.to = require('./to.js')
proto.is = require('./is.js')
proto.subarray = require('./subarray.js')
proto.join = require('./join.js')
proto.copy = require('./copy.js')
proto.create = require('./create.js')

mix(require('./read.js'), proto)
mix(require('./write.js'), proto)

function mix(from, into) {
  for(var key in from) {
    into[key] = from[key]
  }
}

},{"./copy.js":20,"./create.js":21,"./from.js":22,"./is.js":23,"./join.js":24,"./read.js":26,"./subarray.js":27,"./to.js":28,"./write.js":29}],18:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

},{}],19:[function(require,module,exports){
module.exports = to_utf8

var out = []
  , col = []
  , fcc = String.fromCharCode
  , mask = [0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01]
  , unmask = [
      0x00
    , 0x01
    , 0x02 | 0x01
    , 0x04 | 0x02 | 0x01
    , 0x08 | 0x04 | 0x02 | 0x01
    , 0x10 | 0x08 | 0x04 | 0x02 | 0x01
    , 0x20 | 0x10 | 0x08 | 0x04 | 0x02 | 0x01
    , 0x40 | 0x20 | 0x10 | 0x08 | 0x04 | 0x02 | 0x01
  ]

function to_utf8(bytes, start, end) {
  start = start === undefined ? 0 : start
  end = end === undefined ? bytes.length : end

  var idx = 0
    , hi = 0x80
    , collecting = 0
    , pos
    , by

  col.length =
  out.length = 0

  while(idx < bytes.length) {
    by = bytes[idx]
    if(!collecting && by & hi) {
      pos = find_pad_position(by)
      collecting += pos
      if(pos < 8) {
        col[col.length] = by & unmask[6 - pos]
      }
    } else if(collecting) {
      col[col.length] = by & unmask[6]
      --collecting
      if(!collecting && col.length) {
        out[out.length] = fcc(reduced(col, pos))
        col.length = 0
      }
    } else { 
      out[out.length] = fcc(by)
    }
    ++idx
  }
  if(col.length && !collecting) {
    out[out.length] = fcc(reduced(col, pos))
    col.length = 0
  }
  return out.join('')
}

function find_pad_position(byt) {
  for(var i = 0; i < 7; ++i) {
    if(!(byt & mask[i])) {
      break
    }
  }
  return i
}

function reduced(list) {
  var out = 0
  for(var i = 0, len = list.length; i < len; ++i) {
    out |= list[i] << ((len - i - 1) * 6)
  }
  return out
}

},{}],20:[function(require,module,exports){
module.exports = copy

var slice = [].slice

function copy(source, target, target_start, source_start, source_end) {
  target_start = arguments.length < 3 ? 0 : target_start
  source_start = arguments.length < 4 ? 0 : source_start
  source_end = arguments.length < 5 ? source.length : source_end

  if(source_end === source_start) {
    return
  }

  if(target.length === 0 || source.length === 0) {
    return
  }

  if(source_end > source.length) {
    source_end = source.length
  }

  if(target.length - target_start < source_end - source_start) {
    source_end = target.length - target_start + source_start
  }

  if(source.buffer !== target.buffer) {
    return fast_copy(source, target, target_start, source_start, source_end)
  }
  return slow_copy(source, target, target_start, source_start, source_end)
}

function fast_copy(source, target, target_start, source_start, source_end) {
  var len = (source_end - source_start) + target_start

  for(var i = target_start, j = source_start;
      i < len;
      ++i,
      ++j) {
    target[i] = source[j]
  }
}

function slow_copy(from, to, j, i, jend) {
  // the buffers could overlap.
  var iend = jend + i
    , tmp = new Uint8Array(slice.call(from, i, iend))
    , x = 0

  for(; i < iend; ++i, ++x) {
    to[j++] = tmp[x]
  }
}

},{}],21:[function(require,module,exports){
module.exports = function(size) {
  return new Uint8Array(size)
}

},{}],22:[function(require,module,exports){
module.exports = from

var base64 = require('base64-js')

var decoders = {
    hex: from_hex
  , utf8: from_utf
  , base64: from_base64
}

function from(source, encoding) {
  if(Array.isArray(source)) {
    return new Uint8Array(source)
  }

  return decoders[encoding || 'utf8'](source)
}

function from_hex(str) {
  var size = str.length / 2
    , buf = new Uint8Array(size)
    , character = ''

  for(var i = 0, len = str.length; i < len; ++i) {
    character += str.charAt(i)

    if(i > 0 && (i % 2) === 1) {
      buf[i>>>1] = parseInt(character, 16)
      character = '' 
    }
  }

  return buf 
}

function from_utf(str) {
  var arr = []
    , code

  for(var i = 0, len = str.length; i < len; ++i) {
    code = fixed_cca(str, i)

    if(code === false) {
      continue
    }

    if(code < 0x80) {
      arr[arr.length] = code

      continue
    }

    codepoint_to_bytes(arr, code)
  }

  return new Uint8Array(arr)
}

function codepoint_to_bytes(arr, code) {
  // find MSB, use that to determine byte count
  var copy_code = code
    , bit_count = 0
    , byte_count
    , prefix
    , _byte
    , pos

  do {
    ++bit_count
  } while(copy_code >>>= 1)

  byte_count = Math.ceil((bit_count - 1) / 5) | 0
  prefix = [0, 0, 0xc0, 0xe0, 0xf0, 0xf8, 0xfc][byte_count]
  pos = [0, 0, 3, 4, 5, 6, 7][byte_count]

  _byte |= prefix

  bit_count = (7 - pos) + 6 * (byte_count - 1)

  while(bit_count) {
    _byte |= +!!(code & (1 << bit_count)) << (7 - pos)
    ++pos

    if(pos % 8 === 0) {
      arr[arr.length] = _byte
      _byte = 0x80
      pos = 2
    }

    --bit_count
  }

  if(pos) {
    _byte |= +!!(code & 1) << (7 - pos)
    arr[arr.length] = _byte
  }
}

function pad(str) {
  while(str.length < 8) {
    str = '0' + str
  }

  return str
}

function fixed_cca(str, idx) {
  idx = idx || 0

  var code = str.charCodeAt(idx)
    , lo
    , hi

  if(0xD800 <= code && code <= 0xDBFF) {
    lo = str.charCodeAt(idx + 1)
    hi = code

    if(isNaN(lo)) {
      throw new Error('High surrogate not followed by low surrogate')
    }

    return ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000
  }

  if(0xDC00 <= code && code <= 0xDFFF) {
    return false
  }

  return code
}

function from_base64(str) {
  return new Uint8Array(base64.toByteArray(str)) 
}

},{"base64-js":18}],23:[function(require,module,exports){

module.exports = function(buffer) {
  return buffer instanceof Uint8Array;
}

},{}],24:[function(require,module,exports){
module.exports = join

function join(targets, hint) {
  if(!targets.length) {
    return new Uint8Array(0)
  }

  var len = hint !== undefined ? hint : get_length(targets)
    , out = new Uint8Array(len)
    , cur = targets[0]
    , curlen = cur.length
    , curidx = 0
    , curoff = 0
    , i = 0

  while(i < len) {
    if(curoff === curlen) {
      curoff = 0
      ++curidx
      cur = targets[curidx]
      curlen = cur && cur.length
      continue
    }
    out[i++] = cur[curoff++] 
  }

  return out
}

function get_length(targets) {
  var size = 0
  for(var i = 0, len = targets.length; i < len; ++i) {
    size += targets[i].byteLength
  }
  return size
}

},{}],25:[function(require,module,exports){
var proto
  , map

module.exports = proto = {}

map = typeof WeakMap === 'undefined' ? null : new WeakMap

proto.get = !map ? no_weakmap_get : get

function no_weakmap_get(target) {
  return new DataView(target.buffer, 0)
}

function get(target) {
  var out = map.get(target.buffer)
  if(!out) {
    map.set(target.buffer, out = new DataView(target.buffer, 0))
  }
  return out
}

},{}],26:[function(require,module,exports){
module.exports = {
    readUInt8:      read_uint8
  , readInt8:       read_int8
  , readUInt16LE:   read_uint16_le
  , readUInt32LE:   read_uint32_le
  , readInt16LE:    read_int16_le
  , readInt32LE:    read_int32_le
  , readFloatLE:    read_float_le
  , readDoubleLE:   read_double_le
  , readUInt16BE:   read_uint16_be
  , readUInt32BE:   read_uint32_be
  , readInt16BE:    read_int16_be
  , readInt32BE:    read_int32_be
  , readFloatBE:    read_float_be
  , readDoubleBE:   read_double_be
}

var map = require('./mapped.js')

function read_uint8(target, at) {
  return target[at]
}

function read_int8(target, at) {
  var v = target[at];
  return v < 0x80 ? v : v - 0x100
}

function read_uint16_le(target, at) {
  var dv = map.get(target);
  return dv.getUint16(at + target.byteOffset, true)
}

function read_uint32_le(target, at) {
  var dv = map.get(target);
  return dv.getUint32(at + target.byteOffset, true)
}

function read_int16_le(target, at) {
  var dv = map.get(target);
  return dv.getInt16(at + target.byteOffset, true)
}

function read_int32_le(target, at) {
  var dv = map.get(target);
  return dv.getInt32(at + target.byteOffset, true)
}

function read_float_le(target, at) {
  var dv = map.get(target);
  return dv.getFloat32(at + target.byteOffset, true)
}

function read_double_le(target, at) {
  var dv = map.get(target);
  return dv.getFloat64(at + target.byteOffset, true)
}

function read_uint16_be(target, at) {
  var dv = map.get(target);
  return dv.getUint16(at + target.byteOffset, false)
}

function read_uint32_be(target, at) {
  var dv = map.get(target);
  return dv.getUint32(at + target.byteOffset, false)
}

function read_int16_be(target, at) {
  var dv = map.get(target);
  return dv.getInt16(at + target.byteOffset, false)
}

function read_int32_be(target, at) {
  var dv = map.get(target);
  return dv.getInt32(at + target.byteOffset, false)
}

function read_float_be(target, at) {
  var dv = map.get(target);
  return dv.getFloat32(at + target.byteOffset, false)
}

function read_double_be(target, at) {
  var dv = map.get(target);
  return dv.getFloat64(at + target.byteOffset, false)
}

},{"./mapped.js":25}],27:[function(require,module,exports){
module.exports = subarray

function subarray(buf, from, to) {
  return buf.subarray(from || 0, to || buf.length)
}

},{}],28:[function(require,module,exports){
module.exports = to

var base64 = require('base64-js')
  , toutf8 = require('to-utf8')

var encoders = {
    hex: to_hex
  , utf8: to_utf
  , base64: to_base64
}

function to(buf, encoding) {
  return encoders[encoding || 'utf8'](buf)
}

function to_hex(buf) {
  var str = ''
    , byt

  for(var i = 0, len = buf.length; i < len; ++i) {
    byt = buf[i]
    str += ((byt & 0xF0) >>> 4).toString(16)
    str += (byt & 0x0F).toString(16)
  }

  return str
}

function to_utf(buf) {
  return toutf8(buf)
}

function to_base64(buf) {
  return base64.fromByteArray(buf)
}


},{"base64-js":18,"to-utf8":19}],29:[function(require,module,exports){
module.exports = {
    writeUInt8:      write_uint8
  , writeInt8:       write_int8
  , writeUInt16LE:   write_uint16_le
  , writeUInt32LE:   write_uint32_le
  , writeInt16LE:    write_int16_le
  , writeInt32LE:    write_int32_le
  , writeFloatLE:    write_float_le
  , writeDoubleLE:   write_double_le
  , writeUInt16BE:   write_uint16_be
  , writeUInt32BE:   write_uint32_be
  , writeInt16BE:    write_int16_be
  , writeInt32BE:    write_int32_be
  , writeFloatBE:    write_float_be
  , writeDoubleBE:   write_double_be
}

var map = require('./mapped.js')

function write_uint8(target, value, at) {
  return target[at] = value
}

function write_int8(target, value, at) {
  return target[at] = value < 0 ? value + 0x100 : value
}

function write_uint16_le(target, value, at) {
  var dv = map.get(target);
  return dv.setUint16(at + target.byteOffset, value, true)
}

function write_uint32_le(target, value, at) {
  var dv = map.get(target);
  return dv.setUint32(at + target.byteOffset, value, true)
}

function write_int16_le(target, value, at) {
  var dv = map.get(target);
  return dv.setInt16(at + target.byteOffset, value, true)
}

function write_int32_le(target, value, at) {
  var dv = map.get(target);
  return dv.setInt32(at + target.byteOffset, value, true)
}

function write_float_le(target, value, at) {
  var dv = map.get(target);
  return dv.setFloat32(at + target.byteOffset, value, true)
}

function write_double_le(target, value, at) {
  var dv = map.get(target);
  return dv.setFloat64(at + target.byteOffset, value, true)
}

function write_uint16_be(target, value, at) {
  var dv = map.get(target);
  return dv.setUint16(at + target.byteOffset, value, false)
}

function write_uint32_be(target, value, at) {
  var dv = map.get(target);
  return dv.setUint32(at + target.byteOffset, value, false)
}

function write_int16_be(target, value, at) {
  var dv = map.get(target);
  return dv.setInt16(at + target.byteOffset, value, false)
}

function write_int32_be(target, value, at) {
  var dv = map.get(target);
  return dv.setInt32(at + target.byteOffset, value, false)
}

function write_float_be(target, value, at) {
  var dv = map.get(target);
  return dv.setFloat32(at + target.byteOffset, value, false)
}

function write_double_be(target, value, at) {
  var dv = map.get(target);
  return dv.setFloat64(at + target.byteOffset, value, false)
}

},{"./mapped.js":25}],30:[function(require,module,exports){
var Buffer=require("__browserify_Buffer");var stream = require('stream')
var util = require('util')

function ConcatStream(cb) {
  stream.Stream.call(this)
  this.writable = true
  if (cb) this.cb = cb
  this.body = []
  this.on('error', function(err) {
    if (this.cb) this.cb(err)
  })
}

util.inherits(ConcatStream, stream.Stream)

ConcatStream.prototype.write = function(chunk) {
  this.body.push(chunk)
}

ConcatStream.prototype.destroy = function() {}

ConcatStream.prototype.arrayConcat = function(arrs) {
  if (arrs.length === 0) return []
  if (arrs.length === 1) return arrs[0]
  return arrs.reduce(function (a, b) { return a.concat(b) })
}

ConcatStream.prototype.isArray = function(arr) {
  return Array.isArray(arr)
}

ConcatStream.prototype.getBody = function () {
  if (this.body.length === 0) return
  if (typeof(this.body[0]) === "string") return this.body.join('')
  if (this.isArray(this.body[0])) return this.arrayConcat(this.body)
  if (typeof(Buffer) !== "undefined" && Buffer.isBuffer(this.body[0])) {
    return Buffer.concat(this.body)
  }
  return this.body
}

ConcatStream.prototype.end = function() {
  if (this.cb) this.cb(false, this.getBody())
}

module.exports = function(cb) {
  return new ConcatStream(cb)
}

module.exports.ConcatStream = ConcatStream

},{"__browserify_Buffer":111,"stream":121,"util":130}],31:[function(require,module,exports){
var process=require("__browserify_process");var util              = require('util')
  , bops              = require('bops')
  , AbstractLevelDOWN = require('abstract-leveldown').AbstractLevelDOWN

function DeferredLevelDOWN (location) {
  AbstractLevelDOWN.call(this, typeof location == 'string' ? location : '') // optional location, who cares?
  this._db         = undefined
  this._operations = []
}

util.inherits(DeferredLevelDOWN, AbstractLevelDOWN)

// called by LevelUP when we have a real DB to take its place
DeferredLevelDOWN.prototype.setDb = function (db) {
  this._db = db
  this._operations.forEach(function (op) {
    db[op.method].apply(db, op.args)
  })
}

DeferredLevelDOWN.prototype._open = function (options, callback) {
  return process.nextTick(callback)
}

// queue a new deferred operation
DeferredLevelDOWN.prototype._operation = function (method, args) {
  if (this._db)
    return this._db[method].apply(this._db, args)
  this._operations.push({ method: method, args: args })
}

// deferrables
'put get del batch approximateSize'.split(' ').forEach(function (m) {
  DeferredLevelDOWN.prototype['_' + m] = function () {
    this._operation(m, arguments)
  }
})

DeferredLevelDOWN.prototype._isBuffer = function (obj) {
  return bops.is(obj)
}

// don't need to implement this as LevelUP's ReadStream checks for 'ready' state
DeferredLevelDOWN.prototype._iterator = function () {
  throw new TypeError('not implemented')
}

module.exports = DeferredLevelDOWN
},{"__browserify_process":112,"abstract-leveldown":34,"bops":35,"util":130}],32:[function(require,module,exports){
var process=require("__browserify_process");/* Copyright (c) 2013 Rod Vagg, MIT License */

function AbstractChainedBatch (db) {
  this._db         = db
  this._operations = []
  this._written    = false
}

AbstractChainedBatch.prototype._checkWritten = function () {
  if (this._written)
    throw new Error('write() already called on this batch')
}

AbstractChainedBatch.prototype.put = function (key, value) {
  this._checkWritten()

  var err = this._db._checkKeyValue(key, 'key', this._db._isBuffer)
  if (err) throw err
  err = this._db._checkKeyValue(value, 'value', this._db._isBuffer)
  if (err) throw err

  if (!this._db._isBuffer(key)) key = String(key)
  if (!this._db._isBuffer(value)) value = String(value)

  if (typeof this._put == 'function' )
    this._put(key, value)
  else
    this._operations.push({ type: 'put', key: key, value: value })

  return this
}

AbstractChainedBatch.prototype.del = function (key) {
  this._checkWritten()

  var err = this._db._checkKeyValue(key, 'key', this._db._isBuffer)
  if (err) throw err

  if (!this._db._isBuffer(key)) key = String(key)

  if (typeof this._del == 'function' )
    this._del(key)
  else
    this._operations.push({ type: 'del', key: key })

  return this
}

AbstractChainedBatch.prototype.clear = function () {
  this._checkWritten()

  this._operations = []

  if (typeof this._clear == 'function' )
    this._clear()

  return this
}

AbstractChainedBatch.prototype.write = function (options, callback) {
  this._checkWritten()

  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('write() requires a callback argument')
  if (typeof options != 'object')
    options = {}

  this._written = true

  if (typeof this._write == 'function' )
    return this._write(callback)

  if (typeof this._db._batch == 'function')
    return this._db._batch(this._operations, options, callback)

  process.nextTick(callback)
}

module.exports = AbstractChainedBatch
},{"__browserify_process":112}],33:[function(require,module,exports){
module.exports=require(7)
},{"__browserify_process":112}],34:[function(require,module,exports){
var process=require("__browserify_process"),Buffer=require("__browserify_Buffer");/* Copyright (c) 2013 Rod Vagg, MIT License */

var AbstractIterator     = require('./abstract-iterator')
  , AbstractChainedBatch = require('./abstract-chained-batch')

function AbstractLevelDOWN (location) {
  if (!arguments.length || location === undefined)
    throw new Error('constructor requires at least a location argument')

  if (typeof location != 'string')
    throw new Error('constructor requires a location string argument')

  this.location = location
}

AbstractLevelDOWN.prototype.open = function (options, callback) {
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('open() requires a callback argument')
  if (typeof options != 'object')
    options = {}

  if (typeof this._open == 'function')
    return this._open(options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.close = function (callback) {
  if (typeof callback != 'function')
    throw new Error('close() requires a callback argument')

  if (typeof this._close == 'function')
    return this._close(callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.get = function (key, options, callback) {
  var self = this
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('get() requires a callback argument')
  var err = self._checkKeyValue(key, 'key', self._isBuffer)
  if (err) return callback(err)
  if (!self._isBuffer(key)) key = String(key)
  if (typeof options != 'object')
    options = {}

  if (typeof self._get == 'function')
    return self._get(key, options, callback)

  process.nextTick(function () { callback(new Error('NotFound')) })
}

AbstractLevelDOWN.prototype.put = function (key, value, options, callback) {
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('put() requires a callback argument')
  var err = this._checkKeyValue(key, 'key', this._isBuffer)
  if (err) return callback(err)
  err = this._checkKeyValue(value, 'value', this._isBuffer)
  if (err) return callback(err)
  if (!this._isBuffer(key)) key = String(key)
  // coerce value to string in node, dont touch it in browser
  // (indexeddb can store any JS type)
  if (!this._isBuffer(value) && !process.browser) value = String(value)
  if (typeof options != 'object')
    options = {}
  if (typeof this._put == 'function')
    return this._put(key, value, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.del = function (key, options, callback) {
  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('del() requires a callback argument')
  var err = this._checkKeyValue(key, 'key', this._isBuffer)
  if (err) return callback(err)
  if (!this._isBuffer(key)) key = String(key)
  if (typeof options != 'object')
    options = {}


  if (typeof this._del == 'function')
    return this._del(key, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.batch = function (array, options, callback) {
  if (!arguments.length)
    return this._chainedBatch()

  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('batch(array) requires a callback argument')
  if (!Array.isArray(array))
    return callback(new Error('batch(array) requires an array argument'))
  if (typeof options != 'object')
    options = {}

  var i = 0
    , l = array.length
    , e
    , err

  for (; i < l; i++) {
    e = array[i]
    if (typeof e != 'object') continue;

    err = this._checkKeyValue(e.type, 'type', this._isBuffer)
    if (err) return callback(err)

    err = this._checkKeyValue(e.key, 'key', this._isBuffer)
    if (err) return callback(err)

    if (e.type == 'put') {
      err = this._checkKeyValue(e.value, 'value', this._isBuffer)
      if (err) return callback(err)
    }
  }

  if (typeof this._batch == 'function')
    return this._batch(array, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.approximateSize = function (start, end, callback) {
  if (start == null || end == null || typeof start == 'function' || typeof end == 'function')
    throw new Error('approximateSize() requires valid `start`, `end` and `callback` arguments')
  if (typeof callback != 'function')
    throw new Error('approximateSize() requires a callback argument')

  if (!this._isBuffer(start)) start = String(start)
  if (!this._isBuffer(end)) end = String(end)
  if (typeof this._approximateSize == 'function')
    return this._approximateSize(start, end, callback)

  process.nextTick(function () { callback(null, 0) })
}

AbstractLevelDOWN.prototype.iterator = function (options) {
  if (typeof options != 'object')
    options = {}

  if (typeof this._iterator == 'function')
    return this._iterator(options)

  return new AbstractIterator(this)
}

AbstractLevelDOWN.prototype._chainedBatch = function () {
  return new AbstractChainedBatch(this)
}

AbstractLevelDOWN.prototype._isBuffer = function (obj) {
  return Buffer.isBuffer(obj)
}

AbstractLevelDOWN.prototype._checkKeyValue = function (obj, type) {
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')
  if (this._isBuffer(obj)) {
    if (obj.length === 0)
      return new Error(type + ' cannot be an empty Buffer')
  } else if (String(obj) === '')
    return new Error(type + ' cannot be an empty String')
}

module.exports.AbstractLevelDOWN    = AbstractLevelDOWN
module.exports.AbstractIterator     = AbstractIterator
module.exports.AbstractChainedBatch = AbstractChainedBatch

},{"./abstract-chained-batch":32,"./abstract-iterator":33,"__browserify_Buffer":111,"__browserify_process":112}],35:[function(require,module,exports){
arguments[4][17][0].apply(exports,arguments)
},{"./copy.js":38,"./create.js":39,"./from.js":40,"./is.js":41,"./join.js":42,"./read.js":44,"./subarray.js":45,"./to.js":46,"./write.js":47}],36:[function(require,module,exports){
module.exports=require(18)
},{}],37:[function(require,module,exports){
module.exports=require(19)
},{}],38:[function(require,module,exports){
module.exports=require(20)
},{}],39:[function(require,module,exports){
module.exports=require(21)
},{}],40:[function(require,module,exports){
module.exports = from

var base64 = require('base64-js')

var decoders = {
    hex: from_hex
  , utf8: from_utf
  , base64: from_base64
}

function from(source, encoding) {
  if(Array.isArray(source)) {
    return new Uint8Array(source)
  }

  return decoders[encoding || 'utf8'](source)
}

function from_hex(str) {
  var size = str.length / 2
    , buf = new Uint8Array(size)
    , character = ''

  for(var i = 0, len = str.length; i < len; ++i) {
    character += str.charAt(i)

    if(i > 0 && (i % 2) === 1) {
      buf[i>>>1] = parseInt(character, 16)
      character = '' 
    }
  }

  return buf 
}

function from_utf(str) {
  var bytes = []
    , tmp
    , ch

  for(var i = 0, len = str.length; i < len; ++i) {
    ch = str.charCodeAt(i)
    if(ch & 0x80) {
      tmp = encodeURIComponent(str.charAt(i)).substr(1).split('%')
      for(var j = 0, jlen = tmp.length; j < jlen; ++j) {
        bytes[bytes.length] = parseInt(tmp[j], 16)
      }
    } else {
      bytes[bytes.length] = ch 
    }
  }

  return new Uint8Array(bytes)
}

function from_base64(str) {
  return new Uint8Array(base64.toByteArray(str)) 
}

},{"base64-js":36}],41:[function(require,module,exports){
module.exports=require(23)
},{}],42:[function(require,module,exports){
module.exports=require(24)
},{}],43:[function(require,module,exports){
module.exports=require(25)
},{}],44:[function(require,module,exports){
module.exports=require(26)
},{"./mapped.js":43}],45:[function(require,module,exports){
module.exports=require(27)
},{}],46:[function(require,module,exports){
module.exports=require(28)
},{"base64-js":36,"to-utf8":37}],47:[function(require,module,exports){
module.exports=require(29)
},{"./mapped.js":43}],48:[function(require,module,exports){
const prr = require('prr')

function init (type, message, cause) {
  prr(this, {
      type    : type
    , name    : type
      // can be passed just a 'cause'
    , cause   : typeof message != 'string' ? message : cause
    , message : !!message && typeof message != 'string' ? message.message : message

  }, 'ewr')
}

// generic prototype, not intended to be actually used - helpful for `instanceof`
function CustomError (message, cause) {
  Error.call(this)
  if (Error.captureStackTrace)
    Error.captureStackTrace(this, arguments.callee)
  init.call(this, 'CustomError', message, cause)
}

CustomError.prototype = new Error()

function createError (errno, type, proto) {
  var err = function (message, cause) {
    init.call(this, type, message, cause)
    //TODO: the specificity here is stupid, errno should be available everywhere
    if (type == 'FilesystemError') {
      this.code    = this.cause.code
      this.path    = this.cause.path
      this.errno   = this.cause.errno
      this.message =
        (errno.errno[this.cause.errno]
          ? errno.errno[this.cause.errno].description
          : this.cause.message)
        + (this.cause.path ? ' [' + this.cause.path + ']' : '')
    }
    Error.call(this)
    if (Error.captureStackTrace)
      Error.captureStackTrace(this, arguments.callee)
  }
  err.prototype = !!proto ? new proto() : new CustomError()
  return err
}

module.exports = function (errno) {
  var ce = function (type, proto) {
    return createError(errno, type, proto)
  }
  return {
      CustomError     : CustomError
    , FilesystemError : ce('FilesystemError')
    , createError     : ce
  }
}

},{"prr":50}],49:[function(require,module,exports){
var all = module.exports.all = [
 {
  "errno": -1,
  "code": "UNKNOWN",
  "description": "unknown error"
 },
 {
  "errno": 0,
  "code": "OK",
  "description": "success"
 },
 {
  "errno": 1,
  "code": "EOF",
  "description": "end of file"
 },
 {
  "errno": 2,
  "code": "EADDRINFO",
  "description": "getaddrinfo error"
 },
 {
  "errno": 3,
  "code": "EACCES",
  "description": "permission denied"
 },
 {
  "errno": 4,
  "code": "EAGAIN",
  "description": "resource temporarily unavailable"
 },
 {
  "errno": 5,
  "code": "EADDRINUSE",
  "description": "address already in use"
 },
 {
  "errno": 6,
  "code": "EADDRNOTAVAIL",
  "description": "address not available"
 },
 {
  "errno": 7,
  "code": "EAFNOSUPPORT",
  "description": "address family not supported"
 },
 {
  "errno": 8,
  "code": "EALREADY",
  "description": "connection already in progress"
 },
 {
  "errno": 9,
  "code": "EBADF",
  "description": "bad file descriptor"
 },
 {
  "errno": 10,
  "code": "EBUSY",
  "description": "resource busy or locked"
 },
 {
  "errno": 11,
  "code": "ECONNABORTED",
  "description": "software caused connection abort"
 },
 {
  "errno": 12,
  "code": "ECONNREFUSED",
  "description": "connection refused"
 },
 {
  "errno": 13,
  "code": "ECONNRESET",
  "description": "connection reset by peer"
 },
 {
  "errno": 14,
  "code": "EDESTADDRREQ",
  "description": "destination address required"
 },
 {
  "errno": 15,
  "code": "EFAULT",
  "description": "bad address in system call argument"
 },
 {
  "errno": 16,
  "code": "EHOSTUNREACH",
  "description": "host is unreachable"
 },
 {
  "errno": 17,
  "code": "EINTR",
  "description": "interrupted system call"
 },
 {
  "errno": 18,
  "code": "EINVAL",
  "description": "invalid argument"
 },
 {
  "errno": 19,
  "code": "EISCONN",
  "description": "socket is already connected"
 },
 {
  "errno": 20,
  "code": "EMFILE",
  "description": "too many open files"
 },
 {
  "errno": 21,
  "code": "EMSGSIZE",
  "description": "message too long"
 },
 {
  "errno": 22,
  "code": "ENETDOWN",
  "description": "network is down"
 },
 {
  "errno": 23,
  "code": "ENETUNREACH",
  "description": "network is unreachable"
 },
 {
  "errno": 24,
  "code": "ENFILE",
  "description": "file table overflow"
 },
 {
  "errno": 25,
  "code": "ENOBUFS",
  "description": "no buffer space available"
 },
 {
  "errno": 26,
  "code": "ENOMEM",
  "description": "not enough memory"
 },
 {
  "errno": 27,
  "code": "ENOTDIR",
  "description": "not a directory"
 },
 {
  "errno": 28,
  "code": "EISDIR",
  "description": "illegal operation on a directory"
 },
 {
  "errno": 29,
  "code": "ENONET",
  "description": "machine is not on the network"
 },
 {
  "errno": 31,
  "code": "ENOTCONN",
  "description": "socket is not connected"
 },
 {
  "errno": 32,
  "code": "ENOTSOCK",
  "description": "socket operation on non-socket"
 },
 {
  "errno": 33,
  "code": "ENOTSUP",
  "description": "operation not supported on socket"
 },
 {
  "errno": 34,
  "code": "ENOENT",
  "description": "no such file or directory"
 },
 {
  "errno": 35,
  "code": "ENOSYS",
  "description": "function not implemented"
 },
 {
  "errno": 36,
  "code": "EPIPE",
  "description": "broken pipe"
 },
 {
  "errno": 37,
  "code": "EPROTO",
  "description": "protocol error"
 },
 {
  "errno": 38,
  "code": "EPROTONOSUPPORT",
  "description": "protocol not supported"
 },
 {
  "errno": 39,
  "code": "EPROTOTYPE",
  "description": "protocol wrong type for socket"
 },
 {
  "errno": 40,
  "code": "ETIMEDOUT",
  "description": "connection timed out"
 },
 {
  "errno": 41,
  "code": "ECHARSET",
  "description": "invalid Unicode character"
 },
 {
  "errno": 42,
  "code": "EAIFAMNOSUPPORT",
  "description": "address family for hostname not supported"
 },
 {
  "errno": 44,
  "code": "EAISERVICE",
  "description": "servname not supported for ai_socktype"
 },
 {
  "errno": 45,
  "code": "EAISOCKTYPE",
  "description": "ai_socktype not supported"
 },
 {
  "errno": 46,
  "code": "ESHUTDOWN",
  "description": "cannot send after transport endpoint shutdown"
 },
 {
  "errno": 47,
  "code": "EEXIST",
  "description": "file already exists"
 },
 {
  "errno": 48,
  "code": "ESRCH",
  "description": "no such process"
 },
 {
  "errno": 49,
  "code": "ENAMETOOLONG",
  "description": "name too long"
 },
 {
  "errno": 50,
  "code": "EPERM",
  "description": "operation not permitted"
 },
 {
  "errno": 51,
  "code": "ELOOP",
  "description": "too many symbolic links encountered"
 },
 {
  "errno": 52,
  "code": "EXDEV",
  "description": "cross-device link not permitted"
 },
 {
  "errno": 53,
  "code": "ENOTEMPTY",
  "description": "directory not empty"
 },
 {
  "errno": 54,
  "code": "ENOSPC",
  "description": "no space left on device"
 },
 {
  "errno": 55,
  "code": "EIO",
  "description": "i/o error"
 },
 {
  "errno": 56,
  "code": "EROFS",
  "description": "read-only file system"
 },
 {
  "errno": 57,
  "code": "ENODEV",
  "description": "no such device"
 },
 {
  "errno": 58,
  "code": "ESPIPE",
  "description": "invalid seek"
 },
 {
  "errno": 59,
  "code": "ECANCELED",
  "description": "operation canceled"
 }
]


module.exports.errno = {
    '-1': all[0]
  , '0': all[1]
  , '1': all[2]
  , '2': all[3]
  , '3': all[4]
  , '4': all[5]
  , '5': all[6]
  , '6': all[7]
  , '7': all[8]
  , '8': all[9]
  , '9': all[10]
  , '10': all[11]
  , '11': all[12]
  , '12': all[13]
  , '13': all[14]
  , '14': all[15]
  , '15': all[16]
  , '16': all[17]
  , '17': all[18]
  , '18': all[19]
  , '19': all[20]
  , '20': all[21]
  , '21': all[22]
  , '22': all[23]
  , '23': all[24]
  , '24': all[25]
  , '25': all[26]
  , '26': all[27]
  , '27': all[28]
  , '28': all[29]
  , '29': all[30]
  , '31': all[31]
  , '32': all[32]
  , '33': all[33]
  , '34': all[34]
  , '35': all[35]
  , '36': all[36]
  , '37': all[37]
  , '38': all[38]
  , '39': all[39]
  , '40': all[40]
  , '41': all[41]
  , '42': all[42]
  , '44': all[43]
  , '45': all[44]
  , '46': all[45]
  , '47': all[46]
  , '48': all[47]
  , '49': all[48]
  , '50': all[49]
  , '51': all[50]
  , '52': all[51]
  , '53': all[52]
  , '54': all[53]
  , '55': all[54]
  , '56': all[55]
  , '57': all[56]
  , '58': all[57]
  , '59': all[58]
}


module.exports.code = {
    'UNKNOWN': all[0]
  , 'OK': all[1]
  , 'EOF': all[2]
  , 'EADDRINFO': all[3]
  , 'EACCES': all[4]
  , 'EAGAIN': all[5]
  , 'EADDRINUSE': all[6]
  , 'EADDRNOTAVAIL': all[7]
  , 'EAFNOSUPPORT': all[8]
  , 'EALREADY': all[9]
  , 'EBADF': all[10]
  , 'EBUSY': all[11]
  , 'ECONNABORTED': all[12]
  , 'ECONNREFUSED': all[13]
  , 'ECONNRESET': all[14]
  , 'EDESTADDRREQ': all[15]
  , 'EFAULT': all[16]
  , 'EHOSTUNREACH': all[17]
  , 'EINTR': all[18]
  , 'EINVAL': all[19]
  , 'EISCONN': all[20]
  , 'EMFILE': all[21]
  , 'EMSGSIZE': all[22]
  , 'ENETDOWN': all[23]
  , 'ENETUNREACH': all[24]
  , 'ENFILE': all[25]
  , 'ENOBUFS': all[26]
  , 'ENOMEM': all[27]
  , 'ENOTDIR': all[28]
  , 'EISDIR': all[29]
  , 'ENONET': all[30]
  , 'ENOTCONN': all[31]
  , 'ENOTSOCK': all[32]
  , 'ENOTSUP': all[33]
  , 'ENOENT': all[34]
  , 'ENOSYS': all[35]
  , 'EPIPE': all[36]
  , 'EPROTO': all[37]
  , 'EPROTONOSUPPORT': all[38]
  , 'EPROTOTYPE': all[39]
  , 'ETIMEDOUT': all[40]
  , 'ECHARSET': all[41]
  , 'EAIFAMNOSUPPORT': all[42]
  , 'EAISERVICE': all[43]
  , 'EAISOCKTYPE': all[44]
  , 'ESHUTDOWN': all[45]
  , 'EEXIST': all[46]
  , 'ESRCH': all[47]
  , 'ENAMETOOLONG': all[48]
  , 'EPERM': all[49]
  , 'ELOOP': all[50]
  , 'EXDEV': all[51]
  , 'ENOTEMPTY': all[52]
  , 'ENOSPC': all[53]
  , 'EIO': all[54]
  , 'EROFS': all[55]
  , 'ENODEV': all[56]
  , 'ESPIPE': all[57]
  , 'ECANCELED': all[58]
}


module.exports.custom = require("./custom")(module.exports)
module.exports.create = module.exports.custom.createError
},{"./custom":48}],50:[function(require,module,exports){
/*!
  * prr
  * (c) 2013 Rod Vagg <rod@vagg.org>
  * https://github.com/rvagg/prr
  * License: MIT
  */

(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports)
    module.exports = definition()
  else
    context[name] = definition()
})('prr', this, function() {

  var setProperty = typeof Object.defineProperty == 'function'
      ? function (obj, key, options) {
          Object.defineProperty(obj, key, options)
          return obj
        }
      : function (obj, key, options) { // < es5
          obj[key] = options.value
          return obj
        }

    , makeOptions = function (value, options) {
        var oo = typeof options == 'object'
          , os = !oo && typeof options == 'string'
          , op = function (p) {
              return oo
                ? !!options[p]
                : os
                  ? options.indexOf(p[0]) > -1
                  : false
            }

        return {
            enumerable   : op('enumerable')
          , configurable : op('configurable')
          , writable     : op('writable')
          , value        : value
        }
      }

    , prr = function (obj, key, value, options) {
        var k

        options = makeOptions(value, options)

        if (typeof key == 'object') {
          for (k in key) {
            if (Object.hasOwnProperty.call(key, k)) {
              options.value = key[k]
              setProperty(obj, k, options)
            }
          }
          return obj
        }

        return setProperty(obj, key, options)
      }

  return prr
})
},{}],51:[function(require,module,exports){
var process=require("__browserify_process");// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;
var util = require('util');
var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

Object.keys(Writable.prototype).forEach(function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

},{"./_stream_readable":53,"./_stream_writable":55,"__browserify_process":112,"util":130}],52:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');
var util = require('util');
util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":54,"util":130}],53:[function(require,module,exports){
var process=require("__browserify_process"),Buffer=require("__browserify_Buffer");// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;
Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
var Stream = require('stream');
var util = require('util');
var StringDecoder;

util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    process.nextTick(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events.error)
    dest.on('error', onerror);
  else if (Array.isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    process.nextTick(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      state.pipes.forEach(write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = state.pipes.indexOf(dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      process.nextTick(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  events.forEach(function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

},{"__browserify_Buffer":111,"__browserify_process":112,"events":105,"stream":121,"string_decoder":127,"util":130}],54:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');
var util = require('util');
util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":51,"util":130}],55:[function(require,module,exports){
var process=require("__browserify_process"),Buffer=require("__browserify_Buffer");// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;
Writable.WritableState = WritableState;

var util = require('util');
var assert = require('assert');
var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];
}

function Writable(options) {
  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof require('./_stream_duplex')))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  state.needDrain = !ret;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      cb(er);
    });
  else
    cb(er);

  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

},{"./_stream_duplex":51,"__browserify_Buffer":111,"__browserify_process":112,"assert":103,"stream":121,"util":130}],56:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":51,"./lib/_stream_passthrough.js":52,"./lib/_stream_readable.js":53,"./lib/_stream_transform.js":54,"./lib/_stream_writable.js":55}],57:[function(require,module,exports){
module.exports = hasKeys

function hasKeys(source) {
    return source !== null &&
        (typeof source === "object" ||
        typeof source === "function")
}

},{}],58:[function(require,module,exports){
var Keys = require("object-keys")
var hasKeys = require("./has-keys")

module.exports = extend

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        if (!hasKeys(source)) {
            continue
        }

        var keys = Keys(source)

        for (var j = 0; j < keys.length; j++) {
            var name = keys[j]
            target[name] = source[name]
        }
    }

    return target
}

},{"./has-keys":57,"object-keys":60}],59:[function(require,module,exports){
var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;

var isFunction = function (fn) {
	var isFunc = (typeof fn === 'function' && !(fn instanceof RegExp)) || toString.call(fn) === '[object Function]';
	if (!isFunc && typeof window !== 'undefined') {
		isFunc = fn === window.setTimeout || fn === window.alert || fn === window.confirm || fn === window.prompt;
	}
	return isFunc;
};

module.exports = function forEach(obj, fn) {
	if (!isFunction(fn)) {
		throw new TypeError('iterator must be a function');
	}
	var i, k,
		isString = typeof obj === 'string',
		l = obj.length,
		context = arguments.length > 2 ? arguments[2] : null;
	if (l === +l) {
		for (i = 0; i < l; i++) {
			if (context === null) {
				fn(isString ? obj.charAt(i) : obj[i], i, obj);
			} else {
				fn.call(context, isString ? obj.charAt(i) : obj[i], i, obj);
			}
		}
	} else {
		for (k in obj) {
			if (hasOwn.call(obj, k)) {
				if (context === null) {
					fn(obj[k], k, obj);
				} else {
					fn.call(context, obj[k], k, obj);
				}
			}
		}
	}
};


},{}],60:[function(require,module,exports){
module.exports = Object.keys || require('./shim');


},{"./shim":62}],61:[function(require,module,exports){
var toString = Object.prototype.toString;

module.exports = function isArguments(value) {
	var str = toString.call(value);
	var isArguments = str === '[object Arguments]';
	if (!isArguments) {
		isArguments = str !== '[object Array]'
			&& value !== null
			&& typeof value === 'object'
			&& typeof value.length === 'number'
			&& value.length >= 0
			&& toString.call(value.callee) === '[object Function]';
	}
	return isArguments;
};


},{}],62:[function(require,module,exports){
(function () {
	"use strict";

	// modified from https://github.com/kriskowal/es5-shim
	var has = Object.prototype.hasOwnProperty,
		toString = Object.prototype.toString,
		forEach = require('./foreach'),
		isArgs = require('./isArguments'),
		hasDontEnumBug = !({'toString': null}).propertyIsEnumerable('toString'),
		hasProtoEnumBug = (function () {}).propertyIsEnumerable('prototype'),
		dontEnums = [
			"toString",
			"toLocaleString",
			"valueOf",
			"hasOwnProperty",
			"isPrototypeOf",
			"propertyIsEnumerable",
			"constructor"
		],
		keysShim;

	keysShim = function keys(object) {
		var isObject = object !== null && typeof object === 'object',
			isFunction = toString.call(object) === '[object Function]',
			isArguments = isArgs(object),
			theKeys = [];

		if (!isObject && !isFunction && !isArguments) {
			throw new TypeError("Object.keys called on a non-object");
		}

		if (isArguments) {
			forEach(object, function (value) {
				theKeys.push(value);
			});
		} else {
			var name,
				skipProto = hasProtoEnumBug && isFunction;

			for (name in object) {
				if (!(skipProto && name === 'prototype') && has.call(object, name)) {
					theKeys.push(name);
				}
			}
		}

		if (hasDontEnumBug) {
			var ctor = object.constructor,
				skipConstructor = ctor && ctor.prototype === object;

			forEach(dontEnums, function (dontEnum) {
				if (!(skipConstructor && dontEnum === 'constructor') && has.call(object, dontEnum)) {
					theKeys.push(dontEnum);
				}
			});
		}
		return theKeys;
	};

	module.exports = keysShim;
}());


},{"./foreach":59,"./isArguments":61}],63:[function(require,module,exports){
module.exports={
  "name": "levelup",
  "description": "Fast & simple storage - a Node.js-style LevelDB wrapper",
  "version": "0.18.2",
  "contributors": [
    {
      "name": "Rod Vagg",
      "email": "r@va.gg",
      "url": "https://github.com/rvagg"
    },
    {
      "name": "John Chesley",
      "email": "john@chesl.es",
      "url": "https://github.com/chesles/"
    },
    {
      "name": "Jake Verbaten",
      "email": "raynos2@gmail.com",
      "url": "https://github.com/raynos"
    },
    {
      "name": "Dominic Tarr",
      "email": "dominic.tarr@gmail.com",
      "url": "https://github.com/dominictarr"
    },
    {
      "name": "Max Ogden",
      "email": "max@maxogden.com",
      "url": "https://github.com/maxogden"
    },
    {
      "name": "Lars-Magnus Skog",
      "email": "lars.magnus.skog@gmail.com",
      "url": "https://github.com/ralphtheninja"
    },
    {
      "name": "David Björklund",
      "email": "david.bjorklund@gmail.com",
      "url": "https://github.com/kesla"
    },
    {
      "name": "Julian Gruber",
      "email": "julian@juliangruber.com",
      "url": "https://github.com/juliangruber"
    },
    {
      "name": "Paolo Fragomeni",
      "email": "paolo@async.ly",
      "url": "https://github.com/hij1nx"
    },
    {
      "name": "Anton Whalley",
      "email": "anton.whalley@nearform.com",
      "url": "https://github.com/No9"
    },
    {
      "name": "Matteo Collina",
      "email": "matteo.collina@gmail.com",
      "url": "https://github.com/mcollina"
    },
    {
      "name": "Pedro Teixeira",
      "email": "pedro.teixeira@gmail.com",
      "url": "https://github.com/pgte"
    },
    {
      "name": "James Halliday",
      "email": "mail@substack.net",
      "url": "https://github.com/substack"
    }
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/rvagg/node-levelup.git"
  },
  "homepage": "https://github.com/rvagg/node-levelup",
  "keywords": [
    "leveldb",
    "stream",
    "database",
    "db",
    "store",
    "storage",
    "json"
  ],
  "main": "lib/levelup.js",
  "dependencies": {
    "errno": "~0.1.0",
    "concat-stream": "~0.1.1",
    "readable-stream": "~1.0.17",
    "xtend": "~2.1.1",
    "prr": "~0.0.0",
    "semver": "~2.2.1",
    "bops": "~0.1.0",
    "deferred-leveldown": "~0.1.0"
  },
  "devDependencies": {
    "leveldown": "~0.10.0",
    "bustermove": "*",
    "tap": "*",
    "referee": "*",
    "rimraf": "*",
    "async": "*",
    "fstream": "*",
    "tar": "*",
    "mkfiletree": "*",
    "readfiletree": "*",
    "slow-stream": ">=0.0.4",
    "delayed": "*",
    "boganipsum": "*",
    "du": "*",
    "memdown": "*",
    "msgpack-js": "*"
  },
  "browser": {
    "leveldown": false,
    "leveldown/package": false,
    "semver": false
  },
  "scripts": {
    "test": "tap test/*-test.js --stderr",
    "functionaltests": "node ./test/functional/fstream-test.js && node ./test/functional/binary-data-test.js && node ./test/functional/compat-test.js",
    "alltests": "npm test && npm run-script functionaltests"
  },
  "license": "MIT",
  "readme": "LevelUP\n=======\n\n![LevelDB Logo](https://twimg0-a.akamaihd.net/profile_images/3360574989/92fc472928b444980408147e5e5db2fa_bigger.png)\n\nFast & simple storage - a Node.js-style LevelDB wrapper\n-------------------------------------------------------\n\n[![Build Status](https://secure.travis-ci.org/rvagg/node-levelup.png)](http://travis-ci.org/rvagg/node-levelup)\n\n[![NPM](https://nodei.co/npm/levelup.png?stars&downloads)](https://nodei.co/npm/levelup/) [![NPM](https://nodei.co/npm-dl/levelup.png)](https://nodei.co/npm/levelup/)\n\n\n  * <a href=\"#intro\">Introduction</a>\n  * <a href=\"#leveldown\">Relationship to LevelDOWN</a>\n  * <a href=\"#platforms\">Tested &amp; supported platforms</a>\n  * <a href=\"#basic\">Basic usage</a>\n  * <a href=\"#api\">API</a>\n  * <a href=\"#events\">Events</a>\n  * <a href=\"#json\">JSON data</a>\n  * <a href=\"#custom_encodings\">Custom encodings</a>\n  * <a href=\"#extending\">Extending LevelUP</a>\n  * <a href=\"#multiproc\">Multi-process access</a>\n  * <a href=\"#support\">Getting support</a>\n  * <a href=\"#contributing\">Contributing</a>\n  * <a href=\"#licence\">Licence &amp; copyright</a>\n\n<a name=\"intro\"></a>\nIntroduction\n------------\n\n**[LevelDB](http://code.google.com/p/leveldb/)** is a simple key/value data store built by Google, inspired by BigTable. It's used in Google Chrome and many other products. LevelDB supports arbitrary byte arrays as both keys and values, singular *get*, *put* and *delete* operations, *batched put and delete*, bi-directional iterators and simple compression using the very fast [Snappy](http://code.google.com/p/snappy/) algorithm.\n\n**LevelUP** aims to expose the features of LevelDB in a **Node.js-friendly way**. All standard `Buffer` encoding types are supported, as is a special JSON encoding. LevelDB's iterators are exposed as a Node.js-style **readable stream** a matching **writeable stream** converts writes to *batch* operations.\n\nLevelDB stores entries **sorted lexicographically by keys**. This makes LevelUP's <a href=\"#createReadStream\"><code>ReadStream</code></a> interface a very powerful query mechanism.\n\n**LevelUP** is an **OPEN Open Source Project**, see the <a href=\"#contributing\">Contributing</a> section to find out what this means.\n\n<a name=\"leveldown\"></a>\nRelationship to LevelDOWN\n-------------------------\n\nLevelUP is designed to be backed by **[LevelDOWN](https://github.com/rvagg/node-leveldown/)** which provides a pure C++ binding to LevelDB and can be used as a stand-alone package if required.\n\n**As of version 0.9, LevelUP no longer requires LevelDOWN as a dependency so you must `npm install leveldown` when you install LevelUP.**\n\nLevelDOWN is now optional because LevelUP can be used with alternative backends, such as **[level.js](https://github.com/maxogden/level.js)** in the browser or [MemDOWN](https://github.com/rvagg/node-memdown) for a pure in-memory store.\n\nLevelUP will look for LevelDOWN and throw an error if it can't find it in its Node `require()` path. It will also tell you if the installed version of LevelDOWN is incompatible.\n\n**The [level](https://github.com/level/level) package is available as an alternative installation mechanism.** Install it instead to automatically get both LevelUP & LevelDOWN. It exposes LevelUP on its export (i.e. you can `var leveldb = require('level')`).\n\n\n<a name=\"platforms\"></a>\nTested & supported platforms\n----------------------------\n\n  * **Linux**: including ARM platforms such as Raspberry Pi *and Kindle!*\n  * **Mac OS**\n  * **Solaris**: including Joyent's SmartOS & Nodejitsu\n  * **Windows**: Node 0.10 and above only. See installation instructions for *node-gyp's* dependencies [here](https://github.com/TooTallNate/node-gyp#installation), you'll need these (free) components from Microsoft to compile and run any native Node add-on in Windows.\n\n<a name=\"basic\"></a>\nBasic usage\n-----------\n\nFirst you need to install LevelUP!\n\n```sh\n$ npm install levelup leveldown\n```\n\nOr\n\n```sh\n$ npm install level\n```\n\n*(this second option requires you to use LevelUP by calling `var levelup = require('level')`)*\n\n\nAll operations are asynchronous although they don't necessarily require a callback if you don't need to know when the operation was performed.\n\n```js\nvar levelup = require('levelup')\n\n// 1) Create our database, supply location and options.\n//    This will create or open the underlying LevelDB store.\nvar db = levelup('./mydb')\n\n// 2) put a key & value\ndb.put('name', 'LevelUP', function (err) {\n  if (err) return console.log('Ooops!', err) // some kind of I/O error\n\n  // 3) fetch by key\n  db.get('name', function (err, value) {\n    if (err) return console.log('Ooops!', err) // likely the key was not found\n\n    // ta da!\n    console.log('name=' + value)\n  })\n})\n```\n\n<a name=\"api\"></a>\n## API\n\n  * <a href=\"#ctor\"><code><b>levelup()</b></code></a>\n  * <a href=\"#open\"><code>db.<b>open()</b></code></a>\n  * <a href=\"#close\"><code>db.<b>close()</b></code></a>\n  * <a href=\"#put\"><code>db.<b>put()</b></code></a>\n  * <a href=\"#get\"><code>db.<b>get()</b></code></a>\n  * <a href=\"#del\"><code>db.<b>del()</b></code></a>\n  * <a href=\"#batch\"><code>db.<b>batch()</b></code> *(array form)*</a>\n  * <a href=\"#batch_chained\"><code>db.<b>batch()</b></code> *(chained form)*</a>\n  * <a href=\"#isOpen\"><code>db.<b>isOpen()</b></code></a>\n  * <a href=\"#isClosed\"><code>db.<b>isClosed()</b></code></a>\n  * <a href=\"#createReadStream\"><code>db.<b>createReadStream()</b></code></a>\n  * <a href=\"#createKeyStream\"><code>db.<b>createKeyStream()</b></code></a>\n  * <a href=\"#createValueStream\"><code>db.<b>createValueStream()</b></code></a>\n  * <a href=\"#createWriteStream\"><code>db.<b>createWriteStream()</b></code></a>\n\n### Special operations exposed by LevelDOWN\n\n  * <a href=\"#approximateSize\"><code>db.db.<b>approximateSize()</b></code></a>\n  * <a href=\"#getProperty\"><code>db.db.<b>getProperty()</b></code></a>\n  * <a href=\"#destroy\"><code><b>leveldown.destroy()</b></code></a>\n  * <a href=\"#repair\"><code><b>leveldown.repair()</b></code></a>\n\n\n--------------------------------------------------------\n<a name=\"ctor\"></a>\n### levelup(location[, options[, callback]])\n### levelup(options[, callback ])\n### levelup(db[, callback ])\n<code>levelup()</code> is the main entry point for creating a new LevelUP instance and opening the underlying store with LevelDB.\n\nThis function returns a new instance of LevelUP and will also initiate an <a href=\"#open\"><code>open()</code></a> operation. Opening the database is an asynchronous operation which will trigger your callback if you provide one. The callback should take the form: `function (err, db) {}` where the `db` is the LevelUP instance. If you don't provide a callback, any read & write operations are simply queued internally until the database is fully opened.\n\nThis leads to two alternative ways of managing a new LevelUP instance:\n\n```js\nlevelup(location, options, function (err, db) {\n  if (err) throw err\n  db.get('foo', function (err, value) {\n    if (err) return console.log('foo does not exist')\n    console.log('got foo =', value)\n  })\n})\n\n// vs the equivalent:\n\nvar db = levelup(location, options) // will throw if an error occurs\ndb.get('foo', function (err, value) {\n  if (err) return console.log('foo does not exist')\n  console.log('got foo =', value)\n})\n```\n\nThe `location` argument is available as a read-only property on the returned LevelUP instance.\n\nThe `levelup(options, callback)` form (with optional `callback`) is only available where you provide a valid `'db'` property on the options object (see below). Only for back-ends that don't require a `location` argument, such as [MemDOWN](https://github.com/rvagg/memdown).\n\nFor example:\n\n```js\nvar levelup = require('levelup')\nvar memdown = require('memdown')\nvar db = levelup({ db: memdown })\n```\n\nThe `levelup(db, callback)` form (with optional `callback`) is only available where `db` is a factory function, as would be provided as a `'db'` property on an `options` object (see below). Only for back-ends that don't require a `location` argument, such as [MemDOWN](https://github.com/rvagg/memdown).\n\nFor example:\n\n```js\nvar levelup = require('levelup')\nvar memdown = require('memdown')\nvar db = levelup(memdown)\n```\n\n#### `options`\n\n`levelup()` takes an optional options object as its second argument; the following properties are accepted:\n\n* `'createIfMissing'` *(boolean, default: `true`)*: If `true`, will initialise an empty database at the specified location if one doesn't already exist. If `false` and a database doesn't exist you will receive an error in your `open()` callback and your database won't open.\n\n* `'errorIfExists'` *(boolean, default: `false`)*: If `true`, you will receive an error in your `open()` callback if the database exists at the specified location.\n\n* `'compression'` *(boolean, default: `true`)*: If `true`, all *compressible* data will be run through the Snappy compression algorithm before being stored. Snappy is very fast and shouldn't gain much speed by disabling so leave this on unless you have good reason to turn it off.\n\n* `'cacheSize'` *(number, default: `8 * 1024 * 1024`)*: The size (in bytes) of the in-memory [LRU](http://en.wikipedia.org/wiki/Cache_algorithms#Least_Recently_Used) cache with frequently used uncompressed block contents. \n\n* `'keyEncoding'` and `'valueEncoding'` *(string, default: `'utf8'`)*: The encoding of the keys and values passed through Node.js' `Buffer` implementation (see [Buffer#toString()](http://nodejs.org/docs/latest/api/buffer.html#buffer_buf_tostring_encoding_start_end)).\n  <p><code>'utf8'</code> is the default encoding for both keys and values so you can simply pass in strings and expect strings from your <code>get()</code> operations. You can also pass <code>Buffer</code> objects as keys and/or values and conversion will be performed.</p>\n  <p>Supported encodings are: hex, utf8, ascii, binary, base64, ucs2, utf16le.</p>\n  <p><code>'json'</code> encoding is also supported, see below.</p>\n\n* `'db'` *(object, default: LevelDOWN)*: LevelUP is backed by [LevelDOWN](https://github.com/rvagg/node-leveldown/) to provide an interface to LevelDB. You can completely replace the use of LevelDOWN by providing a \"factory\" function that will return a LevelDOWN API compatible object given a `location` argument. For further information, see [MemDOWN](https://github.com/rvagg/node-memdown/), a fully LevelDOWN API compatible replacement that uses a memory store rather than LevelDB. Also see [Abstract LevelDOWN](http://github.com/rvagg/node-abstract-leveldown), a partial implementation of the LevelDOWN API that can be used as a base prototype for a LevelDOWN substitute.\n\nAdditionally, each of the main interface methods accept an optional options object that can be used to override `'keyEncoding'` and `'valueEncoding'`.\n\n--------------------------------------------------------\n<a name=\"open\"></a>\n### db.open([callback])\n<code>open()</code> opens the underlying LevelDB store. In general **you should never need to call this method directly** as it's automatically called by <a href=\"#ctor\"><code>levelup()</code></a>.\n\nHowever, it is possible to *reopen* a database after it has been closed with <a href=\"#close\"><code>close()</code></a>, although this is not generally advised.\n\n--------------------------------------------------------\n<a name=\"close\"></a>\n### db.close([callback])\n<code>close()</code> closes the underlying LevelDB store. The callback will receive any error encountered during closing as the first argument.\n\nYou should always clean up your LevelUP instance by calling `close()` when you no longer need it to free up resources. A LevelDB store cannot be opened by multiple instances of LevelDB/LevelUP simultaneously.\n\n--------------------------------------------------------\n<a name=\"put\"></a>\n### db.put(key, value[, options][, callback])\n<code>put()</code> is the primary method for inserting data into the store. Both the `key` and `value` can be arbitrary data objects.\n\nThe callback argument is optional but if you don't provide one and an error occurs then expect the error to be thrown.\n\n#### `options`\n\nEncoding of the `key` and `value` objects will adhere to `'keyEncoding'` and `'valueEncoding'` options provided to <a href=\"#ctor\"><code>levelup()</code></a>, although you can provide alternative encoding settings in the options for `put()` (it's recommended that you stay consistent in your encoding of keys and values in a single store).\n\nIf you provide a `'sync'` value of `true` in your `options` object, LevelDB will perform a synchronous write of the data; although the operation will be asynchronous as far as Node is concerned. Normally, LevelDB passes the data to the operating system for writing and returns immediately, however a synchronous write will use `fsync()` or equivalent so your callback won't be triggered until the data is actually on disk. Synchronous filesystem writes are **significantly** slower than asynchronous writes but if you want to be absolutely sure that the data is flushed then you can use `'sync': true`.\n\n--------------------------------------------------------\n<a name=\"get\"></a>\n### db.get(key[, options][, callback])\n<code>get()</code> is the primary method for fetching data from the store. The `key` can be an arbitrary data object. If it doesn't exist in the store then the callback will receive an error as its first argument. A not-found err object will be of type `'NotFoundError'` so you can `err.type == 'NotFoundError'` or you can perform a truthy test on the property `err.notFound`.\n\n```js\ndb.get('foo', function (err, value) {\n  if (err) {\n    if (err.notFound) {\n      // handle a 'NotFoundError' here\n      return\n    }\n    // I/O or other error, pass it up the callback chain\n    return callback(err)\n  }\n\n  // .. handle `value` here\n})\n```\n\n#### `options`\n\nEncoding of the `key` object will adhere to the `'keyEncoding'` option provided to <a href=\"#ctor\"><code>levelup()</code></a>, although you can provide alternative encoding settings in the options for `get()` (it's recommended that you stay consistent in your encoding of keys and values in a single store).\n\nLevelDB will by default fill the in-memory LRU Cache with data from a call to get. Disabling this is done by setting `fillCache` to `false`. \n\n--------------------------------------------------------\n<a name=\"del\"></a>\n### db.del(key[, options][, callback])\n<code>del()</code> is the primary method for removing data from the store.\n\n#### `options`\n\nEncoding of the `key` object will adhere to the `'keyEncoding'` option provided to <a href=\"#ctor\"><code>levelup()</code></a>, although you can provide alternative encoding settings in the options for `del()` (it's recommended that you stay consistent in your encoding of keys and values in a single store).\n\nA `'sync'` option can also be passed, see <a href=\"#put\"><code>put()</code></a> for details on how this works.\n\n--------------------------------------------------------\n<a name=\"batch\"></a>\n### db.batch(array[, options][, callback]) *(array form)*\n<code>batch()</code> can be used for very fast bulk-write operations (both *put* and *delete*). The `array` argument should contain a list of operations to be executed sequentially, although as a whole they are performed as an atomic operation inside LevelDB. Each operation is contained in an object having the following properties: `type`, `key`, `value`, where the *type* is either `'put'` or `'del'`. In the case of `'del'` the `'value'` property is ignored. Any entries with a `'key'` of `null` or `undefined` will cause an error to be returned on the `callback` and any `'type': 'put'` entry with a `'value'` of `null` or `undefined` will return an error.\n\n```js\nvar ops = [\n    { type: 'del', key: 'father' }\n  , { type: 'put', key: 'name', value: 'Yuri Irsenovich Kim' }\n  , { type: 'put', key: 'dob', value: '16 February 1941' }\n  , { type: 'put', key: 'spouse', value: 'Kim Young-sook' }\n  , { type: 'put', key: 'occupation', value: 'Clown' }\n]\n\ndb.batch(ops, function (err) {\n  if (err) return console.log('Ooops!', err)\n  console.log('Great success dear leader!')\n})\n```\n\n#### `options`\n\nSee <a href=\"#put\"><code>put()</code></a> for a discussion on the `options` object. You can overwrite default `'keyEncoding'` and `'valueEncoding'` and also specify the use of `sync` filesystem operations.\n\nIn addition to encoding options for the whole batch you can also overwrite the encoding per operation, like:\n\n```js\nvar ops = [{\n    type          : 'put'\n  , key           : new Buffer([1, 2, 3])\n  , value         : { some: 'json' }\n  , keyEncoding   : 'binary'\n  , valueEncoding : 'json'\n}]\n```\n\n--------------------------------------------------------\n<a name=\"batch_chained\"></a>\n### db.batch() *(chained form)*\n<code>batch()</code>, when called with no arguments will return a `Batch` object which can be used to build, and eventually commit, an atomic LevelDB batch operation. Depending on how it's used, it is possible to obtain greater performance when using the chained form of `batch()` over the array form.\n\n```js\ndb.batch()\n  .del('father')\n  .put('name', 'Yuri Irsenovich Kim')\n  .put('dob', '16 February 1941')\n  .put('spouse', 'Kim Young-sook')\n  .put('occupation', 'Clown')\n  .write(function () { console.log('Done!') })\n```\n\n<b><code>batch.put(key, value[, options])</code></b>\n\nQueue a *put* operation on the current batch, not committed until a `write()` is called on the batch.\n\nThe optional `options` argument can be used to override the default `'keyEncoding'` and/or `'valueEncoding'`.\n\nThis method may `throw` a `WriteError` if there is a problem with your put (such as the `value` being `null` or `undefined`).\n\n<b><code>batch.del(key[, options])</code></b>\n\nQueue a *del* operation on the current batch, not committed until a `write()` is called on the batch.\n\nThe optional `options` argument can be used to override the default `'keyEncoding'`.\n\nThis method may `throw` a `WriteError` if there is a problem with your delete.\n\n<b><code>batch.clear()</code></b>\n\nClear all queued operations on the current batch, any previous operations will be discarded.\n\n<b><code>batch.write([callback])</code></b>\n\nCommit the queued operations for this batch. All operations not *cleared* will be written to the database atomically, that is, they will either all succeed or fail with no partial commits. The optional `callback` will be called when the operation has completed with an *error* argument if an error has occurred; if no `callback` is supplied and an error occurs then this method will `throw` a `WriteError`.\n\n\n--------------------------------------------------------\n<a name=\"isOpen\"></a>\n### db.isOpen()\n\nA LevelUP object can be in one of the following states:\n\n  * *\"new\"*     - newly created, not opened or closed\n  * *\"opening\"* - waiting for the database to be opened\n  * *\"open\"*    - successfully opened the database, available for use\n  * *\"closing\"* - waiting for the database to be closed\n  * *\"closed\"*  - database has been successfully closed, should not be used\n\n`isOpen()` will return `true` only when the state is \"open\".\n\n--------------------------------------------------------\n<a name=\"isClosed\"></a>\n### db.isClosed()\n\n*See <a href=\"#put\"><code>isOpen()</code></a>*\n\n`isClosed()` will return `true` only when the state is \"closing\" *or* \"closed\", it can be useful for determining if read and write operations are permissible.\n\n--------------------------------------------------------\n<a name=\"createReadStream\"></a>\n### db.createReadStream([options])\n\nYou can obtain a **ReadStream** of the full database by calling the `createReadStream()` method. The resulting stream is a complete Node.js-style [Readable Stream](http://nodejs.org/docs/latest/api/stream.html#stream_readable_stream) where `'data'` events emit objects with `'key'` and `'value'` pairs.\n\n```js\ndb.createReadStream()\n  .on('data', function (data) {\n    console.log(data.key, '=', data.value)\n  })\n  .on('error', function (err) {\n    console.log('Oh my!', err)\n  })\n  .on('close', function () {\n    console.log('Stream closed')\n  })\n  .on('end', function () {\n    console.log('Stream closed')\n  })\n```\n\nThe standard `pause()`, `resume()` and `destroy()` methods are implemented on the ReadStream, as is `pipe()` (see below). `'data'`, '`error'`, `'end'` and `'close'` events are emitted.\n\nAdditionally, you can supply an options object as the first parameter to `createReadStream()` with the following options:\n\n* `'start'`: the key you wish to start the read at. By default it will start at the beginning of the store. Note that the *start* doesn't have to be an actual key that exists, LevelDB will simply find the *next* key, greater than the key you provide.\n\n* `'end'`: the key you wish to end the read on. By default it will continue until the end of the store. Again, the *end* doesn't have to be an actual key as an (inclusive) `<=`-type operation is performed to detect the end. You can also use the `destroy()` method instead of supplying an `'end'` parameter to achieve the same effect.\n\n* `'reverse'` *(boolean, default: `false`)*: a boolean, set to true if you want the stream to go in reverse order. Beware that due to the way LevelDB works, a reverse seek will be slower than a forward seek.\n\n* `'keys'` *(boolean, default: `true`)*: whether the `'data'` event should contain keys. If set to `true` and `'values'` set to `false` then `'data'` events will simply be keys, rather than objects with a `'key'` property. Used internally by the `createKeyStream()` method.\n\n* `'values'` *(boolean, default: `true`)*: whether the `'data'` event should contain values. If set to `true` and `'keys'` set to `false` then `'data'` events will simply be values, rather than objects with a `'value'` property. Used internally by the `createValueStream()` method.\n\n* `'limit'` *(number, default: `-1`)*: limit the number of results collected by this stream. This number represents a *maximum* number of results and may not be reached if you get to the end of the store or your `'end'` value first. A value of `-1` means there is no limit.\n\n* `'fillCache'` *(boolean, default: `false`)*: wheather LevelDB's LRU-cache should be filled with data read.\n\n* `'keyEncoding'` / `'valueEncoding'` *(string)*: the encoding applied to each read piece of data.\n\n--------------------------------------------------------\n<a name=\"createKeyStream\"></a>\n### db.createKeyStream([options])\n\nA **KeyStream** is a **ReadStream** where the `'data'` events are simply the keys from the database so it can be used like a traditional stream rather than an object stream.\n\nYou can obtain a KeyStream either by calling the `createKeyStream()` method on a LevelUP object or by passing passing an options object to `createReadStream()` with `keys` set to `true` and `values` set to `false`.\n\n```js\ndb.createKeyStream()\n  .on('data', function (data) {\n    console.log('key=', data)\n  })\n\n// same as:\ndb.createReadStream({ keys: true, values: false })\n  .on('data', function (data) {\n    console.log('key=', data)\n  })\n```\n\n--------------------------------------------------------\n<a name=\"createValueStream\"></a>\n### db.createValueStream([options])\n\nA **ValueStream** is a **ReadStream** where the `'data'` events are simply the values from the database so it can be used like a traditional stream rather than an object stream.\n\nYou can obtain a ValueStream either by calling the `createValueStream()` method on a LevelUP object or by passing passing an options object to `createReadStream()` with `values` set to `true` and `keys` set to `false`.\n\n```js\ndb.createValueStream()\n  .on('data', function (data) {\n    console.log('value=', data)\n  })\n\n// same as:\ndb.createReadStream({ keys: false, values: true })\n  .on('data', function (data) {\n    console.log('value=', data)\n  })\n```\n\n--------------------------------------------------------\n<a name=\"createWriteStream\"></a>\n### db.createWriteStream([options])\n\nA **WriteStream** can be obtained by calling the `createWriteStream()` method. The resulting stream is a complete Node.js-style [Writable Stream](http://nodejs.org/docs/latest/api/stream.html#stream_writable_stream) which accepts objects with `'key'` and `'value'` pairs on its `write()` method.\n\nThe WriteStream will buffer writes and submit them as a `batch()` operations where writes occur *within the same tick*.\n\n```js\nvar ws = db.createWriteStream()\n\nws.on('error', function (err) {\n  console.log('Oh my!', err)\n})\nws.on('close', function () {\n  console.log('Stream closed')\n})\n\nws.write({ key: 'name', value: 'Yuri Irsenovich Kim' })\nws.write({ key: 'dob', value: '16 February 1941' })\nws.write({ key: 'spouse', value: 'Kim Young-sook' })\nws.write({ key: 'occupation', value: 'Clown' })\nws.end()\n```\n\nThe standard `write()`, `end()`, `destroy()` and `destroySoon()` methods are implemented on the WriteStream. `'drain'`, `'error'`, `'close'` and `'pipe'` events are emitted.\n\nYou can specify encodings both for the whole stream and individual entries:\n\nTo set the encoding for the whole stream, provide an options object as the first parameter to `createWriteStream()` with `'keyEncoding'` and/or `'valueEncoding'`.\n\nTo set the encoding for an individual entry:\n\n```js\nwriteStream.write({\n    key           : new Buffer([1, 2, 3])\n  , value         : { some: 'json' }\n  , keyEncoding   : 'binary'\n  , valueEncoding : 'json'\n})\n```\n\n#### write({ type: 'put' })\n\nIf individual `write()` operations are performed with a `'type'` property of `'del'`, they will be passed on as `'del'` operations to the batch.\n\n```js\nvar ws = db.createWriteStream()\n\nws.on('error', function (err) {\n  console.log('Oh my!', err)\n})\nws.on('close', function () {\n  console.log('Stream closed')\n})\n\nws.write({ type: 'del', key: 'name' })\nws.write({ type: 'del', key: 'dob' })\nws.write({ type: 'put', key: 'spouse' })\nws.write({ type: 'del', key: 'occupation' })\nws.end()\n```\n\n#### db.createWriteStream({ type: 'del' })\n\nIf the *WriteStream* is created with a `'type'` option of `'del'`, all `write()` operations will be interpreted as `'del'`, unless explicitly specified as `'put'`.\n\n```js\nvar ws = db.createWriteStream({ type: 'del' })\n\nws.on('error', function (err) {\n  console.log('Oh my!', err)\n})\nws.on('close', function () {\n  console.log('Stream closed')\n})\n\nws.write({ key: 'name' })\nws.write({ key: 'dob' })\n// but it can be overridden\nws.write({ type: 'put', key: 'spouse', value: 'Ri Sol-ju' })\nws.write({ key: 'occupation' })\nws.end()\n```\n\n#### Pipes and Node Stream compatibility\n\nA ReadStream can be piped directly to a WriteStream, allowing for easy copying of an entire database. A simple `copy()` operation is included in LevelUP that performs exactly this on two open databases:\n\n```js\nfunction copy (srcdb, dstdb, callback) {\n  srcdb.createReadStream().pipe(dstdb.createWriteStream()).on('close', callback)\n}\n```\n\nThe ReadStream is also [fstream](https://github.com/isaacs/fstream)-compatible which means you should be able to pipe to and from fstreams. So you can serialize and deserialize an entire database to a directory where keys are filenames and values are their contents, or even into a *tar* file using [node-tar](https://github.com/isaacs/node-tar). See the [fstream functional test](https://github.com/rvagg/node-levelup/blob/master/test/functional/fstream-test.js) for an example. *(Note: I'm not really sure there's a great use-case for this but it's a fun example and it helps to harden the stream implementations.)*\n\nKeyStreams and ValueStreams can be treated like standard streams of raw data. If `'keyEncoding'` or `'valueEncoding'` is set to `'binary'` the `'data'` events will simply be standard Node `Buffer` objects straight out of the data store.\n\n\n--------------------------------------------------------\n<a name='approximateSize'></a>\n### db.db.approximateSize(start, end, callback)\n<code>approximateSize()</code> can used to get the approximate number of bytes of file system space used by the range `[start..end)`. The result may not include recently written data.\n\n```js\nvar db = require('level')('./huge.db')\n\ndb.db.approximateSize('a', 'c', function (err, size) {\n  if (err) return console.error('Ooops!', err)\n  console.log('Approximate size of range is %d', size)\n})\n```\n\n**Note:** `approximateSize()` is available via [LevelDOWN](https://github.com/rvagg/node-leveldown/), which by default is accessible as the `db` property of your LevelUP instance. This is a specific LevelDB operation and is not likely to be available where you replace LevelDOWN with an alternative back-end via the `'db'` option.\n\n\n--------------------------------------------------------\n<a name='getProperty'></a>\n### db.db.getProperty(property)\n<code>getProperty</code> can be used to get internal details from LevelDB. When issued with a valid property string, a readable string will be returned (this method is synchronous).\n\nCurrently, the only valid properties are:\n\n* <b><code>'leveldb.num-files-at-levelN'</code></b>: returns the number of files at level *N*, where N is an integer representing a valid level (e.g. \"0\").\n\n* <b><code>'leveldb.stats'</code></b>: returns a multi-line string describing statistics about LevelDB's internal operation.\n\n* <b><code>'leveldb.sstables'</code></b>: returns a multi-line string describing all of the *sstables* that make up contents of the current database.\n\n\n```js\nvar db = require('level')('./huge.db')\nconsole.log(db.db.getProperty('leveldb.num-files-at-level3'))\n// → '243'\n```\n\n**Note:** `getProperty()` is available via [LevelDOWN](https://github.com/rvagg/node-leveldown/), which by default is accessible as the `db` property of your LevelUP instance. This is a specific LevelDB operation and is not likely to be available where you replace LevelDOWN with an alternative back-end via the `'db'` option.\n\n\n--------------------------------------------------------\n<a name=\"destroy\"></a>\n### leveldown.destroy(location, callback)\n<code>destroy()</code> is used to completely remove an existing LevelDB database directory. You can use this function in place of a full directory *rm* if you want to be sure to only remove LevelDB-related files. If the directory only contains LevelDB files, the directory itself will be removed as well. If there are additional, non-LevelDB files in the directory, those files, and the directory, will be left alone.\n\nThe callback will be called when the destroy operation is complete, with a possible `error` argument.\n\n**Note:** `destroy()` is available via [LevelDOWN](https://github.com/rvagg/node-leveldown/) which you will have to have available to `require()`, e.g.:\n\n```js\nrequire('leveldown').destroy('./huge.db', function () { console.log('done!') })\n```\n\n--------------------------------------------------------\n<a name=\"repair\"></a>\n### leveldown.repair(location, callback)\n<code>repair()</code> can be used to attempt a restoration of a damaged LevelDB store. From the LevelDB documentation:\n\n> If a DB cannot be opened, you may attempt to call this method to resurrect as much of the contents of the database as possible. Some data may be lost, so be careful when calling this function on a database that contains important information.\n\nYou will find information on the *repair* operation in the *LOG* file inside the store directory. \n\nA `repair()` can also be used to perform a compaction of the LevelDB log into table files.\n\nThe callback will be called when the repair operation is complete, with a possible `error` argument.\n\n**Note:** `destroy()` is available via [LevelDOWN](https://github.com/rvagg/node-leveldown/) which you will have to have available to `require()`, e.g.:\n\n```js\nrequire('leveldown').repair('./huge.db', function () { console.log('done!') })\n```\n\n--------------------------------------------------------\n\n<a name=\"events\"></a>\nEvents\n------\n\nLevelUP emits events when the callbacks to the corresponding methods are called.\n\n* `db.emit('put', key, value)` emitted when a new value is `'put'`\n* `db.emit('del', key)` emitted when a value is deleted\n* `db.emit('batch', ary)` emitted when a batch operation has executed\n* `db.emit('ready')` emitted when the database has opened (`'open'` is synonym)\n* `db.emit('closed')` emitted when the database has closed\n* `db.emit('opening')` emitted when the database is opening\n* `db.emit('closing')` emitted when the database is closing\n\nIf you do not pass a callback to an async function, and there is an error, LevelUP will `emit('error', err)` instead.\n\n<a name=\"json\"></a>\nJSON data\n---------\n\nYou specify `'json'` encoding for both keys and/or values, you can then supply JavaScript objects to LevelUP and receive them from all fetch operations, including ReadStreams. LevelUP will automatically *stringify* your objects and store them as *utf8* and parse the strings back into objects before passing them back to you.\n\n<a name=\"custom_encodings\"></a>\nCustom encodings\n----------------\n\nA custom encoding may be provided by passing in an object as an value for `keyEncoding` or `valueEncoding` (wherever accepted), it must have the following properties:\n\n```js\n{\n    encode : function (val) { ... }\n  , decode : function (val) { ... }\n  , buffer : boolean // encode returns a buffer-like and decode accepts a buffer\n  , type   : String  // name of this encoding type.\n}\n```\n\n*\"buffer-like\"* means either a `Buffer` if running in Node, or a Uint8Array if in a browser. Use [bops](https://github.com/chrisdickinson/bops) to get portable binary operations.\n\n<a name=\"extending\"></a>\nExtending LevelUP\n-----------------\n\nA list of <a href=\"https://github.com/rvagg/node-levelup/wiki/Modules\"><b>Node.js LevelDB modules and projects</b></a> can be found in the wiki.\n\nWhen attempting to extend the functionality of LevelUP, it is recommended that you consider using [level-hooks](https://github.com/dominictarr/level-hooks) and/or [level-sublevel](https://github.com/dominictarr/level-sublevel). **level-sublevel** is particularly helpful for keeping additional, extension-specific, data in a LevelDB store. It allows you to partition a LevelUP instance into multiple sub-instances that each correspond to discrete namespaced key ranges.\n\n<a name=\"multiproc\"></a>\nMulti-process access\n--------------------\n\nLevelDB is thread-safe but is **not** suitable for accessing with multiple processes. You should only ever have a LevelDB database open from a single Node.js process. Node.js clusters are made up of multiple processes so a LevelUP instance cannot be shared between them either.\n\nSee the <a href=\"https://github.com/rvagg/node-levelup/wiki/Modules\"><b>wiki</b></a> for some LevelUP extensions, including [multilevel](https://github.com/juliangruber/multilevel), that may help if you require a single data store to be shared across processes.\n\n<a name=\"support\"></a>\nGetting support\n---------------\n\nThere are multiple ways you can find help in using LevelDB in Node.js:\n\n * **IRC:** you'll find an active group of LevelUP users in the **##leveldb** channel on Freenode, including most of the contributors to this project.\n * **Mailing list:** there is an active [Node.js LevelDB](https://groups.google.com/forum/#!forum/node-levelup) Google Group.\n * **GitHub:** you're welcome to open an issue here on this GitHub repository if you have a question.\n\n<a name=\"contributing\"></a>\nContributing\n------------\n\nLevelUP is an **OPEN Open Source Project**. This means that:\n\n> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.\n\nSee the [CONTRIBUTING.md](https://github.com/rvagg/node-levelup/blob/master/CONTRIBUTING.md) file for more details.\n\n### Contributors\n\nLevelUP is only possible due to the excellent work of the following contributors:\n\n<table><tbody>\n<tr><th align=\"left\">Rod Vagg</th><td><a href=\"https://github.com/rvagg\">GitHub/rvagg</a></td><td><a href=\"http://twitter.com/rvagg\">Twitter/@rvagg</a></td></tr>\n<tr><th align=\"left\">John Chesley</th><td><a href=\"https://github.com/chesles/\">GitHub/chesles</a></td><td><a href=\"http://twitter.com/chesles\">Twitter/@chesles</a></td></tr>\n<tr><th align=\"left\">Jake Verbaten</th><td><a href=\"https://github.com/raynos\">GitHub/raynos</a></td><td><a href=\"http://twitter.com/raynos2\">Twitter/@raynos2</a></td></tr>\n<tr><th align=\"left\">Dominic Tarr</th><td><a href=\"https://github.com/dominictarr\">GitHub/dominictarr</a></td><td><a href=\"http://twitter.com/dominictarr\">Twitter/@dominictarr</a></td></tr>\n<tr><th align=\"left\">Max Ogden</th><td><a href=\"https://github.com/maxogden\">GitHub/maxogden</a></td><td><a href=\"http://twitter.com/maxogden\">Twitter/@maxogden</a></td></tr>\n<tr><th align=\"left\">Lars-Magnus Skog</th><td><a href=\"https://github.com/ralphtheninja\">GitHub/ralphtheninja</a></td><td><a href=\"http://twitter.com/ralphtheninja\">Twitter/@ralphtheninja</a></td></tr>\n<tr><th align=\"left\">David Björklund</th><td><a href=\"https://github.com/kesla\">GitHub/kesla</a></td><td><a href=\"http://twitter.com/david_bjorklund\">Twitter/@david_bjorklund</a></td></tr>\n<tr><th align=\"left\">Julian Gruber</th><td><a href=\"https://github.com/juliangruber\">GitHub/juliangruber</a></td><td><a href=\"http://twitter.com/juliangruber\">Twitter/@juliangruber</a></td></tr>\n<tr><th align=\"left\">Paolo Fragomeni</th><td><a href=\"https://github.com/hij1nx\">GitHub/hij1nx</a></td><td><a href=\"http://twitter.com/hij1nx\">Twitter/@hij1nx</a></td></tr>\n<tr><th align=\"left\">Anton Whalley</th><td><a href=\"https://github.com/No9\">GitHub/No9</a></td><td><a href=\"https://twitter.com/antonwhalley\">Twitter/@antonwhalley</a></td></tr>\n<tr><th align=\"left\">Matteo Collina</th><td><a href=\"https://github.com/mcollina\">GitHub/mcollina</a></td><td><a href=\"https://twitter.com/matteocollina\">Twitter/@matteocollina</a></td></tr>\n<tr><th align=\"left\">Pedro Teixeira</th><td><a href=\"https://github.com/pgte\">GitHub/pgte</a></td><td><a href=\"https://twitter.com/pgte\">Twitter/@pgte</a></td></tr>\n<tr><th align=\"left\">James Halliday</th><td><a href=\"https://github.com/substack\">GitHub/substack</a></td><td><a href=\"https://twitter.com/substack\">Twitter/@substack</a></td></tr>\n</tbody></table>\n\n### Windows\n\nA large portion of the Windows support comes from code by [Krzysztof Kowalczyk](http://blog.kowalczyk.info/) [@kjk](https://twitter.com/kjk), see his Windows LevelDB port [here](http://code.google.com/r/kkowalczyk-leveldb/). If you're using LevelUP on Windows, you should give him your thanks!\n\n\n<a name=\"licence\"></a>\nLicence &amp; copyright\n-------------------\n\nCopyright (c) 2012-2013 LevelUP contributors (listed above).\n\nLevelUP is licensed under an MIT +no-false-attribs license. All rights not explicitly granted in the MIT license are reserved. See the included LICENSE file for more details.\n\n=======\n*LevelUP builds on the excellent work of the LevelDB and Snappy teams from Google and additional contributors. LevelDB and Snappy are both issued under the [New BSD Licence](http://opensource.org/licenses/BSD-3-Clause).*\n",
  "readmeFilename": "README.md",
  "bugs": {
    "url": "https://github.com/rvagg/node-levelup/issues"
  },
  "_id": "levelup@0.18.2",
  "_from": "levelup@"
}

},{}],64:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter
var sublevel = require('level-sublevel')
var Wizard = require('weak-type-wizard')
var NoddityRetrieval = require('noddity-retrieval')

var PostIndexManager = require('./lib/index_manager.js')
var PostManager = require('./lib/post_manager.js')

var postCaster = new Wizard({
	postMetadata: 'metadata',
	string: ['content', 'filename'],
	default: {
		content: '',
		filename: ''
	},
	cast: {
		postMetadata: new Wizard({
			date: 'date'
		})
	}
})

module.exports = function NoddityButler(host, levelUpDb) {
	var retrieval = new NoddityRetrieval(host)
	var db = sublevel(levelUpDb)

	var emitter = new EventEmitter()
	var postManager = new PostManager(retrieval, db.sublevel('posts', {
		emitter: emitter,
		valueEncoding: postCaster.getLevelUpEncoding()
	}))
	var indexManager = new PostIndexManager(retrieval, postManager, db.sublevel('index', { valueEncoding: 'json' }))

	function getPosts(options, cb) {
		if (typeof options === 'function') {
			cb = options
		}
		if (typeof options !== 'object') {
			options = {}
		}
		var local = options.local || false
		var begin = typeof options.mostRecent === 'number' ? -options.mostRecent : undefined
		var postGetter = local ? indexManager.getLocalPosts : indexManager.getPosts
		postGetter(begin, undefined, cb)
	}

	function stop() {
		postManager.stop()
		indexManager.stop()
	}

	emitter.getPost = postManager.getPost
	emitter.getPosts = getPosts
	emitter.allPostsAreLoaded = indexManager.allPostsAreLoaded
	emitter.stop = stop

	return emitter
}

},{"./lib/index_manager.js":65,"./lib/post_manager.js":66,"events":105,"level-sublevel":70,"noddity-retrieval":85,"weak-type-wizard":101}],65:[function(require,module,exports){
var levelCache = require('levelup-cache')

function postSortingFunction(a, b) {
	valid = a && b && a.metadata && b.metadata && a.metadata.date && b.metadata.date
	if (!valid || a.metadata.date == b.metadata.date) {
		return 0
	} else if (a.metadata.date < b.metadata.date) {
		return -1
	} else {
		return 1
	}
}

var KEY = 'index'

function PostIndexManager(retrieval, postManager, levelUpDb) {
	var cache = levelCache(levelUpDb, function(key, cb) {
		retrieval.getIndex(cb)
	})

	var get = cache.get.bind(cache, KEY)

	get()

	function getPosts(postGetter, begin, end, cb) {
		if (typeof begin === 'function') {
			cb = begin
		}
		get(function(err, postNames) {
			if (err) {
				cb(err)
			} else {
				postGetter(postNames, function(err, posts) {
					if (!err) {
						posts = posts.sort(postSortingFunction)
						if (typeof begin === 'number') {
							posts = posts.slice(begin, end)
						}
					}
					cb(err, posts)
				})
			}
		})
	}

	var getLocalAndRemotePosts = getPosts.bind(null, postManager.getPosts)

	var getLocalPosts = getPosts.bind(null, postManager.getLocalPosts)

	return {
		getPosts: getLocalAndRemotePosts,
		getLocalPosts: getLocalPosts,
		allPostsAreLoaded: function(cb) {
			get(function(err, postNames) {
				if (err) {
					cb(false, false)
				} else {
					getLocalPosts(function(err, posts) {
						cb(err, err || (posts.length === postNames.length))
					})
				}
			})
		},
		stop: cache.stop
	}
}

module.exports = PostIndexManager

},{"levelup-cache":82}],66:[function(require,module,exports){
var ASQ = require('asynquence')
var LevelCache = require('levelup-cache')
var EventEmitter = require('events').EventEmitter
var extend = require('extend')
var isDate = require('util').isDate

function compareMetadataProperties(a, b) {
	return typeof b !== 'undefined'
		&& isDate(a) ? a.toString() === b.toString() : a === b
}

function postsAreEqual(a, b) {
	return a.content === b.content
		&& a.metadata.length === b.metadata.length
		&& a.filename === b.filename
		&& Object.keys(a.metadata).every(function(key) {
			return compareMetadataProperties(a.metadata[key], b.metadata[key])
		})
}

function PostManager(retrieval, levelUpDb, options) {
	options = options || {}
	var emitter = options.emitter || new EventEmitter()
	delete options.emitter
	var cacheOptions = extend({
		comparison: postsAreEqual
	}, options)
	var tehOfficialCache = new LevelCache(levelUpDb, retrieval.getPost, cacheOptions)

	tehOfficialCache.on('change', function(key, newValue, oldValue) {
		emitter.emit('post changed', key, newValue, oldValue)
	})

	function getFromCache(filename, cb) {
		tehOfficialCache.get(filename, cb)
	}

	function getPosts(arrayOFileNames, cb) {
		var results = []
		var error = false

		var sequence = ASQ()

		var fns = arrayOFileNames.map(function(filename, index) {
			return function(done) {
				getFromCache(filename, function(err, post) {
					if (!error && err) {
						error = err
					} else if (!error) {
						results[index] = post
					}
					done()
				})
			}
		})

		sequence.gate.apply(sequence, fns).then(function() {
			cb(error, results)
		})
	}

	function getLocalPosts(arrayOFileNames, cb) {
		var foundPosts = []
		var srsError = false

		var sequence = ASQ()

		var fns = arrayOFileNames.map(function(filename) {
			return function(done) {
				tehOfficialCache.getLocal(filename, function(err, post) {
					if (!srsError) {
						if (!err) {
							foundPosts.push(post)
						} else if (!err.notFound) {
							srsError = err
							sequence.abort()
						}
					}
					done()
				})
			}
		})

		sequence.gate.apply(sequence, fns).then(function(done) {
			cb(srsError, foundPosts)
			done()
		})
	}

	return {
		getPost: getFromCache,
		getPosts: getPosts,
		getLocalPosts: getLocalPosts,
		stop: tehOfficialCache.stop
	}
}

module.exports = PostManager

},{"asynquence":67,"events":105,"extend":68,"levelup-cache":82,"util":130}],67:[function(require,module,exports){
/*! asynquence
    v0.1.1-a (c) Kyle Simpson
    MIT License: http://getify.mit-license.org
*/
!function(a,b,c){"undefined"!=typeof module&&module.exports?module.exports=c():"function"==typeof define&&define.amd?define(c):b[a]=c(a,b)}("ASQ",this,function(a,b){function f(a){return"undefined"!=typeof setImmediate?setImmediate(a):setTimeout(a,0)}function g(){function a(){function a(){clearTimeout(v),v=null,r.length=0,s.length=0,t.length=0,u.length=0}function b(){return p?c():(v||(v=f(c)),void 0)}function c(){var c,e;if(v=null,p)a();else if(o)for(;s.length;){c=s.shift();try{c.apply(c,u)}catch(f){u.push(f),f.stack&&u.push(f.stack),0===s.length&&console.error.apply(console,u)}}else if(q&&r.length>0){q=!1,c=r.shift(),e=t.slice(),t.length=0,e.unshift(d());try{c.apply(c,e)}catch(f){u.push(f),o=!0,b()}}}function d(){function a(){o||p||q||(q=!0,t.push.apply(t,arguments),u.length=0,b())}return a.fail=function(){o||p||q||(o=!0,t.length=0,u.push.apply(u,arguments),b())},a.abort=function(){o||p||(q=!1,p=!0,t.length=0,u.length=0,b())},a}function g(a,b,c){function d(){clearTimeout(v),v=s=t=u=null}function g(){return l?h():(v||(v=f(h)),void 0)}function h(){if(!(o||p||m)){var b,c=[];if(v=null,k)a.fail.apply(a,u),d();else if(l)a.abort(),d();else if(i()){for(m=!0,b=0;b<s.length;b++)c.push(t["m"+b]);a.apply(a,c),d()}}}function i(){if(!(o||p||k||l||m||0===s.length)){var a,b=!0;for(a=0;a<s.length;a++)if(null===s[a]){b=!1;break}return b}}function j(){function a(){if(!(o||p||k||l||m||s[b])){var a=e.call(arguments);t["m"+b]=a.length>1?a:a[0],s[b]=!0,g()}}var b=s.length;return a.fail=function(){o||p||k||l||m||s[b]||(k=!0,u=e.call(arguments),g())},a.abort=function(){o||p||k||l||m||(l=!0,h())},s[b]=null,a}var n,q,r,u,v,k=!1,l=!1,m=!1,s=[],t={};for(n=0;n<b.length&&!k&&!l;n++){q=c.slice(),q.unshift(j());try{b[n].apply(b[n],q)}catch(w){r=w,k=!0;break}}r&&a.fail(r)}function h(){return o||p?w:(arguments.length>0&&r.push.apply(r,arguments),b(),w)}function i(){return p?w:(s.push.apply(s,arguments),b(),w)}function j(){if(o||p||0===arguments.length)return w;var a=e.apply(arguments);return h(function(b){var c=e.call(arguments);c.shift(),g(b,a,c)}),w}function k(){if(o||p||0===arguments.length)return w;var a,b=e.call(arguments);for(a=0;a<b.length;a++)!function(a){h(function(b){var c=e.call(arguments,1);a.apply(a,c),b()}).or(a.fail)}(b[a]);return w}function l(){if(o||p||0===arguments.length)return w;var a,b=e.call(arguments);for(a=0;a<b.length;a++)!function(a){h(function(b){var c=e.call(arguments,1);a.apply(a,c).pipe(b)})}(b[a]);return w}function m(){if(o||p||0===arguments.length)return w;var a,b=e.call(arguments);for(a=0;a<b.length;a++)!function(a){h(function(b){var c=e.call(arguments,1);b(a.apply(a,c))})}(b[a]);return w}function n(){return o?w:(p=!0,c(),w)}var v,o=!1,p=!1,q=!0,r=[],s=[],t=[],u=[],w={then:h,or:i,gate:j,pipe:k,seq:l,val:m,abort:n};return arguments.length>0&&w.then.apply(w,arguments),w}return a}var c,d=(b||{})[a],e=Array.prototype.slice;return c=g(),c.noConflict=function(){return b&&(b[a]=d),c},c});

},{}],68:[function(require,module,exports){
var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;

function isPlainObject(obj) {
	if (!obj || toString.call(obj) !== '[object Object]' || obj.nodeType || obj.setInterval)
		return false;

	var has_own_constructor = hasOwn.call(obj, 'constructor');
	var has_is_property_of_method = hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !has_own_constructor && !has_is_property_of_method)
		return false;

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for ( key in obj ) {}

	return key === undefined || hasOwn.call( obj, key );
};

module.exports = function extend() {
	var options, name, src, copy, copyIsArray, clone,
	    target = arguments[0] || {},
	    i = 1,
	    length = arguments.length,
	    deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && typeof target !== "function") {
		target = {};
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( isPlainObject(copy) || (copyIsArray = Array.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && Array.isArray(src) ? src : [];

					} else {
						clone = src && isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

},{}],69:[function(require,module,exports){
function addOperation (type, key, value, options) {
  var operation = {
    type: type,
    key: key,
    value: value,
    options: options
  }

  if (options && options.prefix) {
    operation.prefix = options.prefix
    delete options.prefix
  }

  this._operations.push(operation)

  return this
}

function Batch(sdb) {
  this._operations = []
  this._sdb = sdb

  this.put = addOperation.bind(this, 'put')
  this.del = addOperation.bind(this, 'del')
}

var B = Batch.prototype


B.clear = function () {
  this._operations = []
}

B.write = function (cb) {
  this._sdb.batch(this._operations, cb)
}

module.exports = Batch

},{}],70:[function(require,module,exports){
var process=require("__browserify_process");var EventEmitter = require('events').EventEmitter
var next         = process.nextTick
var SubDb        = require('./sub')
var Batch        = require('./batch')
var fixRange     = require('level-fix-range')

var Hooks   = require('level-hooks')

module.exports   = function (_db, options) {
  function DB () {}
  DB.prototype = _db
  var db = new DB()

  if (db.sublevel) return db

  options = options || {}

  //use \xff (255) as the seperator,
  //so that sections of the database will sort after the regular keys
  var sep = options.sep = options.sep || '\xff'
  db._options = options

  Hooks(db)

  db.sublevels = {}

  db.sublevel = function (prefix, options) {
    if(db.sublevels[prefix])
      return db.sublevels[prefix]
    return new SubDb(db, prefix, options || this._options)
  }

  db.methods = {}

  db.prefix = function (key) {
    return '' + (key || '')
  }

  db.pre = function (range, hook) {
    if(!hook)
      hook = range, range = {
        max  : sep
      }
    return db.hooks.pre(range, hook)
  }

  db.post = function (range, hook) {
    if(!hook)
      hook = range, range = {
        max : sep
      }
    return db.hooks.post(range, hook)
  }

  function safeRange(fun) {
    return function (opts) {
      opts = opts || {}
      opts = fixRange(opts)

      if(opts.reverse) opts.start = opts.start || sep
      else             opts.end   = opts.end || sep

      return fun.call(db, opts)
    }
  }

  db.readStream =
  db.createReadStream  = safeRange(db.createReadStream)
  db.keyStream =
  db.createKeyStream   = safeRange(db.createKeyStream)
  db.valuesStream =
  db.createValueStream = safeRange(db.createValueStream)

  var batch = db.batch
  db.batch = function (changes, opts, cb) {
    if(!Array.isArray(changes))
      return new Batch(db)
    changes.forEach(function (e) {
      if(e.prefix) {
        if('function' === typeof e.prefix.prefix)
          e.key = e.prefix.prefix(e.key)
        else if('string'  === typeof e.prefix)
          e.key = e.prefix + e.key
      }
    })
    batch.call(db, changes, opts, cb)
  }
  return db
}


},{"./batch":69,"./sub":81,"__browserify_process":112,"events":105,"level-fix-range":71,"level-hooks":73}],71:[function(require,module,exports){
var clone = require('clone')

module.exports = 
function fixRange(opts) {
  opts = clone(opts)

  var reverse = opts.reverse
  var end     = opts.max || opts.end
  var start   = opts.min || opts.start

  var range = [start, end]
  if(start != null && end != null)
    range.sort()
  if(reverse)
    range = range.reverse()

  opts.start   = range[0]
  opts.end     = range[1]

  delete opts.min
  delete opts.max

  return opts
}

},{"clone":72}],72:[function(require,module,exports){
var Buffer=require("__browserify_Buffer");"use strict";

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

var util = {
  isArray: function (ar) {
    return Array.isArray(ar) || (typeof ar === 'object' && objectToString(ar) === '[object Array]');
  },
  isDate: function (d) {
    return typeof d === 'object' && objectToString(d) === '[object Date]';
  },
  isRegExp: function (re) {
    return typeof re === 'object' && objectToString(re) === '[object RegExp]';
  },
  getRegExpFlags: function (re) {
    var flags = '';
    re.global && (flags += 'g');
    re.ignoreCase && (flags += 'i');
    re.multiline && (flags += 'm');
    return flags;
  }
};

if (typeof module === 'object')
  module.exports = clone;

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
*/
function clone(parent, circular) {
  if (typeof circular == 'undefined')
    circular = true;

  var useBuffer = typeof Buffer != 'undefined';

  var circularParent = {};
  var circularResolved = {};
  var circularReplace = [];

  function _clone(parent, context, child, cIndex) {
    var i; // Use local context within this function
    // Deep clone all properties of parent into child
    if (typeof parent == 'object') {
      if (parent == null)
        return parent;
      // Check for circular references
      for(i in circularParent)
        if (circularParent[i] === parent) {
          // We found a circular reference
          circularReplace.push({'resolveTo': i, 'child': child, 'i': cIndex});
          return null; //Just return null for now...
          // we will resolve circular references later
        }

      // Add to list of all parent objects
      circularParent[context] = parent;
      // Now continue cloning...
      if (util.isArray(parent)) {
        child = [];
        for(i in parent)
          child[i] = _clone(parent[i], context + '[' + i + ']', child, i);
      }
      else if (util.isDate(parent))
        child = new Date(parent.getTime());
      else if (util.isRegExp(parent)) {
        child = new RegExp(parent.source, util.getRegExpFlags(parent));
        if (parent.lastIndex) child.lastIndex = parent.lastIndex;
      } else if (useBuffer && Buffer.isBuffer(parent))
      {
        child = new Buffer(parent.length);
        parent.copy(child);
      }
      else {
        child = {};

        // Also copy prototype over to new cloned object
        child.__proto__ = parent.__proto__;
        for(i in parent)
          child[i] = _clone(parent[i], context + '[' + i + ']', child, i);
      }

      // Add to list of all cloned objects
      circularResolved[context] = child;
    }
    else
      child = parent; //Just a simple shallow copy will do
    return child;
  }

  var i;
  if (circular) {
    var cloned = _clone(parent, '*');

    // Now this object has been cloned. Let's check to see if there are any
    // circular references for it
    for(i in circularReplace) {
      var c = circularReplace[i];
      if (c && c.child && c.i in c.child) {
        c.child[c.i] = circularResolved[c.resolveTo];
      }
    }
    return cloned;
  } else {
    // Deep clone all properties of parent into child
    var child;
    if (typeof parent == 'object') {
      if (parent == null)
        return parent;
      if (parent.constructor.name === 'Array') {
        child = [];
        for(i in parent)
          child[i] = clone(parent[i], circular);
      }
      else if (util.isDate(parent))
        child = new Date(parent.getTime() );
      else if (util.isRegExp(parent)) {
        child = new RegExp(parent.source, util.getRegExpFlags(parent));
        if (parent.lastIndex) child.lastIndex = parent.lastIndex;
      } else {
        child = {};
        child.__proto__ = parent.__proto__;
        for(i in parent)
          child[i] = clone(parent[i], circular);
      }
    }
    else
      child = parent; // Just a simple shallow clone will do
    return child;
  }
}

/**
 * Simple flat clone using prototype, accepts only objects, usefull for property
 * override on FLAT configuration object (no nested props).
 *
 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
 * works.
 */
clone.clonePrototype = function(parent) {
  if (parent === null)
    return null;

  var c = function () {};
  c.prototype = parent;
  return new c();
};

},{"__browserify_Buffer":111}],73:[function(require,module,exports){
var ranges = require('string-range')

module.exports = function (db) {

  if(db.hooks) {
    return     
  }

  var posthooks = []
  var prehooks  = []

  function getPrefix (p) {
    return p && (
        'string' ===   typeof p        ? p
      : 'string' ===   typeof p.prefix ? p.prefix
      : 'function' === typeof p.prefix ? p.prefix()
      :                                  ''
      )
  }

  function getKeyEncoding (db) {
    if(db && db._getKeyEncoding)
      return db._getKeyEncoding(db)
  }

  function getValueEncoding (db) {
    if(db && db._getValueEncoding)
      return db._getValueEncoding(db)
  }

  function remover (array, item) {
    return function () {
      var i = array.indexOf(item)
      if(!~i) return false        
      array.splice(i, 1)
      return true
    }
  }

  db.hooks = {
    post: function (prefix, hook) {
      if(!hook) hook = prefix, prefix = ''
      var h = {test: ranges.checker(prefix), hook: hook}
      posthooks.push(h)
      return remover(posthooks, h)
    },
    pre: function (prefix, hook) {
      if(!hook) hook = prefix, prefix = ''
      var h = {test: ranges.checker(prefix), hook: hook}
      prehooks.push(h)
      return remover(prehooks, h)
    },
    posthooks: posthooks,
    prehooks: prehooks
  }

  //POST HOOKS

  function each (e) {
    if(e && e.type) {
      posthooks.forEach(function (h) {
        if(h.test(e.key)) h.hook(e)
      })
    }
  }

  db.on('put', function (key, val) {
    each({type: 'put', key: key, value: val})
  })
  db.on('del', function (key, val) {
    each({type: 'del', key: key, value: val})
  })
  db.on('batch', function onBatch (ary) {
    ary.forEach(each)
  })

  //PRE HOOKS

  var put = db.put
  var del = db.del
  var batch = db.batch

  function callHooks (isBatch, b, opts, cb) {
    try {
    b.forEach(function hook(e, i) {
      prehooks.forEach(function (h) {
        if(h.test(String(e.key))) {
          //optimize this?
          //maybe faster to not create a new object each time?
          //have one object and expose scope to it?
          var context = {
            add: function (ch, db) {
              if(typeof ch === 'undefined') {
                return this
              }
              if(ch === false)
                return delete b[i]
              var prefix = (
                getPrefix(ch.prefix) || 
                getPrefix(db) || 
                h.prefix || ''
              )
              ch.key = prefix + ch.key
              if(h.test(String(ch.key))) {
                //this usually means a stack overflow.
                throw new Error('prehook cannot insert into own range')
              }
              var ke = ch.keyEncoding   || getKeyEncoding(ch.prefix)
              var ve = ch.valueEncoding || getValueEncoding(ch.prefix)
              if(ke) ch.keyEncoding = ke
              if(ve) ch.valueEncoding = ve

              b.push(ch)
              hook(ch, b.length - 1)
              return this
            },
            put: function (ch, db) {
              if('object' === typeof ch) ch.type = 'put'
              return this.add(ch, db)
            },
            del: function (ch, db) {
              if('object' === typeof ch) ch.type = 'del'
              return this.add(ch, db)
            },
            veto: function () {
              return this.add(false)
            }
          }
          h.hook.call(context, e, context.add, b)
        }
      })
    })
    } catch (err) {
      return (cb || opts)(err)
    }
    b = b.filter(function (e) {
      return e && e.type //filter out empty items
    })

    if(b.length == 1 && !isBatch) {
      var change = b[0]
      return change.type == 'put' 
        ? put.call(db, change.key, change.value, opts, cb) 
        : del.call(db, change.key, opts, cb)  
    }
    return batch.call(db, b, opts, cb)
  }

  db.put = function (key, value, opts, cb ) {
    var batch = [{key: key, value: value, type: 'put'}]
    return callHooks(false, batch, opts, cb)
  }

  db.del = function (key, opts, cb) {
    var batch = [{key: key, type: 'del'}]
    return callHooks(false, batch, opts, cb)
  }

  db.batch = function (batch, opts, cb) {
    return callHooks(true, batch, opts, cb)
  }
}

},{"string-range":74}],74:[function(require,module,exports){

//force to a valid range
var range = exports.range = function (obj) {
  return null == obj ? {} : 'string' === typeof range ? {
      min: range, max: range + '\xff'
    } :  obj
}

//turn into a sub range.
var prefix = exports.prefix = function (range, within, term) {
  range = exports.range(range)
  var _range = {}
  term = term || '\xff'
  if(range instanceof RegExp || 'function' == typeof range) {
    _range.min = within
    _range.max   = within + term,
    _range.inner = function (k) {
      var j = k.substring(within.length)
      if(range.test)
        return range.test(j)
      return range(j)
    }
  }
  else if('object' === typeof range) {
    _range.min = within + (range.min || range.start || '')
    _range.max = within + (range.max || range.end   || (term || '~'))
    _range.reverse = !!range.reverse
  }
  return _range
}

//return a function that checks a range
var checker = exports.checker = function (range) {
  if(!range) range = {}

  if ('string' === typeof range)
    return function (key) {
      return key.indexOf(range) == 0
    }
  else if(range instanceof RegExp)
    return function (key) {
      return range.test(key)
    }
  else if('object' === typeof range)
    return function (key) {
      var min = range.min || range.start
      var max = range.max || range.end

      // fixes keys passed as ints from sublevels
      key = String(key)

      return (
        !min || key >= min
      ) && (
        !max || key <= max
      ) && (
        !range.inner || (
          range.inner.test 
            ? range.inner.test(key)
            : range.inner(key)
        )
      )
    }
  else if('function' === typeof range)
    return range
}
//check if a key is within a range.
var satifies = exports.satisfies = function (key, range) {
  return checker(range)(key)
}



},{}],75:[function(require,module,exports){
module.exports=require(57)
},{}],76:[function(require,module,exports){
arguments[4][58][0].apply(exports,arguments)
},{"./has-keys":75,"object-keys":77}],77:[function(require,module,exports){
arguments[4][60][0].apply(exports,arguments)
},{"./shim":80}],78:[function(require,module,exports){

var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;

module.exports = function forEach (obj, fn, ctx) {
    if (toString.call(fn) !== '[object Function]') {
        throw new TypeError('iterator must be a function');
    }
    var l = obj.length;
    if (l === +l) {
        for (var i = 0; i < l; i++) {
            fn.call(ctx, obj[i], i, obj);
        }
    } else {
        for (var k in obj) {
            if (hasOwn.call(obj, k)) {
                fn.call(ctx, obj[k], k, obj);
            }
        }
    }
};


},{}],79:[function(require,module,exports){

/**!
 * is
 * the definitive JavaScript type testing library
 * 
 * @copyright 2013 Enrico Marino
 * @license MIT
 */

var objProto = Object.prototype;
var owns = objProto.hasOwnProperty;
var toString = objProto.toString;
var isActualNaN = function (value) {
  return value !== value;
};
var NON_HOST_TYPES = {
  "boolean": 1,
  "number": 1,
  "string": 1,
  "undefined": 1
};

/**
 * Expose `is`
 */

var is = module.exports = {};

/**
 * Test general.
 */

/**
 * is.type
 * Test if `value` is a type of `type`.
 *
 * @param {Mixed} value value to test
 * @param {String} type type
 * @return {Boolean} true if `value` is a type of `type`, false otherwise
 * @api public
 */

is.a =
is.type = function (value, type) {
  return typeof value === type;
};

/**
 * is.defined
 * Test if `value` is defined.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if 'value' is defined, false otherwise
 * @api public
 */

is.defined = function (value) {
  return value !== undefined;
};

/**
 * is.empty
 * Test if `value` is empty.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is empty, false otherwise
 * @api public
 */

is.empty = function (value) {
  var type = toString.call(value);
  var key;

  if ('[object Array]' === type || '[object Arguments]' === type) {
    return value.length === 0;
  }

  if ('[object Object]' === type) {
    for (key in value) if (owns.call(value, key)) return false;
    return true;
  }

  if ('[object String]' === type) {
    return '' === value;
  }

  return false;
};

/**
 * is.equal
 * Test if `value` is equal to `other`.
 *
 * @param {Mixed} value value to test
 * @param {Mixed} other value to compare with
 * @return {Boolean} true if `value` is equal to `other`, false otherwise
 */

is.equal = function (value, other) {
  var type = toString.call(value)
  var key;

  if (type !== toString.call(other)) {
    return false;
  }

  if ('[object Object]' === type) {
    for (key in value) {
      if (!is.equal(value[key], other[key])) {
        return false;
      }
    }
    return true;
  }

  if ('[object Array]' === type) {
    key = value.length;
    if (key !== other.length) {
      return false;
    }
    while (--key) {
      if (!is.equal(value[key], other[key])) {
        return false;
      }
    }
    return true;
  }

  if ('[object Function]' === type) {
    return value.prototype === other.prototype;
  }

  if ('[object Date]' === type) {
    return value.getTime() === other.getTime();
  }

  return value === other;
};

/**
 * is.hosted
 * Test if `value` is hosted by `host`.
 *
 * @param {Mixed} value to test
 * @param {Mixed} host host to test with
 * @return {Boolean} true if `value` is hosted by `host`, false otherwise
 * @api public
 */

is.hosted = function (value, host) {
  var type = typeof host[value];
  return type === 'object' ? !!host[value] : !NON_HOST_TYPES[type];
};

/**
 * is.instance
 * Test if `value` is an instance of `constructor`.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an instance of `constructor`
 * @api public
 */

is.instance = is['instanceof'] = function (value, constructor) {
  return value instanceof constructor;
};

/**
 * is.null
 * Test if `value` is null.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is null, false otherwise
 * @api public
 */

is['null'] = function (value) {
  return value === null;
};

/**
 * is.undefined
 * Test if `value` is undefined.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is undefined, false otherwise
 * @api public
 */

is.undefined = function (value) {
  return value === undefined;
};

/**
 * Test arguments.
 */

/**
 * is.arguments
 * Test if `value` is an arguments object.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an arguments object, false otherwise
 * @api public
 */

is.arguments = function (value) {
  var isStandardArguments = '[object Arguments]' === toString.call(value);
  var isOldArguments = !is.array(value) && is.arraylike(value) && is.object(value) && is.fn(value.callee);
  return isStandardArguments || isOldArguments;
};

/**
 * Test array.
 */

/**
 * is.array
 * Test if 'value' is an array.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an array, false otherwise
 * @api public
 */

is.array = function (value) {
  return '[object Array]' === toString.call(value);
};

/**
 * is.arguments.empty
 * Test if `value` is an empty arguments object.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an empty arguments object, false otherwise
 * @api public
 */
is.arguments.empty = function (value) {
  return is.arguments(value) && value.length === 0;
};

/**
 * is.array.empty
 * Test if `value` is an empty array.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an empty array, false otherwise
 * @api public
 */
is.array.empty = function (value) {
  return is.array(value) && value.length === 0;
};

/**
 * is.arraylike
 * Test if `value` is an arraylike object.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an arguments object, false otherwise
 * @api public
 */

is.arraylike = function (value) {
  return !!value && !is.boolean(value)
    && owns.call(value, 'length')
    && isFinite(value.length)
    && is.number(value.length)
    && value.length >= 0;
};

/**
 * Test boolean.
 */

/**
 * is.boolean
 * Test if `value` is a boolean.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a boolean, false otherwise
 * @api public
 */

is.boolean = function (value) {
  return '[object Boolean]' === toString.call(value);
};

/**
 * is.false
 * Test if `value` is false.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is false, false otherwise
 * @api public
 */

is['false'] = function (value) {
  return is.boolean(value) && (value === false || value.valueOf() === false);
};

/**
 * is.true
 * Test if `value` is true.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is true, false otherwise
 * @api public
 */

is['true'] = function (value) {
  return is.boolean(value) && (value === true || value.valueOf() === true);
};

/**
 * Test date.
 */

/**
 * is.date
 * Test if `value` is a date.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a date, false otherwise
 * @api public
 */

is.date = function (value) {
  return '[object Date]' === toString.call(value);
};

/**
 * Test element.
 */

/**
 * is.element
 * Test if `value` is an html element.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an HTML Element, false otherwise
 * @api public
 */

is.element = function (value) {
  return value !== undefined
    && typeof HTMLElement !== 'undefined'
    && value instanceof HTMLElement
    && value.nodeType === 1;
};

/**
 * Test error.
 */

/**
 * is.error
 * Test if `value` is an error object.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an error object, false otherwise
 * @api public
 */

is.error = function (value) {
  return '[object Error]' === toString.call(value);
};

/**
 * Test function.
 */

/**
 * is.fn / is.function (deprecated)
 * Test if `value` is a function.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a function, false otherwise
 * @api public
 */

is.fn = is['function'] = function (value) {
  var isAlert = typeof window !== 'undefined' && value === window.alert;
  return isAlert || '[object Function]' === toString.call(value);
};

/**
 * Test number.
 */

/**
 * is.number
 * Test if `value` is a number.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a number, false otherwise
 * @api public
 */

is.number = function (value) {
  return '[object Number]' === toString.call(value);
};

/**
 * is.infinite
 * Test if `value` is positive or negative infinity.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is positive or negative Infinity, false otherwise
 * @api public
 */
is.infinite = function (value) {
  return value === Infinity || value === -Infinity;
};

/**
 * is.decimal
 * Test if `value` is a decimal number.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a decimal number, false otherwise
 * @api public
 */

is.decimal = function (value) {
  return is.number(value) && !isActualNaN(value) && !is.infinite(value) && value % 1 !== 0;
};

/**
 * is.divisibleBy
 * Test if `value` is divisible by `n`.
 *
 * @param {Number} value value to test
 * @param {Number} n dividend
 * @return {Boolean} true if `value` is divisible by `n`, false otherwise
 * @api public
 */

is.divisibleBy = function (value, n) {
  var isDividendInfinite = is.infinite(value);
  var isDivisorInfinite = is.infinite(n);
  var isNonZeroNumber = is.number(value) && !isActualNaN(value) && is.number(n) && !isActualNaN(n) && n !== 0;
  return isDividendInfinite || isDivisorInfinite || (isNonZeroNumber && value % n === 0);
};

/**
 * is.int
 * Test if `value` is an integer.
 *
 * @param value to test
 * @return {Boolean} true if `value` is an integer, false otherwise
 * @api public
 */

is.int = function (value) {
  return is.number(value) && !isActualNaN(value) && value % 1 === 0;
};

/**
 * is.maximum
 * Test if `value` is greater than 'others' values.
 *
 * @param {Number} value value to test
 * @param {Array} others values to compare with
 * @return {Boolean} true if `value` is greater than `others` values
 * @api public
 */

is.maximum = function (value, others) {
  if (isActualNaN(value)) {
    throw new TypeError('NaN is not a valid value');
  } else if (!is.arraylike(others)) {
    throw new TypeError('second argument must be array-like');
  }
  var len = others.length;

  while (--len >= 0) {
    if (value < others[len]) {
      return false;
    }
  }

  return true;
};

/**
 * is.minimum
 * Test if `value` is less than `others` values.
 *
 * @param {Number} value value to test
 * @param {Array} others values to compare with
 * @return {Boolean} true if `value` is less than `others` values
 * @api public
 */

is.minimum = function (value, others) {
  if (isActualNaN(value)) {
    throw new TypeError('NaN is not a valid value');
  } else if (!is.arraylike(others)) {
    throw new TypeError('second argument must be array-like');
  }
  var len = others.length;

  while (--len >= 0) {
    if (value > others[len]) {
      return false;
    }
  }

  return true;
};

/**
 * is.nan
 * Test if `value` is not a number.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is not a number, false otherwise
 * @api public
 */

is.nan = function (value) {
  return !is.number(value) || value !== value;
};

/**
 * is.even
 * Test if `value` is an even number.
 *
 * @param {Number} value value to test
 * @return {Boolean} true if `value` is an even number, false otherwise
 * @api public
 */

is.even = function (value) {
  return is.infinite(value) || (is.number(value) && value === value && value % 2 === 0);
};

/**
 * is.odd
 * Test if `value` is an odd number.
 *
 * @param {Number} value value to test
 * @return {Boolean} true if `value` is an odd number, false otherwise
 * @api public
 */

is.odd = function (value) {
  return is.infinite(value) || (is.number(value) && value === value && value % 2 !== 0);
};

/**
 * is.ge
 * Test if `value` is greater than or equal to `other`.
 *
 * @param {Number} value value to test
 * @param {Number} other value to compare with
 * @return {Boolean}
 * @api public
 */

is.ge = function (value, other) {
  if (isActualNaN(value) || isActualNaN(other)) {
    throw new TypeError('NaN is not a valid value');
  }
  return !is.infinite(value) && !is.infinite(other) && value >= other;
};

/**
 * is.gt
 * Test if `value` is greater than `other`.
 *
 * @param {Number} value value to test
 * @param {Number} other value to compare with
 * @return {Boolean}
 * @api public
 */

is.gt = function (value, other) {
  if (isActualNaN(value) || isActualNaN(other)) {
    throw new TypeError('NaN is not a valid value');
  }
  return !is.infinite(value) && !is.infinite(other) && value > other;
};

/**
 * is.le
 * Test if `value` is less than or equal to `other`.
 *
 * @param {Number} value value to test
 * @param {Number} other value to compare with
 * @return {Boolean} if 'value' is less than or equal to 'other'
 * @api public
 */

is.le = function (value, other) {
  if (isActualNaN(value) || isActualNaN(other)) {
    throw new TypeError('NaN is not a valid value');
  }
  return !is.infinite(value) && !is.infinite(other) && value <= other;
};

/**
 * is.lt
 * Test if `value` is less than `other`.
 *
 * @param {Number} value value to test
 * @param {Number} other value to compare with
 * @return {Boolean} if `value` is less than `other`
 * @api public
 */

is.lt = function (value, other) {
  if (isActualNaN(value) || isActualNaN(other)) {
    throw new TypeError('NaN is not a valid value');
  }
  return !is.infinite(value) && !is.infinite(other) && value < other;
};

/**
 * is.within
 * Test if `value` is within `start` and `finish`.
 *
 * @param {Number} value value to test
 * @param {Number} start lower bound
 * @param {Number} finish upper bound
 * @return {Boolean} true if 'value' is is within 'start' and 'finish'
 * @api public
 */
is.within = function (value, start, finish) {
  if (isActualNaN(value) || isActualNaN(start) || isActualNaN(finish)) {
    throw new TypeError('NaN is not a valid value');
  } else if (!is.number(value) || !is.number(start) || !is.number(finish)) {
    throw new TypeError('all arguments must be numbers');
  }
  var isAnyInfinite = is.infinite(value) || is.infinite(start) || is.infinite(finish);
  return isAnyInfinite || (value >= start && value <= finish);
};

/**
 * Test object.
 */

/**
 * is.object
 * Test if `value` is an object.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is an object, false otherwise
 * @api public
 */

is.object = function (value) {
  return value && '[object Object]' === toString.call(value);
};

/**
 * is.hash
 * Test if `value` is a hash - a plain object literal.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a hash, false otherwise
 * @api public
 */

is.hash = function (value) {
  return is.object(value) && value.constructor === Object && !value.nodeType && !value.setInterval;
};

/**
 * Test regexp.
 */

/**
 * is.regexp
 * Test if `value` is a regular expression.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if `value` is a regexp, false otherwise
 * @api public
 */

is.regexp = function (value) {
  return '[object RegExp]' === toString.call(value);
};

/**
 * Test string.
 */

/**
 * is.string
 * Test if `value` is a string.
 *
 * @param {Mixed} value value to test
 * @return {Boolean} true if 'value' is a string, false otherwise
 * @api public
 */

is.string = function (value) {
  return '[object String]' === toString.call(value);
};


},{}],80:[function(require,module,exports){
(function () {
	"use strict";

	// modified from https://github.com/kriskowal/es5-shim
	var has = Object.prototype.hasOwnProperty,
		is = require('is'),
		forEach = require('foreach'),
		hasDontEnumBug = !({'toString': null}).propertyIsEnumerable('toString'),
		dontEnums = [
			"toString",
			"toLocaleString",
			"valueOf",
			"hasOwnProperty",
			"isPrototypeOf",
			"propertyIsEnumerable",
			"constructor"
		],
		keysShim;

	keysShim = function keys(object) {
		if (!is.object(object) && !is.array(object)) {
			throw new TypeError("Object.keys called on a non-object");
		}

		var name, theKeys = [];
		for (name in object) {
			if (has.call(object, name)) {
				theKeys.push(name);
			}
		}

		if (hasDontEnumBug) {
			forEach(dontEnums, function (dontEnum) {
				if (has.call(object, dontEnum)) {
					theKeys.push(dontEnum);
				}
			});
		}
		return theKeys;
	};

	module.exports = keysShim;
}());


},{"foreach":78,"is":79}],81:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter
var inherits     = require('util').inherits
var ranges       = require('string-range')
var fixRange     = require('level-fix-range')
var xtend        = require('xtend')
var Batch        = require('./batch')

inherits(SubDB, EventEmitter)

function SubDB (db, prefix, options) {
  if('string' === typeof options) {
    console.error('db.sublevel(name, seperator<string>) is depreciated')
    console.error('use db.sublevel(name, {sep: separator})) if you must')
    options = {sep: options}
  }
  if(!(this instanceof SubDB)) return new SubDB(db, prefix, options)
  if(!db)     throw new Error('must provide db')
  if(!prefix) throw new Error('must provide prefix')

  options = options || {}
  options.sep = options.sep || '\xff'

  this._parent = db
  this._options = options
  this.options = options
  this._prefix = prefix
  this._root = root(this)
  db.sublevels[prefix] = this
  this.sublevels = {}
  this.methods = {}
  var self = this
  this.hooks = {
    pre: function () {
      return self.pre.apply(self, arguments)
    },
    post: function () {
      return self.post.apply(self, arguments)
    }
  }
}

var SDB = SubDB.prototype

SDB._key = function (key) {
  var sep = this._options.sep
  return sep
    + this._prefix
    + sep
    + key
}

SDB._getOptsAndCb = function (opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
  return { opts: xtend(opts, this._options), cb: cb }
}

SDB.sublevel = function (prefix, options) {
  if(this.sublevels[prefix])
    return this.sublevels[prefix]
  return new SubDB(this, prefix, options || this._options)
}

SDB.put = function (key, value, opts, cb) {
  var res = this._getOptsAndCb(opts, cb)
  this._root.put(this.prefix(key), value, res.opts, res.cb)
}

SDB.get = function (key, opts, cb) {
  var res = this._getOptsAndCb(opts, cb)
  this._root.get(this.prefix(key), res.opts, res.cb)
}

SDB.del = function (key, opts, cb) {
  var res = this._getOptsAndCb(opts, cb)
  this._root.del(this.prefix(key), res.opts, res.cb)
}

SDB.batch = function (changes, opts, cb) {
  if(!Array.isArray(changes))
    return new Batch(this)
  var self = this,
      res = this._getOptsAndCb(opts, cb)
  changes.forEach(function (ch) {

    //OH YEAH, WE NEED TO VALIDATE THAT UPDATING THIS KEY/PREFIX IS ALLOWED
    if('string' === typeof ch.prefix)
      ch.key = ch.prefix + ch.key
    else
      ch.key = (ch.prefix || self).prefix(ch.key)

    if(ch.prefix) ch.prefix = null
  })
  this._root.batch(changes, res.opts, res.cb)
}

SDB._getKeyEncoding = function () {
  if(this.options.keyEncoding)
    return this.options.keyEncoding
  if(this._parent && this._parent._getKeyEncoding)
    return this._parent._getKeyEncoding()
}

SDB._getValueEncoding = function () {
  if(this.options.valueEncoding)
    return this.options.valueEncoding
  if(this._parent && this._parent._getValueEncoding)
    return this._parent._getValueEncoding()
}

SDB.prefix = function (key) {
  var sep = this._options.sep
  return this._parent.prefix() + sep + this._prefix + sep + (key || '')
}

SDB.keyStream =
SDB.createKeyStream = function (opts) {
  opts = opts || {}
  opts.keys = true
  opts.values = false
  return this.createReadStream(opts)
}

SDB.valueStream =
SDB.createValueStream = function (opts) {
  opts = opts || {}
  opts.keys = false
  opts.values = true
  opts.keys = false
  return this.createReadStream(opts)
}

function selectivelyMerge(_opts, opts) {
  [ 'valueEncoding'
  , 'encoding'
  , 'keyEncoding'
  , 'reverse'
  , 'values'
  , 'keys'
  , 'limit'
  , 'fillCache'
  ]
  .forEach(function (k) {
    if (opts.hasOwnProperty(k)) _opts[k] = opts[k]
  })
}

SDB.readStream =
SDB.createReadStream = function (opts) {
  opts = opts || {}
  var r = root(this)
  var p = this.prefix()

  var _opts = ranges.prefix(opts, p)
  selectivelyMerge(_opts, xtend(opts, this._options))

  var s = r.createReadStream(_opts)

  if(_opts.values === false) {
    var read = s.read
    if (read) {
      s.read = function (size) {
        var val = read.call(this, size)
        if (val) val = val.substring(p.length)
        return val
      }
    } else {
      var emit = s.emit
      s.emit = function (event, val) {
        if(event === 'data') {
          emit.call(this, 'data', val.substring(p.length))
        } else
          emit.call(this, event, val)
      }
    }
    return s
  } else if(_opts.keys === false)
    return s
  else {
    var read = s.read
    if (read) {
      s.read = function (size) {
        var d = read.call(this, size)
        if (d) d.key = d.key.substring(p.length)
        return d
      }
    } else {
      s.on('data', function (d) {
        //mutate the prefix!
        //this doesn't work for createKeyStream admittedly.
        d.key = d.key.substring(p.length)
      })
    }
    return s
  }
}


SDB.writeStream =
SDB.createWriteStream = function () {
  var r = root(this)
  var p = this.prefix()
  var ws = r.createWriteStream.apply(r, arguments)
  var write = ws.write

  var encoding = this._options.encoding
  var valueEncoding = this._options.valueEncoding
  var keyEncoding = this._options.keyEncoding

  // slight optimization, if no encoding was specified at all,
  // which will be the case most times, make write not check at all
  var nocheck = !encoding && !valueEncoding && !keyEncoding

  ws.write = nocheck
    ? function (data) {
        data.key = p + data.key
        return write.call(ws, data)
      }
    : function (data) {
        data.key = p + data.key

        // not merging all options here since this happens on every write and things could get slowed down
        // at this point we only consider encoding important to propagate
        if (encoding && typeof data.encoding === 'undefined')
          data.encoding = encoding
        if (valueEncoding && typeof data.valueEncoding === 'undefined')
          data.valueEncoding = valueEncoding
        if (keyEncoding && typeof data.keyEncoding === 'undefined')
          data.keyEncoding = keyEncoding

        return write.call(ws, data)
      }
  return ws
}

SDB.approximateSize = function () {
  var r = root(db)
  return r.approximateSize.apply(r, arguments)
}

function root(db) {
  if(!db._parent) return db
  return root(db._parent)
}

SDB.pre = function (range, hook) {
  if(!hook) hook = range, range = null
  range = ranges.prefix(range, this.prefix(), this._options.sep)
  var r = root(this._parent)
  var p = this.prefix()
  return r.hooks.pre(fixRange(range), function (ch, add, batch) {
    hook({
      key: ch.key.substring(p.length),
      value: ch.value,
      type: ch.type
    }, function (ch, _p) {
      //maybe remove the second add arg now
      //that op can have prefix?
      add(ch, ch.prefix ? _p : (_p || p))
    }, batch)
  })
}

SDB.post = function (range, hook) {
  if(!hook) hook = range, range = null
  var r = root(this._parent)
  var p = this.prefix()
  range = ranges.prefix(range, p, this._options.sep)
  return r.hooks.post(fixRange(range), function (data) {
    hook({key: data.key.substring(p.length), value: data.value, type: data.type})
  })
}

var exports = module.exports = SubDB


},{"./batch":69,"events":105,"level-fix-range":71,"string-range":74,"util":130,"xtend":76}],82:[function(require,module,exports){
var StringMap = require('stringmap')
var sublevel = require('level-sublevel')
var ASQ = require('asynquence')
var EventEmitter = require('events').EventEmitter
var Expirer = require('expire-unused-keys')

module.exports = function turnLevelUPDatabaseIntoACache(levelUpDb, getter, options) {
	"use strict"

	options = options || {}

	options = {
		refreshEvery: options.refreshEvery || 12 * 60 * 60 * 1000,
		checkToSeeIfItemsNeedToBeRefreshedEvery: options.checkToSeeIfItemsNeedToBeRefreshedEvery || 1000,
		ttl: (options.ttl || 7 * 24 * 60 * 60 * 1000), // SEVEN DAYS OH MAN
		comparison: options.comparison || function defaultComparison(a, b) { return a === b }
	}

	var db = sublevel(levelUpDb)
	var items = db.sublevel('items')
	var itemExpirer = new Expirer(options.ttl, db.sublevel('item-expirations', { valueEncoding: 'utf8' }), options.checkToSeeIfItemsNeedToBeRefreshedEvery)
	var refreshTimestamps = new Expirer(options.refreshEvery, db.sublevel('refresh', { valueEncoding: 'utf8' }), options.checkToSeeIfItemsNeedToBeRefreshedEvery)
	var currentlyRefreshing = new StringMap()
	var cache = new EventEmitter()

	refreshTimestamps.on('expire', getRemoteValue)
	itemExpirer.on('expire', expireItem)

	function stop() {
		refreshTimestamps.stop()
		itemExpirer.stop()
	}

	function expireItem(key) {
		items.del(key)
		refreshTimestamps.forget(key)
		var inTheMidstOfRefreshing = currentlyRefreshing.get(key)
		if (inTheMidstOfRefreshing) {
			inTheMidstOfRefreshing.abort()
			currentlyRefreshing.remove(key)
		}
	}

	// A getRemoteValue call without a callback function refreshes the cached value
	function getRemoteValue(key, cb) {
		var sequence = currentlyRefreshing.get(key)

		if (!sequence) {
			sequence = ASQ(function(done) {
				getter(key, function(remoteError, value) {
					items.get(key, function(localError, previousValue) {
						// Make sure the sequence wasn't pulled out from under us
						if (!remoteError && currentlyRefreshing.has(key)) {
							items.put(key, value)
							refreshTimestamps.touch(key)

							cache.emit('load', key, value)

							if ((localError && localError.notFound) || !options.comparison(previousValue, value)) {
								cache.emit('change', key, value, previousValue)
							}
						}
						done(remoteError, value)
					})
				})
			})
			currentlyRefreshing.set(key, sequence)
			sequence.then(function(done, err, value) {
				currentlyRefreshing.remove(key)
				done(err, value)
			})
		}

		if (typeof cb === 'function') {
			sequence.then(function(done, err, value) {
				cb(err, value)
				done(err, value)
			})
		}
	}

	function wrapCallbackWithAnExpirationTouch(key, cb) {
		return function(err, value) {
			itemExpirer.touch(key)
			if (typeof cb === 'function') {
				cb(err, value)
			}
		}
	}

	cache.stop = stop
	cache.get = function get(key, cb) {
		items.get(key, function(err, value) {
			if (err && err.notFound) {
				getRemoteValue(key, wrapCallbackWithAnExpirationTouch(key, cb))
			} else if (cb) {
				wrapCallbackWithAnExpirationTouch(key, cb)(err, value)
			}
		})
	}
	cache.getLocal = function getLocal(key, cb) {
		items.get(key, wrapCallbackWithAnExpirationTouch(key, cb))
	}
	cache.refresh = function refresh(key, cb) {
		getRemoteValue(key, wrapCallbackWithAnExpirationTouch(key, cb))
	}

	return cache
}

},{"asynquence":67,"events":105,"expire-unused-keys":83,"level-sublevel":70,"stringmap":84}],83:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter

function onlyLetOneTaskRunAtATime(fnTask) {
	var running = false

	function done() {
		running = false
	}

	return function run() {
		if (!running) {
			running = true
			var args = Array.prototype.slice.call(arguments, 0)
			args.push(done)
			fnTask.apply(null, args)
		}
	}
}

module.exports = function Expirer(timeoutMs, db, checkIntervalMs) {
	var expirer = new EventEmitter()

	var forgotten = []

	var checkForExpiredKeys = onlyLetOneTaskRunAtATime(function check(done) {
		var now = new Date().getTime()
		var batchKeys = []
		db.createReadStream().on('data', function(data) {
			if (parseInt(data.value) + timeoutMs < now) {
				batchKeys.push(data.key)
			}
		}).on('end', function() {
			var batch = db.batch()

			// Need to make sure that none of these keys were "forgotten" since we opened the read stream
			batchKeys.filter(function(key) {
				return forgotten.indexOf(key) === -1
			}).forEach(function(key) {
				expirer.emit('expire', key)
				batch.del(key)
			})

			forgotten = []

			batch.write(done)
		})
	})

	expirer.on('touch', function touch(key) {
		db.put(key, new Date().getTime())
	})

	expirer.on('forget', function forget(key) {
		forgotten.push(key)
		db.del(key)
	})

	var interval = setInterval(checkForExpiredKeys, checkIntervalMs || 1000)

	expirer.touch = expirer.emit.bind(expirer, 'touch')
	expirer.forget = expirer.emit.bind(expirer, 'forget')
	expirer.stop = function stop() {
		clearInterval(interval)
	}

	return expirer
}

},{"events":105}],84:[function(require,module,exports){
// stringmap.js
// MIT licensed, see LICENSE file
// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

var StringMap = (function() {
    "use strict";

    // to save us a few characters
    var hasOwnProperty = Object.prototype.hasOwnProperty;

    var create = (function() {
        function hasOwnEnumerableProps(obj) {
            for (var prop in obj) {
                if (hasOwnProperty.call(obj, prop)) {
                    return true;
                }
            }
            return false;
        }
        // FF <= 3.6:
        // o = {}; o.hasOwnProperty("__proto__" or "__count__" or "__parent__") => true
        // o = {"__proto__": null}; Object.prototype.hasOwnProperty.call(o, "__proto__" or "__count__" or "__parent__") => false
        function hasOwnPollutedProps(obj) {
            return hasOwnProperty.call(obj, "__count__") || hasOwnProperty.call(obj, "__parent__");
        }

        var useObjectCreate = false;
        if (typeof Object.create === "function") {
            if (!hasOwnEnumerableProps(Object.create(null))) {
                useObjectCreate = true;
            }
        }
        if (useObjectCreate === false) {
            if (hasOwnEnumerableProps({})) {
                throw new Error("StringMap environment error 0, please file a bug at https://github.com/olov/stringmap/issues");
            }
        }
        // no throw yet means we can create objects without own enumerable props (safe-guard against VMs and shims)

        var o = (useObjectCreate ? Object.create(null) : {});
        var useProtoClear = false;
        if (hasOwnPollutedProps(o)) {
            o.__proto__ = null;
            if (hasOwnEnumerableProps(o) || hasOwnPollutedProps(o)) {
                throw new Error("StringMap environment error 1, please file a bug at https://github.com/olov/stringmap/issues");
            }
            useProtoClear = true;
        }
        // no throw yet means we can create objects without own polluted props (safe-guard against VMs and shims)

        return function() {
            var o = (useObjectCreate ? Object.create(null) : {});
            if (useProtoClear) {
                o.__proto__ = null;
            }
            return o;
        };
    })();

    // stringmap ctor
    function stringmap(optional_object) {
        // use with or without new
        if (!(this instanceof stringmap)) {
            return new stringmap(optional_object);
        }
        this.obj = create();
        this.hasProto = false; // false (no __proto__ key) or true (has __proto__ key)
        this.proto = undefined; // value for __proto__ key when hasProto is true, undefined otherwise

        if (optional_object) {
            this.setMany(optional_object);
        }
    };

    // primitive methods that deals with data representation
    stringmap.prototype.has = function(key) {
        // The type-check of key in has, get, set and delete is important because otherwise an object
        // {toString: function() { return "__proto__"; }} can avoid the key === "__proto__" test.
        // The alternative to type-checking would be to force string conversion, i.e. key = String(key);
        if (typeof key !== "string") {
            throw new Error("StringMap expected string key");
        }
        return (key === "__proto__" ?
            this.hasProto :
            hasOwnProperty.call(this.obj, key));
    };

    stringmap.prototype.get = function(key) {
        if (typeof key !== "string") {
            throw new Error("StringMap expected string key");
        }
        return (key === "__proto__" ?
            this.proto :
            (hasOwnProperty.call(this.obj, key) ? this.obj[key] : undefined));
    };

    stringmap.prototype.set = function(key, value) {
        if (typeof key !== "string") {
            throw new Error("StringMap expected string key");
        }
        if (key === "__proto__") {
            this.hasProto = true;
            this.proto = value;
        } else {
            this.obj[key] = value;
        }
    };

    stringmap.prototype.remove = function(key) {
        if (typeof key !== "string") {
            throw new Error("StringMap expected string key");
        }
        var didExist = this.has(key);
        if (key === "__proto__") {
            this.hasProto = false;
            this.proto = undefined;
        } else {
            delete this.obj[key];
        }
        return didExist;
    };

    // alias remove to delete but beware:
    // sm.delete("key"); // OK in ES5 and later
    // sm['delete']("key"); // OK in all ES versions
    // sm.remove("key"); // OK in all ES versions
    stringmap.prototype['delete'] = stringmap.prototype.remove;

    stringmap.prototype.isEmpty = function() {
        for (var key in this.obj) {
            if (hasOwnProperty.call(this.obj, key)) {
                return false;
            }
        }
        return !this.hasProto;
    };

    stringmap.prototype.size = function() {
        var len = 0;
        for (var key in this.obj) {
            if (hasOwnProperty.call(this.obj, key)) {
                ++len;
            }
        }
        return (this.hasProto ? len + 1 : len);
    };

    stringmap.prototype.keys = function() {
        var keys = [];
        for (var key in this.obj) {
            if (hasOwnProperty.call(this.obj, key)) {
                keys.push(key);
            }
        }
        if (this.hasProto) {
            keys.push("__proto__");
        }
        return keys;
    };

    stringmap.prototype.values = function() {
        var values = [];
        for (var key in this.obj) {
            if (hasOwnProperty.call(this.obj, key)) {
                values.push(this.obj[key]);
            }
        }
        if (this.hasProto) {
            values.push(this.proto);
        }
        return values;
    };

    stringmap.prototype.items = function() {
        var items = [];
        for (var key in this.obj) {
            if (hasOwnProperty.call(this.obj, key)) {
                items.push([key, this.obj[key]]);
            }
        }
        if (this.hasProto) {
            items.push(["__proto__", this.proto]);
        }
        return items;
    };


    // methods that rely on the above primitives
    stringmap.prototype.setMany = function(object) {
        if (object === null || (typeof object !== "object" && typeof object !== "function")) {
            throw new Error("StringMap expected Object");
        }
        for (var key in object) {
            if (hasOwnProperty.call(object, key)) {
                this.set(key, object[key]);
            }
        }
        return this;
    };

    stringmap.prototype.merge = function(other) {
        var keys = other.keys();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            this.set(key, other.get(key));
        }
        return this;
    };

    stringmap.prototype.map = function(fn) {
        var keys = this.keys();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            keys[i] = fn(this.get(key), key); // re-use keys array for results
        }
        return keys;
    };

    stringmap.prototype.forEach = function(fn) {
        var keys = this.keys();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            fn(this.get(key), key);
        }
    };

    stringmap.prototype.clone = function() {
        var other = stringmap();
        return other.merge(this);
    };

    stringmap.prototype.toString = function() {
        var self = this;
        return "{" + this.keys().map(function(key) {
            return JSON.stringify(key) + ":" + JSON.stringify(self.get(key));
        }).join(",") + "}";
    };

    return stringmap;
})();

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = StringMap;
}

},{}],85:[function(require,module,exports){
var http = require('http')
var url = require('url')
var concat = require('concat-stream')
var parser = require('text-metadata-parser')

module.exports = function NoddityRetrieval(root) {
	var lookup = function(file, cb, parse) {
		var data = ''
		var fullPath = url.resolve(root, file)
		http.get(url.parse(fullPath), function(res) {
			res.setEncoding && res.setEncoding('utf8')
			res.on('data', function(chunk) {
				if (data !== null) {
					data += chunk
				}
			})
			res.on('error', function(err) {
				data = null
				cb(err)
			})
			res.on('end', function(chunk) {
				if (data !== null) {
					if (typeof chunk !== 'undefined') {
						data += chunk
					}

					if (res.statusCode !== 200) {
						cb(new Error("Lookup of " + fullPath + " returned status " + res.statusCode + "\n========\n" + data))
					} else {
						var information = null
						try {
							information = parse(data)
						} catch (e) {
							cb(new Error("Error parsing file with contents:\n" + data + "\n==========\n" + e.message))
						}

						if (information !== null) {
							cb(false, information)
						}
					}
				}
			})
		}).on('error', function(err) {
			cb(new Error("Lookup of " + fullPath + " failed\n========\n" + err.message))
		})
	}

	return {
		getIndex: function(cb) {
			lookup('index.json', cb, JSON.parse)
		},
		getPost: function(filename, cb) {
			lookup(filename, cb, function(textToParse) {
				var post = parser(textToParse, {
					date: 'date'
				})
				post.filename = filename
				return post
			});
		}
	}
}

},{"concat-stream":86,"http":106,"text-metadata-parser":100,"url":128}],86:[function(require,module,exports){
var stream = require('stream')
var bops = require('bops')
var util = require('util')

function ConcatStream(cb) {
  stream.Stream.call(this)
  this.writable = true
  if (cb) this.cb = cb
  this.body = []
  this.on('error', function(err) {
    // no-op
  })
}

util.inherits(ConcatStream, stream.Stream)

ConcatStream.prototype.write = function(chunk) {
  this.emit('data', chunk)
  this.body.push(chunk)
}

ConcatStream.prototype.destroy = function() {}

ConcatStream.prototype.arrayConcat = function(arrs) {
  if (arrs.length === 0) return []
  if (arrs.length === 1) return arrs[0]
  return arrs.reduce(function (a, b) { return a.concat(b) })
}

ConcatStream.prototype.isArray = function(arr) {
  return Array.isArray(arr)
}

ConcatStream.prototype.getBody = function () {
  if (this.body.length === 0) return
  if (typeof(this.body[0]) === "string") return this.body.join('')
  if (this.isArray(this.body[0])) return this.arrayConcat(this.body)
  if (bops.is(this.body[0])) return bops.join(this.body)
  return this.body
}

ConcatStream.prototype.end = function() {
  this.emit('end')
  if (this.cb) this.cb(this.getBody())
}

module.exports = function(cb) {
  return new ConcatStream(cb)
}

module.exports.ConcatStream = ConcatStream

},{"bops":87,"stream":121,"util":130}],87:[function(require,module,exports){
arguments[4][17][0].apply(exports,arguments)
},{"./copy.js":90,"./create.js":91,"./from.js":92,"./is.js":93,"./join.js":94,"./read.js":96,"./subarray.js":97,"./to.js":98,"./write.js":99}],88:[function(require,module,exports){
module.exports=require(18)
},{}],89:[function(require,module,exports){
module.exports=require(19)
},{}],90:[function(require,module,exports){
module.exports = copy

var slice = [].slice

function copy(source, target, target_start, source_start, source_end) {
  target_start = arguments.length < 3 ? 0 : target_start
  source_start = arguments.length < 4 ? 0 : source_start
  source_end = arguments.length < 5 ? source.length : source_end

  if(source_end === source_start) {
    return
  }

  if(target.length === 0 || source.length === 0) {
    return
  }

  if(source_end > source.length) {
    source_end = source.length
  }

  if(target.length - target_start < source_end - source_start) {
    source_end = target.length - target_start + start
  }

  if(source.buffer !== target.buffer) {
    return fast_copy(source, target, target_start, source_start, source_end)
  }
  return slow_copy(source, target, target_start, source_start, source_end)
}

function fast_copy(source, target, target_start, source_start, source_end) {
  var len = (source_end - source_start) + target_start

  for(var i = target_start, j = source_start;
      i < len;
      ++i,
      ++j) {
    target[i] = source[j]
  }
}

function slow_copy(from, to, j, i, jend) {
  // the buffers could overlap.
  var iend = jend + i
    , tmp = new Uint8Array(slice.call(from, i, iend))
    , x = 0

  for(; i < iend; ++i, ++x) {
    to[j++] = tmp[x]
  }
}

},{}],91:[function(require,module,exports){
module.exports=require(21)
},{}],92:[function(require,module,exports){
module.exports=require(40)
},{"base64-js":88}],93:[function(require,module,exports){
module.exports=require(23)
},{}],94:[function(require,module,exports){
module.exports=require(24)
},{}],95:[function(require,module,exports){
module.exports=require(25)
},{}],96:[function(require,module,exports){
module.exports=require(26)
},{"./mapped.js":95}],97:[function(require,module,exports){
module.exports=require(27)
},{}],98:[function(require,module,exports){
module.exports=require(28)
},{"base64-js":88,"to-utf8":89}],99:[function(require,module,exports){
module.exports=require(29)
},{"./mapped.js":95}],100:[function(require,module,exports){
var TEXT_METADATA_PARSER = {
	make_value: {
		boolean: function(value) {
			return value.toString().toLowerCase() !== 'false'
				&& !(/^\d+$/.test(value)
				&& parseInt(value) !== 0);
		},
		number: function(value) {
			return parseFloat(value);
		},
		string: function(value) {
			return value.toString();
		},
		date: function(value) {
			return new Date(value);
		}
	},

	parseString: function(text) {
		var lines = text.split("\n");
		var done_reading_metadata = false;
		var done_reading_whitespace = false;
		var parsed_object = { content: "", metadata: {} };

		for (var i = 0; i < lines.length && !done_reading_whitespace; i++) {
			if (!done_reading_metadata) {
				var found_metadata = /^([^:]+):\s*([^\r\n]+)\s*$/.exec(lines[i]);
				if (found_metadata && found_metadata.length === 3) {
					var property = found_metadata[1];
					parsed_object.metadata[property] = found_metadata[2];
				} else if (i === 0) {
					return { content: text, metadata: {} }
				} else{
					done_reading_metadata = true;
				}
			} else if (!done_reading_whitespace) {
				done_reading_whitespace = !/^\s*$/.test(lines[i]);
			}
		}

		parsed_object.content = lines.slice(i - 1).join("\n");

		return parsed_object;
	},

	mapProperties: function(object, properties, iterator) {
		if (Array.isArray(properties)) {
			properties.forEach(function(property) {
				if (typeof object[property] !== 'undefined') {
					object[property] = iterator(object[property]);
				}
			});
			return object;
		} else {
			return TEXT_METADATA_PARSER.mapProperties(object, [properties.toString()], iterator);
		}
	},

	mapDefaults: function(object, defaults) {
		for (property in defaults) {
			if (typeof object[property] === 'undefined') {
				object[property] = defaults[property];
			}
		}
	},

	parse: function(text, options) {
		options = options || {}
		var parsed = TEXT_METADATA_PARSER.parseString(text);

		TEXT_METADATA_PARSER.mapDefaults(parsed.metadata, options.default || {});

		TEXT_METADATA_PARSER.mapProperties(
			parsed.metadata, options.boolean || [], TEXT_METADATA_PARSER.make_value.boolean);
		TEXT_METADATA_PARSER.mapProperties(
			parsed.metadata, options.number || [], TEXT_METADATA_PARSER.make_value.number);
		TEXT_METADATA_PARSER.mapProperties(
			parsed.metadata, options.string || [], TEXT_METADATA_PARSER.make_value.string);
		TEXT_METADATA_PARSER.mapProperties(
			parsed.metadata, options.date || [], TEXT_METADATA_PARSER.make_value.date);

		return parsed;
	}
}

if (typeof module !== 'undefined'
	&& typeof module.exports !== 'undefined') {
	module.exports = TEXT_METADATA_PARSER.parse;
}

},{}],101:[function(require,module,exports){
var extend = require('extend')

var defaultCastFunctions = {
	boolean: function(value) {
		return value.toString().toLowerCase() !== 'false'
			&& !(/^\d+$/.test(value)
			&& parseInt(value) !== 0)
	},
	number: function(value) {
		return parseFloat(value)
	},
	string: function(value) {
		return value.toString()
	},
	date: function(value) {
		return new Date(value)
	}
}

function convertInputTypes(typeOptions) {
	return Object.keys(typeOptions).reduce(function(memo, property) {
		return extend(true, memo, optionsArrayToTypesObject(typeOptions[property], property))
	}, {})
}

function optionsArrayToTypesObject(arr, type) {
	if (typeof arr === 'string') {
		return optionsArrayToTypesObject([arr],type)
	} else if (Array.isArray(arr)) {
		return arr.reduce(function(memo, curr) {
			memo[curr] = type
			return memo
		}, {})
	} else {
		return {}
	}
}

function castAllProperties(types, obj, casters) {
	Object.keys(obj).filter(function (propertyName) {
		return typeof types[propertyName] !== 'undefined'
	}).forEach(function (propertyName) {
		var coerce = casters[types[propertyName]]
		if (typeof coerce === 'function') {
			obj[propertyName] = coerce(obj[propertyName])
		}
	})
	return obj
}

function Caster(types, defaults, castFunctions) {
	var cast = function cast(obj) {
		var withDefaults = extend(true, {}, defaults, obj)
		return castAllProperties(types, withDefaults, castFunctions)
	}

	cast.extend = function extendCaster(options) {
		var newDefaults = options.default
		delete options.default

		var newCastFunctions = options.cast
		delete options.cast

		var newTypes = convertInputTypes(options)

		return new Caster(
			extend(true, {}, types, newTypes),
			extend(true, {}, defaults, newDefaults),
			extend(true, {}, defaultCastFunctions, castFunctions, newCastFunctions))
	}

	cast.getLevelUpEncoding = function getLevelUpEncoding() {
		return {
			buffer: false,
			type: 'weak-type-wizard',
			encode: JSON.stringify,
			decode: function decode(json) {
				return cast(JSON.parse(json))
			}
		}
	}

	return cast
}

var defaultCaster = new Caster({}, {})

module.exports = function Wizard(options) {
	return defaultCaster.extend(options)
}

},{"extend":68}],102:[function(require,module,exports){
/*
	
	Ractive - v0.3.9 - 2013-12-31
	==============================================================

	Next-generation DOM manipulation - http://ractivejs.org
	Follow @RactiveJS for updates

	--------------------------------------------------------------

	Copyright 2013 2013 Rich Harris and contributors

	Permission is hereby granted, free of charge, to any person
	obtaining a copy of this software and associated documentation
	files (the "Software"), to deal in the Software without
	restriction, including without limitation the rights to use,
	copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the
	Software is furnished to do so, subject to the following
	conditions:

	The above copyright notice and this permission notice shall be
	included in all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
	EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
	OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
	NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
	HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
	WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
	FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
	OTHER DEALINGS IN THE SOFTWARE.

*/

(function ( global ) {



var config_svg = function () {
        
        if (typeof document === 'undefined') {
            return;
        }
        return document && document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1');
    }();
var utils_create = function () {
        
        var create;
        try {
            Object.create(null);
            create = Object.create;
        } catch (err) {
            create = function () {
                var F = function () {
                };
                return function (proto, props) {
                    var obj;
                    if (proto === null) {
                        return {};
                    }
                    F.prototype = proto;
                    obj = new F();
                    if (props) {
                        Object.defineProperties(obj, props);
                    }
                    return obj;
                };
            }();
        }
        return create;
    }();
var config_namespaces = {
        html: 'http://www.w3.org/1999/xhtml',
        mathml: 'http://www.w3.org/1998/Math/MathML',
        svg: 'http://www.w3.org/2000/svg',
        xlink: 'http://www.w3.org/1999/xlink',
        xml: 'http://www.w3.org/XML/1998/namespace',
        xmlns: 'http://www.w3.org/2000/xmlns/'
    };
var utils_createElement = function (svg, namespaces) {
        
        if (!svg) {
            return function (type, ns) {
                if (ns && ns !== namespaces.html) {
                    throw 'This browser does not support namespaces other than http://www.w3.org/1999/xhtml. The most likely cause of this error is that you\'re trying to render SVG in an older browser. See https://github.com/RactiveJS/Ractive/wiki/SVG-and-older-browsers for more information';
                }
                return document.createElement(type);
            };
        } else {
            return function (type, ns) {
                if (!ns) {
                    return document.createElement(type);
                }
                return document.createElementNS(ns, type);
            };
        }
    }(config_svg, config_namespaces);
var config_isClient = function () {
        
        if (typeof document === 'object') {
            return true;
        }
        return false;
    }();
var utils_defineProperty = function (isClient) {
        
        try {
            Object.defineProperty({}, 'test', { value: 0 });
            if (isClient) {
                Object.defineProperty(document.createElement('div'), 'test', { value: 0 });
            }
            return Object.defineProperty;
        } catch (err) {
            return function (obj, prop, desc) {
                obj[prop] = desc.value;
            };
        }
    }(config_isClient);
var utils_defineProperties = function (createElement, defineProperty, isClient) {
        
        try {
            try {
                Object.defineProperties({}, { test: { value: 0 } });
            } catch (err) {
                throw err;
            }
            if (isClient) {
                Object.defineProperties(createElement('div'), { test: { value: 0 } });
            }
            return Object.defineProperties;
        } catch (err) {
            return function (obj, props) {
                var prop;
                for (prop in props) {
                    if (props.hasOwnProperty(prop)) {
                        defineProperty(obj, prop, props[prop]);
                    }
                }
            };
        }
    }(utils_createElement, utils_defineProperty, config_isClient);
var utils_normaliseKeypath = function () {
        
        var regex = /\[\s*(\*|[0-9]|[1-9][0-9]+)\s*\]/g;
        return function (keypath) {
            return (keypath || '').replace(regex, '.$1');
        };
    }();
var registries_adaptors = {};
var config_types = {
        TEXT: 1,
        INTERPOLATOR: 2,
        TRIPLE: 3,
        SECTION: 4,
        INVERTED: 5,
        CLOSING: 6,
        ELEMENT: 7,
        PARTIAL: 8,
        COMMENT: 9,
        DELIMCHANGE: 10,
        MUSTACHE: 11,
        TAG: 12,
        ATTRIBUTE: 13,
        COMPONENT: 15,
        NUMBER_LITERAL: 20,
        STRING_LITERAL: 21,
        ARRAY_LITERAL: 22,
        OBJECT_LITERAL: 23,
        BOOLEAN_LITERAL: 24,
        GLOBAL: 26,
        KEY_VALUE_PAIR: 27,
        REFERENCE: 30,
        REFINEMENT: 31,
        MEMBER: 32,
        PREFIX_OPERATOR: 33,
        BRACKETED: 34,
        CONDITIONAL: 35,
        INFIX_OPERATOR: 36,
        INVOCATION: 40
    };
var utils_isArray = function () {
        
        var toString = Object.prototype.toString;
        return function (thing) {
            return toString.call(thing) === '[object Array]';
        };
    }();
var shared_clearCache = function () {
        
        return function clearCache(ractive, keypath) {
            var cacheMap, wrappedProperty;
            if (wrappedProperty = ractive._wrapped[keypath]) {
                if (wrappedProperty.teardown() !== false) {
                    ractive._wrapped[keypath] = null;
                }
            }
            ractive._cache[keypath] = undefined;
            if (cacheMap = ractive._cacheMap[keypath]) {
                while (cacheMap.length) {
                    clearCache(ractive, cacheMap.pop());
                }
            }
        };
    }();
var shared_getValueFromCheckboxes = function () {
        
        return function (ractive, keypath) {
            var value, checkboxes, checkbox, len, i, rootEl;
            value = [];
            rootEl = ractive.rendered ? ractive.el : ractive.fragment.docFrag;
            checkboxes = rootEl.querySelectorAll('input[type="checkbox"][name="{{' + keypath + '}}"]');
            len = checkboxes.length;
            for (i = 0; i < len; i += 1) {
                checkbox = checkboxes[i];
                if (checkbox.hasAttribute('checked') || checkbox.checked) {
                    value[value.length] = checkbox._ractive.value;
                }
            }
            return value;
        };
    }();
var shared_preDomUpdate = function (getValueFromCheckboxes) {
        
        return function (ractive) {
            var deferred, evaluator, selectValue, attribute, keypath, radio;
            deferred = ractive._deferred;
            while (evaluator = deferred.evals.pop()) {
                evaluator.update().deferred = false;
            }
            while (selectValue = deferred.selectValues.pop()) {
                selectValue.deferredUpdate();
            }
            while (attribute = deferred.attrs.pop()) {
                attribute.update().deferred = false;
            }
            while (keypath = deferred.checkboxes.pop()) {
                ractive.set(keypath, getValueFromCheckboxes(ractive, keypath));
            }
            while (radio = deferred.radios.pop()) {
                radio.update();
            }
        };
    }(shared_getValueFromCheckboxes);
var shared_postDomUpdate = function () {
        
        return function (ractive) {
            var deferred, focusable, query, decorator, transition, observer;
            deferred = ractive._deferred;
            if (focusable = deferred.focusable) {
                focusable.focus();
                deferred.focusable = null;
            }
            while (query = deferred.liveQueries.pop()) {
                query._sort();
            }
            while (decorator = deferred.decorators.pop()) {
                decorator.init();
            }
            while (transition = deferred.transitions.pop()) {
                transition.init();
            }
            while (observer = deferred.observers.pop()) {
                observer.update();
            }
        };
    }();
var shared_makeTransitionManager = function () {
        
        var makeTransitionManager = function (root, callback) {
            var transitionManager, elementsToDetach, detachNodes, nodeHasNoTransitioningChildren;
            if (root._parent && root._parent._transitionManager) {
                return root._parent._transitionManager;
            }
            elementsToDetach = [];
            detachNodes = function () {
                var i, element;
                i = elementsToDetach.length;
                while (i--) {
                    element = elementsToDetach[i];
                    if (nodeHasNoTransitioningChildren(element.node)) {
                        element.detach();
                        elementsToDetach.splice(i, 1);
                    }
                }
            };
            nodeHasNoTransitioningChildren = function (node) {
                var i, candidate;
                i = transitionManager.active.length;
                while (i--) {
                    candidate = transitionManager.active[i];
                    if (node.contains(candidate)) {
                        return false;
                    }
                }
                return true;
            };
            transitionManager = {
                active: [],
                push: function (node) {
                    transitionManager.active[transitionManager.active.length] = node;
                },
                pop: function (node) {
                    var index;
                    index = transitionManager.active.indexOf(node);
                    if (index === -1) {
                        return;
                    }
                    transitionManager.active.splice(index, 1);
                    detachNodes();
                    if (!transitionManager.active.length && transitionManager._ready) {
                        transitionManager.complete();
                    }
                },
                complete: function () {
                    if (callback) {
                        callback.call(root);
                    }
                },
                ready: function () {
                    detachNodes();
                    transitionManager._ready = true;
                    if (!transitionManager.active.length) {
                        transitionManager.complete();
                    }
                },
                detachWhenReady: function (element) {
                    elementsToDetach[elementsToDetach.length] = element;
                }
            };
            return transitionManager;
        };
        return makeTransitionManager;
    }();
var shared_notifyDependants = function () {
        
        var notifyDependants, lastKey, starMaps = {};
        lastKey = /[^\.]+$/;
        notifyDependants = function (ractive, keypath, onlyDirect) {
            var i;
            if (ractive._patternObservers.length) {
                notifyPatternObservers(ractive, keypath, keypath, onlyDirect, true);
            }
            for (i = 0; i < ractive._deps.length; i += 1) {
                notifyDependantsAtPriority(ractive, keypath, i, onlyDirect);
            }
        };
        notifyDependants.multiple = function (ractive, keypaths, onlyDirect) {
            var i, j, len;
            len = keypaths.length;
            if (ractive._patternObservers.length) {
                i = len;
                while (i--) {
                    notifyPatternObservers(ractive, keypaths[i], keypaths[i], onlyDirect, true);
                }
            }
            for (i = 0; i < ractive._deps.length; i += 1) {
                if (ractive._deps[i]) {
                    j = len;
                    while (j--) {
                        notifyDependantsAtPriority(ractive, keypaths[j], i, onlyDirect);
                    }
                }
            }
        };
        return notifyDependants;
        function notifyDependantsAtPriority(ractive, keypath, priority, onlyDirect) {
            var depsByKeypath = ractive._deps[priority];
            if (!depsByKeypath) {
                return;
            }
            updateAll(depsByKeypath[keypath]);
            if (onlyDirect) {
                return;
            }
            cascade(ractive._depsMap[keypath], ractive, priority);
        }
        function updateAll(deps) {
            var i, len;
            if (deps) {
                len = deps.length;
                for (i = 0; i < len; i += 1) {
                    deps[i].update();
                }
            }
        }
        function cascade(childDeps, ractive, priority, onlyDirect) {
            var i;
            if (childDeps) {
                i = childDeps.length;
                while (i--) {
                    notifyDependantsAtPriority(ractive, childDeps[i], priority, onlyDirect);
                }
            }
        }
        function notifyPatternObservers(ractive, registeredKeypath, actualKeypath, isParentOfChangedKeypath, isTopLevelCall) {
            var i, patternObserver, children, child, key, childActualKeypath, potentialWildcardMatches, cascade;
            i = ractive._patternObservers.length;
            while (i--) {
                patternObserver = ractive._patternObservers[i];
                if (patternObserver.regex.test(actualKeypath)) {
                    patternObserver.update(actualKeypath);
                }
            }
            if (isParentOfChangedKeypath) {
                return;
            }
            cascade = function (keypath) {
                if (children = ractive._depsMap[keypath]) {
                    i = children.length;
                    while (i--) {
                        child = children[i];
                        key = lastKey.exec(child)[0];
                        childActualKeypath = actualKeypath + '.' + key;
                        notifyPatternObservers(ractive, child, childActualKeypath);
                    }
                }
            };
            if (isTopLevelCall) {
                potentialWildcardMatches = getPotentialWildcardMatches(actualKeypath);
                potentialWildcardMatches.forEach(cascade);
            } else {
                cascade(registeredKeypath);
            }
        }
        function getPotentialWildcardMatches(keypath) {
            var keys, starMap, mapper, i, result, wildcardKeypath;
            keys = keypath.split('.');
            starMap = getStarMap(keys.length);
            result = [];
            mapper = function (star, i) {
                return star ? '*' : keys[i];
            };
            i = starMap.length;
            while (i--) {
                wildcardKeypath = starMap[i].map(mapper).join('.');
                if (!result[wildcardKeypath]) {
                    result[result.length] = wildcardKeypath;
                    result[wildcardKeypath] = true;
                }
            }
            return result;
        }
        function getStarMap(num) {
            var ones = '', max, binary, starMap, mapper, i;
            if (!starMaps[num]) {
                starMap = [];
                while (ones.length < num) {
                    ones += 1;
                }
                max = parseInt(ones, 2);
                mapper = function (digit) {
                    return digit === '1';
                };
                for (i = 0; i <= max; i += 1) {
                    binary = i.toString(2);
                    while (binary.length < num) {
                        binary = '0' + binary;
                    }
                    starMap[i] = Array.prototype.map.call(binary, mapper);
                }
                starMaps[num] = starMap;
            }
            return starMaps[num];
        }
    }();
var Ractive_prototype_get_arrayAdaptor = function (types, defineProperty, isArray, clearCache, preDomUpdate, postDomUpdate, makeTransitionManager, notifyDependants) {
        
        var arrayAdaptor, notifyArrayDependants, ArrayWrapper, patchArrayMethods, unpatchArrayMethods, patchedArrayProto, testObj, mutatorMethods, noop, errorMessage;
        arrayAdaptor = {
            filter: function (object) {
                return isArray(object) && (!object._ractive || !object._ractive.setting);
            },
            wrap: function (ractive, array, keypath) {
                return new ArrayWrapper(ractive, array, keypath);
            }
        };
        ArrayWrapper = function (ractive, array, keypath) {
            this.root = ractive;
            this.value = array;
            this.keypath = keypath;
            if (!array._ractive) {
                defineProperty(array, '_ractive', {
                    value: {
                        wrappers: [],
                        instances: [],
                        setting: false
                    },
                    configurable: true
                });
                patchArrayMethods(array);
            }
            if (!array._ractive.instances[ractive._guid]) {
                array._ractive.instances[ractive._guid] = 0;
                array._ractive.instances.push(ractive);
            }
            array._ractive.instances[ractive._guid] += 1;
            array._ractive.wrappers.push(this);
        };
        ArrayWrapper.prototype = {
            get: function () {
                return this.value;
            },
            teardown: function () {
                var array, storage, wrappers, instances, index;
                array = this.value;
                storage = array._ractive;
                wrappers = storage.wrappers;
                instances = storage.instances;
                if (storage.setting) {
                    return false;
                }
                index = wrappers.indexOf(this);
                if (index === -1) {
                    throw new Error(errorMessage);
                }
                wrappers.splice(index, 1);
                if (!wrappers.length) {
                    delete array._ractive;
                    unpatchArrayMethods(this.value);
                } else {
                    instances[this.root._guid] -= 1;
                    if (!instances[this.root._guid]) {
                        index = instances.indexOf(this.root);
                        if (index === -1) {
                            throw new Error(errorMessage);
                        }
                        instances.splice(index, 1);
                    }
                }
            }
        };
        notifyArrayDependants = function (array, methodName, args) {
            var notifyKeypathDependants, queueDependants, wrappers, wrapper, i;
            notifyKeypathDependants = function (root, keypath) {
                var depsByKeypath, deps, keys, upstreamQueue, smartUpdateQueue, dumbUpdateQueue, i, changed, start, end, childKeypath, lengthUnchanged;
                if (methodName === 'sort' || methodName === 'reverse') {
                    root.set(keypath, array);
                    return;
                }
                clearCache(root, keypath);
                smartUpdateQueue = [];
                dumbUpdateQueue = [];
                for (i = 0; i < root._deps.length; i += 1) {
                    depsByKeypath = root._deps[i];
                    if (!depsByKeypath) {
                        continue;
                    }
                    deps = depsByKeypath[keypath];
                    if (deps) {
                        queueDependants(keypath, deps, smartUpdateQueue, dumbUpdateQueue);
                        preDomUpdate(root);
                        while (smartUpdateQueue.length) {
                            smartUpdateQueue.pop().smartUpdate(methodName, args);
                        }
                        while (dumbUpdateQueue.length) {
                            dumbUpdateQueue.pop().update();
                        }
                    }
                }
                if (methodName === 'splice' && args.length > 2 && args[1]) {
                    changed = Math.min(args[1], args.length - 2);
                    start = args[0];
                    end = start + changed;
                    if (args[1] === args.length - 2) {
                        lengthUnchanged = true;
                    }
                    for (i = start; i < end; i += 1) {
                        childKeypath = keypath + '.' + i;
                        notifyDependants(root, childKeypath);
                    }
                }
                preDomUpdate(root);
                upstreamQueue = [];
                keys = keypath.split('.');
                while (keys.length) {
                    keys.pop();
                    upstreamQueue[upstreamQueue.length] = keys.join('.');
                }
                notifyDependants.multiple(root, upstreamQueue, true);
                if (!lengthUnchanged) {
                    notifyDependants(root, keypath + '.length', true);
                }
            };
            queueDependants = function (keypath, deps, smartUpdateQueue, dumbUpdateQueue) {
                var k, dependant;
                k = deps.length;
                while (k--) {
                    dependant = deps[k];
                    if (dependant.type === types.REFERENCE) {
                        dependant.update();
                    } else if (dependant.keypath === keypath && dependant.type === types.SECTION && !dependant.inverted && dependant.docFrag) {
                        smartUpdateQueue[smartUpdateQueue.length] = dependant;
                    } else {
                        dumbUpdateQueue[dumbUpdateQueue.length] = dependant;
                    }
                }
            };
            wrappers = array._ractive.wrappers;
            i = wrappers.length;
            while (i--) {
                wrapper = wrappers[i];
                notifyKeypathDependants(wrapper.root, wrapper.keypath);
            }
        };
        patchedArrayProto = [];
        mutatorMethods = [
            'pop',
            'push',
            'reverse',
            'shift',
            'sort',
            'splice',
            'unshift'
        ];
        noop = function () {
        };
        mutatorMethods.forEach(function (methodName) {
            var method = function () {
                var result, instances, instance, i, previousTransitionManagers = {}, transitionManagers = {};
                result = Array.prototype[methodName].apply(this, arguments);
                instances = this._ractive.instances;
                i = instances.length;
                while (i--) {
                    instance = instances[i];
                    previousTransitionManagers[instance._guid] = instance._transitionManager;
                    instance._transitionManager = transitionManagers[instance._guid] = makeTransitionManager(instance, noop);
                }
                this._ractive.setting = true;
                notifyArrayDependants(this, methodName, arguments);
                this._ractive.setting = false;
                i = instances.length;
                while (i--) {
                    instance = instances[i];
                    instance._transitionManager = previousTransitionManagers[instance._guid];
                    transitionManagers[instance._guid].ready();
                    preDomUpdate(instance);
                    postDomUpdate(instance);
                }
                return result;
            };
            defineProperty(patchedArrayProto, methodName, { value: method });
        });
        testObj = {};
        if (testObj.__proto__) {
            patchArrayMethods = function (array) {
                array.__proto__ = patchedArrayProto;
            };
            unpatchArrayMethods = function (array) {
                array.__proto__ = Array.prototype;
            };
        } else {
            patchArrayMethods = function (array) {
                var i, methodName;
                i = mutatorMethods.length;
                while (i--) {
                    methodName = mutatorMethods[i];
                    defineProperty(array, methodName, {
                        value: patchedArrayProto[methodName],
                        configurable: true
                    });
                }
            };
            unpatchArrayMethods = function (array) {
                var i;
                i = mutatorMethods.length;
                while (i--) {
                    delete array[mutatorMethods[i]];
                }
            };
        }
        errorMessage = 'Something went wrong in a rather interesting way';
        return arrayAdaptor;
    }(config_types, utils_defineProperty, utils_isArray, shared_clearCache, shared_preDomUpdate, shared_postDomUpdate, shared_makeTransitionManager, shared_notifyDependants);
var Ractive_prototype_get_magicAdaptor = function () {
        
        var magicAdaptor, MagicWrapper;
        try {
            Object.defineProperty({}, 'test', { value: 0 });
        } catch (err) {
            return false;
        }
        magicAdaptor = {
            filter: function (object, keypath) {
                return !!keypath;
            },
            wrap: function (ractive, object, keypath) {
                return new MagicWrapper(ractive, object, keypath);
            }
        };
        MagicWrapper = function (ractive, object, keypath) {
            var wrapper = this, keys, prop, objKeypath, descriptor, wrappers, oldGet, oldSet, get, set;
            this.ractive = ractive;
            this.keypath = keypath;
            keys = keypath.split('.');
            this.prop = keys.pop();
            objKeypath = keys.join('.');
            this.obj = objKeypath ? ractive.get(objKeypath) : ractive.data;
            descriptor = this.originalDescriptor = Object.getOwnPropertyDescriptor(this.obj, this.prop);
            if (descriptor && descriptor.set && (wrappers = descriptor.set._ractiveWrappers)) {
                if (wrappers.indexOf(this) === -1) {
                    wrappers.push(this);
                }
                return;
            }
            if (descriptor && !descriptor.configurable) {
                throw new Error('Cannot use magic mode with property "' + prop + '" - object is not configurable');
            }
            if (descriptor) {
                this.value = descriptor.value;
                oldGet = descriptor.get;
                oldSet = descriptor.set;
            }
            get = oldGet || function () {
                return wrapper.value;
            };
            set = function (value) {
                var wrappers, wrapper, i;
                if (oldSet) {
                    oldSet(value);
                }
                wrappers = set._ractiveWrappers;
                i = wrappers.length;
                while (i--) {
                    wrapper = wrappers[i];
                    if (!wrapper.resetting) {
                        wrapper.ractive.set(wrapper.keypath, value);
                    }
                }
            };
            set._ractiveWrappers = [this];
            Object.defineProperty(this.obj, this.prop, {
                get: get,
                set: set,
                enumerable: true,
                configurable: true
            });
        };
        MagicWrapper.prototype = {
            get: function () {
                return this.value;
            },
            reset: function (value) {
                this.resetting = true;
                this.value = value;
                this.resetting = false;
            },
            teardown: function () {
                var descriptor, set, value, wrappers;
                descriptor = Object.getOwnPropertyDescriptor(this.obj, this.prop);
                set = descriptor.set;
                wrappers = set._ractiveWrappers;
                wrappers.splice(wrappers.indexOf(this), 1);
                if (!wrappers.length) {
                    value = this.obj[this.prop];
                    Object.defineProperty(this.obj, this.prop, this.originalDescriptor || {
                        writable: true,
                        enumerable: true,
                        configrable: true
                    });
                    this.obj[this.prop] = value;
                }
            }
        };
        return magicAdaptor;
    }();
var shared_adaptIfNecessary = function (adaptorRegistry, arrayAdaptor, magicAdaptor) {
        
        var prefixers = {};
        return function (ractive, keypath, value, isExpressionResult) {
            var len, i, adaptor, wrapped;
            len = ractive.adaptors.length;
            for (i = 0; i < len; i += 1) {
                adaptor = ractive.adaptors[i];
                if (typeof adaptor === 'string') {
                    if (!adaptorRegistry[adaptor]) {
                        throw new Error('Missing adaptor "' + adaptor + '"');
                    }
                    adaptor = ractive.adaptors[i] = adaptorRegistry[adaptor];
                }
                if (adaptor.filter(value, keypath, ractive)) {
                    wrapped = ractive._wrapped[keypath] = adaptor.wrap(ractive, value, keypath, getPrefixer(keypath));
                    wrapped.value = value;
                    return;
                }
            }
            if (!isExpressionResult) {
                if (ractive.magic && magicAdaptor.filter(value, keypath, ractive)) {
                    ractive._wrapped[keypath] = magicAdaptor.wrap(ractive, value, keypath);
                } else if (ractive.modifyArrays && arrayAdaptor.filter(value, keypath, ractive)) {
                    ractive._wrapped[keypath] = arrayAdaptor.wrap(ractive, value, keypath);
                }
            }
        };
        function prefixKeypath(obj, prefix) {
            var prefixed = {}, key;
            if (!prefix) {
                return obj;
            }
            prefix += '.';
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    prefixed[prefix + key] = obj[key];
                }
            }
            return prefixed;
        }
        function getPrefixer(rootKeypath) {
            var rootDot;
            if (!prefixers[rootKeypath]) {
                rootDot = rootKeypath ? rootKeypath + '.' : '';
                prefixers[rootKeypath] = function (relativeKeypath, value) {
                    var obj;
                    if (typeof relativeKeypath === 'string') {
                        obj = {};
                        obj[rootDot + relativeKeypath] = value;
                        return obj;
                    }
                    if (typeof relativeKeypath === 'object') {
                        return rootDot ? prefixKeypath(relativeKeypath, rootKeypath) : relativeKeypath;
                    }
                };
            }
            return prefixers[rootKeypath];
        }
    }(registries_adaptors, Ractive_prototype_get_arrayAdaptor, Ractive_prototype_get_magicAdaptor);
var Ractive_prototype_get__get = function (normaliseKeypath, adaptorRegistry, adaptIfNecessary) {
        
        var get, _get, retrieve;
        get = function (keypath) {
            if (this._captured && !this._captured[keypath]) {
                this._captured.push(keypath);
                this._captured[keypath] = true;
            }
            return _get(this, keypath);
        };
        _get = function (ractive, keypath) {
            var cache, cached, value, wrapped, evaluator;
            keypath = normaliseKeypath(keypath);
            cache = ractive._cache;
            if ((cached = cache[keypath]) !== undefined) {
                return cached;
            }
            if (wrapped = ractive._wrapped[keypath]) {
                value = wrapped.value;
            } else if (!keypath) {
                adaptIfNecessary(ractive, '', ractive.data);
                value = ractive.data;
            } else if (evaluator = ractive._evaluators[keypath]) {
                value = evaluator.value;
            } else {
                value = retrieve(ractive, keypath);
            }
            cache[keypath] = value;
            return value;
        };
        retrieve = function (ractive, keypath) {
            var keys, key, parentKeypath, parentValue, cacheMap, value, wrapped;
            keys = keypath.split('.');
            key = keys.pop();
            parentKeypath = keys.join('.');
            parentValue = _get(ractive, parentKeypath);
            if (wrapped = ractive._wrapped[parentKeypath]) {
                parentValue = wrapped.get();
            }
            if (parentValue === null || parentValue === undefined) {
                return;
            }
            if (!(cacheMap = ractive._cacheMap[parentKeypath])) {
                ractive._cacheMap[parentKeypath] = [keypath];
            } else {
                if (cacheMap.indexOf(keypath) === -1) {
                    cacheMap[cacheMap.length] = keypath;
                }
            }
            value = parentValue[key];
            adaptIfNecessary(ractive, keypath, value);
            ractive._cache[keypath] = value;
            return value;
        };
        return get;
    }(utils_normaliseKeypath, registries_adaptors, shared_adaptIfNecessary);
var utils_isObject = function () {
        
        var toString = Object.prototype.toString;
        return function (thing) {
            return typeof thing === 'object' && toString.call(thing) === '[object Object]';
        };
    }();
var utils_isEqual = function () {
        
        return function (a, b) {
            if (a === null && b === null) {
                return true;
            }
            if (typeof a === 'object' || typeof b === 'object') {
                return false;
            }
            return a === b;
        };
    }();
var shared_resolveRef = function () {
        
        var resolveRef;
        resolveRef = function (ractive, ref, contextStack) {
            var keypath, keys, lastKey, contextKeys, innerMostContext, postfix, parentKeypath, parentValue, wrapped, context, ancestorErrorMessage;
            ancestorErrorMessage = 'Could not resolve reference - too many "../" prefixes';
            if (ref === '.') {
                if (!contextStack.length) {
                    return '';
                }
                keypath = contextStack[contextStack.length - 1];
            } else if (ref.charAt(0) === '.') {
                context = contextStack[contextStack.length - 1];
                contextKeys = context ? context.split('.') : [];
                if (ref.substr(0, 3) === '../') {
                    while (ref.substr(0, 3) === '../') {
                        if (!contextKeys.length) {
                            throw new Error(ancestorErrorMessage);
                        }
                        contextKeys.pop();
                        ref = ref.substring(3);
                    }
                    contextKeys.push(ref);
                    keypath = contextKeys.join('.');
                } else if (!context) {
                    keypath = ref.substring(1);
                } else {
                    keypath = context + ref;
                }
            } else {
                keys = ref.split('.');
                lastKey = keys.pop();
                postfix = keys.length ? '.' + keys.join('.') : '';
                contextStack = contextStack.concat();
                while (contextStack.length) {
                    innerMostContext = contextStack.pop();
                    parentKeypath = innerMostContext + postfix;
                    parentValue = ractive.get(parentKeypath);
                    if (wrapped = ractive._wrapped[parentKeypath]) {
                        parentValue = wrapped.get();
                    }
                    if (typeof parentValue === 'object' && parentValue !== null && parentValue.hasOwnProperty(lastKey)) {
                        keypath = innerMostContext + '.' + ref;
                        break;
                    }
                }
                if (!keypath && ractive.get(ref) !== undefined) {
                    keypath = ref;
                }
            }
            return keypath ? keypath.replace(/^\./, '') : keypath;
        };
        return resolveRef;
    }();
var shared_attemptKeypathResolution = function (resolveRef) {
        
        var push = Array.prototype.push;
        return function (ractive) {
            var unresolved, keypath, leftover;
            while (unresolved = ractive._pendingResolution.pop()) {
                keypath = resolveRef(ractive, unresolved.ref, unresolved.contextStack);
                if (keypath !== undefined) {
                    unresolved.resolve(keypath);
                } else {
                    (leftover || (leftover = [])).push(unresolved);
                }
            }
            if (leftover) {
                push.apply(ractive._pendingResolution, leftover);
            }
        };
    }(shared_resolveRef);
var shared_processDeferredUpdates = function (preDomUpdate, postDomUpdate) {
        
        return function (ractive) {
            preDomUpdate(ractive);
            postDomUpdate(ractive);
        };
    }(shared_preDomUpdate, shared_postDomUpdate);
var Ractive_prototype_shared_replaceData = function () {
        
        return function (ractive, keypath, value) {
            var keys, accumulated, wrapped, obj, key, currentKeypath, keypathToClear;
            keys = keypath.split('.');
            accumulated = [];
            if (wrapped = ractive._wrapped['']) {
                if (wrapped.set) {
                    wrapped.set(keys.join('.'), value);
                }
                obj = wrapped.get();
            } else {
                obj = ractive.data;
            }
            while (keys.length > 1) {
                key = accumulated[accumulated.length] = keys.shift();
                currentKeypath = accumulated.join('.');
                if (wrapped = ractive._wrapped[currentKeypath]) {
                    if (wrapped.set) {
                        wrapped.set(keys.join('.'), value);
                    }
                    obj = wrapped.get();
                } else {
                    if (!obj.hasOwnProperty(key)) {
                        if (!keypathToClear) {
                            keypathToClear = currentKeypath;
                        }
                        obj[key] = /^\s*[0-9]+\s*$/.test(keys[0]) ? [] : {};
                    }
                    obj = obj[key];
                }
            }
            key = keys[0];
            obj[key] = value;
            return keypathToClear;
        };
    }();
var Ractive_prototype_set = function (isObject, isEqual, normaliseKeypath, clearCache, notifyDependants, attemptKeypathResolution, makeTransitionManager, processDeferredUpdates, replaceData) {
        
        var set, updateModel, getUpstreamChanges, resetWrapped;
        set = function (keypath, value, complete) {
            var map, changes, upstreamChanges, previousTransitionManager, transitionManager, i, changeHash;
            changes = [];
            if (isObject(keypath)) {
                map = keypath;
                complete = value;
            }
            if (map) {
                for (keypath in map) {
                    if (map.hasOwnProperty(keypath)) {
                        value = map[keypath];
                        keypath = normaliseKeypath(keypath);
                        updateModel(this, keypath, value, changes);
                    }
                }
            } else {
                keypath = normaliseKeypath(keypath);
                updateModel(this, keypath, value, changes);
            }
            if (!changes.length) {
                return;
            }
            previousTransitionManager = this._transitionManager;
            this._transitionManager = transitionManager = makeTransitionManager(this, complete);
            upstreamChanges = getUpstreamChanges(changes);
            if (upstreamChanges.length) {
                notifyDependants.multiple(this, upstreamChanges, true);
            }
            notifyDependants.multiple(this, changes);
            if (this._pendingResolution.length) {
                attemptKeypathResolution(this);
            }
            processDeferredUpdates(this);
            this._transitionManager = previousTransitionManager;
            transitionManager.ready();
            if (!this.firingChangeEvent) {
                this.firingChangeEvent = true;
                changeHash = {};
                i = changes.length;
                while (i--) {
                    changeHash[changes[i]] = this.get(changes[i]);
                }
                this.fire('change', changeHash);
                this.firingChangeEvent = false;
            }
            return this;
        };
        updateModel = function (ractive, keypath, value, changes) {
            var cached, previous, wrapped, keypathToClear, evaluator;
            if ((wrapped = ractive._wrapped[keypath]) && wrapped.reset) {
                if (resetWrapped(ractive, keypath, value, wrapped, changes) !== false) {
                    return;
                }
            }
            if (evaluator = ractive._evaluators[keypath]) {
                evaluator.value = value;
            }
            cached = ractive._cache[keypath];
            previous = ractive.get(keypath);
            if (previous !== value && !evaluator) {
                keypathToClear = replaceData(ractive, keypath, value);
            } else {
                if (value === cached && typeof value !== 'object') {
                    return;
                }
            }
            clearCache(ractive, keypathToClear || keypath);
            changes[changes.length] = keypath;
        };
        getUpstreamChanges = function (changes) {
            var upstreamChanges = [''], i, keypath, keys, upstreamKeypath;
            i = changes.length;
            while (i--) {
                keypath = changes[i];
                keys = keypath.split('.');
                while (keys.length > 1) {
                    keys.pop();
                    upstreamKeypath = keys.join('.');
                    if (!upstreamChanges[upstreamKeypath]) {
                        upstreamChanges[upstreamChanges.length] = upstreamKeypath;
                        upstreamChanges[upstreamKeypath] = true;
                    }
                }
            }
            return upstreamChanges;
        };
        resetWrapped = function (ractive, keypath, value, wrapped, changes) {
            var previous, cached, cacheMap, i;
            previous = wrapped.get();
            if (!isEqual(previous, value)) {
                if (wrapped.reset(value) === false) {
                    return false;
                }
            }
            value = wrapped.get();
            cached = ractive._cache[keypath];
            if (!isEqual(cached, value)) {
                ractive._cache[keypath] = value;
                cacheMap = ractive._cacheMap[keypath];
                if (cacheMap) {
                    i = cacheMap.length;
                    while (i--) {
                        clearCache(ractive, cacheMap[i]);
                    }
                }
                changes[changes.length] = keypath;
            }
        };
        return set;
    }(utils_isObject, utils_isEqual, utils_normaliseKeypath, shared_clearCache, shared_notifyDependants, shared_attemptKeypathResolution, shared_makeTransitionManager, shared_processDeferredUpdates, Ractive_prototype_shared_replaceData);
var Ractive_prototype_update = function (makeTransitionManager, attemptKeypathResolution, clearCache, notifyDependants, processDeferredUpdates) {
        
        return function (keypath, complete) {
            var transitionManager, previousTransitionManager;
            if (typeof keypath === 'function') {
                complete = keypath;
                keypath = '';
            }
            previousTransitionManager = this._transitionManager;
            this._transitionManager = transitionManager = makeTransitionManager(this, complete);
            attemptKeypathResolution(this);
            clearCache(this, keypath || '');
            notifyDependants(this, keypath || '');
            processDeferredUpdates(this);
            this._transitionManager = previousTransitionManager;
            transitionManager.ready();
            if (typeof keypath === 'string') {
                this.fire('update', keypath);
            } else {
                this.fire('update');
            }
            return this;
        };
    }(shared_makeTransitionManager, shared_attemptKeypathResolution, shared_clearCache, shared_notifyDependants, shared_processDeferredUpdates);
var utils_arrayContentsMatch = function (isArray) {
        
        return function (a, b) {
            var i;
            if (!isArray(a) || !isArray(b)) {
                return false;
            }
            if (a.length !== b.length) {
                return false;
            }
            i = a.length;
            while (i--) {
                if (a[i] !== b[i]) {
                    return false;
                }
            }
            return true;
        };
    }(utils_isArray);
var Ractive_prototype_updateModel = function (getValueFromCheckboxes, arrayContentsMatch, isEqual) {
        
        return function (keypath, cascade) {
            var values, deferredCheckboxes, i;
            if (typeof keypath !== 'string') {
                keypath = '';
                cascade = true;
            }
            consolidateChangedValues(this, keypath, values = {}, deferredCheckboxes = [], cascade);
            if (i = deferredCheckboxes.length) {
                while (i--) {
                    keypath = deferredCheckboxes[i];
                    values[keypath] = getValueFromCheckboxes(this, keypath);
                }
            }
            this.set(values);
        };
        function consolidateChangedValues(ractive, keypath, values, deferredCheckboxes, cascade) {
            var bindings, childDeps, i, binding, oldValue, newValue;
            bindings = ractive._twowayBindings[keypath];
            if (bindings) {
                i = bindings.length;
                while (i--) {
                    binding = bindings[i];
                    if (binding.radioName && !binding.node.checked) {
                        continue;
                    }
                    if (binding.checkboxName) {
                        if (binding.changed() && !deferredCheckboxes[keypath]) {
                            deferredCheckboxes[keypath] = true;
                            deferredCheckboxes[deferredCheckboxes.length] = keypath;
                        }
                        continue;
                    }
                    oldValue = binding.attr.value;
                    newValue = binding.value();
                    if (arrayContentsMatch(oldValue, newValue)) {
                        continue;
                    }
                    if (!isEqual(oldValue, newValue)) {
                        values[keypath] = newValue;
                    }
                }
            }
            if (!cascade) {
                return;
            }
            childDeps = ractive._depsMap[keypath];
            if (childDeps) {
                i = childDeps.length;
                while (i--) {
                    consolidateChangedValues(ractive, childDeps[i], values, deferredCheckboxes, cascade);
                }
            }
        }
    }(shared_getValueFromCheckboxes, utils_arrayContentsMatch, utils_isEqual);
var Ractive_prototype_animate_requestAnimationFrame = function () {
        
        if (typeof window === 'undefined') {
            return;
        }
        (function (vendors, lastTime, window) {
            var x, setTimeout;
            if (window.requestAnimationFrame) {
                return;
            }
            for (x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
                window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
            }
            if (!window.requestAnimationFrame) {
                setTimeout = window.setTimeout;
                window.requestAnimationFrame = function (callback) {
                    var currTime, timeToCall, id;
                    currTime = Date.now();
                    timeToCall = Math.max(0, 16 - (currTime - lastTime));
                    id = setTimeout(function () {
                        callback(currTime + timeToCall);
                    }, timeToCall);
                    lastTime = currTime + timeToCall;
                    return id;
                };
            }
        }([
            'ms',
            'moz',
            'webkit',
            'o'
        ], 0, window));
        return window.requestAnimationFrame;
    }();
var Ractive_prototype_animate_animations = function (rAF) {
        
        var queue = [];
        var animations = {
                tick: function () {
                    var i, animation;
                    for (i = 0; i < queue.length; i += 1) {
                        animation = queue[i];
                        if (!animation.tick()) {
                            queue.splice(i--, 1);
                        }
                    }
                    if (queue.length) {
                        rAF(animations.tick);
                    } else {
                        animations.running = false;
                    }
                },
                add: function (animation) {
                    queue[queue.length] = animation;
                    if (!animations.running) {
                        animations.running = true;
                        animations.tick();
                    }
                },
                abort: function (keypath, root) {
                    var i = queue.length, animation;
                    while (i--) {
                        animation = queue[i];
                        if (animation.root === root && animation.keypath === keypath) {
                            animation.stop();
                        }
                    }
                }
            };
        return animations;
    }(Ractive_prototype_animate_requestAnimationFrame);
var utils_warn = function () {
        
        if (typeof console !== 'undefined' && typeof console.warn === 'function' && typeof console.warn.apply === 'function') {
            return function () {
                console.warn.apply(console, arguments);
            };
        }
        return function () {
        };
    }();
var utils_isNumeric = function () {
        
        return function (thing) {
            return !isNaN(parseFloat(thing)) && isFinite(thing);
        };
    }();
var shared_interpolate = function (isArray, isObject, isNumeric) {
        
        var interpolate = function (from, to) {
            if (isNumeric(from) && isNumeric(to)) {
                return makeNumberInterpolator(+from, +to);
            }
            if (isArray(from) && isArray(to)) {
                return makeArrayInterpolator(from, to);
            }
            if (isObject(from) && isObject(to)) {
                return makeObjectInterpolator(from, to);
            }
            return function () {
                return to;
            };
        };
        return interpolate;
        function makeNumberInterpolator(from, to) {
            var delta = to - from;
            if (!delta) {
                return function () {
                    return from;
                };
            }
            return function (t) {
                return from + t * delta;
            };
        }
        function makeArrayInterpolator(from, to) {
            var intermediate, interpolators, len, i;
            intermediate = [];
            interpolators = [];
            i = len = Math.min(from.length, to.length);
            while (i--) {
                interpolators[i] = interpolate(from[i], to[i]);
            }
            for (i = len; i < from.length; i += 1) {
                intermediate[i] = from[i];
            }
            for (i = len; i < to.length; i += 1) {
                intermediate[i] = to[i];
            }
            return function (t) {
                var i = len;
                while (i--) {
                    intermediate[i] = interpolators[i](t);
                }
                return intermediate;
            };
        }
        function makeObjectInterpolator(from, to) {
            var properties = [], len, interpolators, intermediate, prop;
            intermediate = {};
            interpolators = {};
            for (prop in from) {
                if (from.hasOwnProperty(prop)) {
                    if (to.hasOwnProperty(prop)) {
                        properties[properties.length] = prop;
                        interpolators[prop] = interpolate(from[prop], to[prop]);
                    } else {
                        intermediate[prop] = from[prop];
                    }
                }
            }
            for (prop in to) {
                if (to.hasOwnProperty(prop) && !from.hasOwnProperty(prop)) {
                    intermediate[prop] = to[prop];
                }
            }
            len = properties.length;
            return function (t) {
                var i = len, prop;
                while (i--) {
                    prop = properties[i];
                    intermediate[prop] = interpolators[prop](t);
                }
                return intermediate;
            };
        }
    }(utils_isArray, utils_isObject, utils_isNumeric);
var Ractive_prototype_animate_Animation = function (warn, interpolate) {
        
        var Animation = function (options) {
            var key;
            this.startTime = Date.now();
            for (key in options) {
                if (options.hasOwnProperty(key)) {
                    this[key] = options[key];
                }
            }
            this.interpolator = interpolate(this.from, this.to);
            this.running = true;
        };
        Animation.prototype = {
            tick: function () {
                var elapsed, t, value, timeNow, index, keypath;
                keypath = this.keypath;
                if (this.running) {
                    timeNow = Date.now();
                    elapsed = timeNow - this.startTime;
                    if (elapsed >= this.duration) {
                        if (keypath !== null) {
                            this.root.set(keypath, this.to);
                        }
                        if (this.step) {
                            this.step(1, this.to);
                        }
                        if (this.complete) {
                            this.complete(1, this.to);
                        }
                        index = this.root._animations.indexOf(this);
                        if (index === -1) {
                            warn('Animation was not found');
                        }
                        this.root._animations.splice(index, 1);
                        this.running = false;
                        return false;
                    }
                    t = this.easing ? this.easing(elapsed / this.duration) : elapsed / this.duration;
                    if (keypath !== null) {
                        value = this.interpolator(t);
                        this.root.set(keypath, value);
                    }
                    if (this.step) {
                        this.step(t, value);
                    }
                    return true;
                }
                return false;
            },
            stop: function () {
                var index;
                this.running = false;
                index = this.root._animations.indexOf(this);
                if (index === -1) {
                    warn('Animation was not found');
                }
                this.root._animations.splice(index, 1);
            }
        };
        return Animation;
    }(utils_warn, shared_interpolate);
var registries_easing = function () {
        
        return {
            linear: function (pos) {
                return pos;
            },
            easeIn: function (pos) {
                return Math.pow(pos, 3);
            },
            easeOut: function (pos) {
                return Math.pow(pos - 1, 3) + 1;
            },
            easeInOut: function (pos) {
                if ((pos /= 0.5) < 1) {
                    return 0.5 * Math.pow(pos, 3);
                }
                return 0.5 * (Math.pow(pos - 2, 3) + 2);
            }
        };
    }();
var Ractive_prototype_animate__animate = function (isEqual, animations, Animation, easingRegistry) {
        
        var noAnimation = {
                stop: function () {
                }
            };
        return function (keypath, to, options) {
            var k, animation, animations, easing, duration, step, complete, makeValueCollector, currentValues, collectValue, dummy, dummyOptions;
            if (typeof keypath === 'object') {
                options = to || {};
                easing = options.easing;
                duration = options.duration;
                animations = [];
                step = options.step;
                complete = options.complete;
                if (step || complete) {
                    currentValues = {};
                    options.step = null;
                    options.complete = null;
                    makeValueCollector = function (keypath) {
                        return function (t, value) {
                            currentValues[keypath] = value;
                        };
                    };
                }
                for (k in keypath) {
                    if (keypath.hasOwnProperty(k)) {
                        if (step || complete) {
                            collectValue = makeValueCollector(k);
                            options = {
                                easing: easing,
                                duration: duration
                            };
                            if (step) {
                                options.step = collectValue;
                            }
                            if (complete) {
                                options.complete = collectValue;
                            }
                        }
                        animations[animations.length] = animate(this, k, keypath[k], options);
                    }
                }
                if (step || complete) {
                    dummyOptions = {
                        easing: easing,
                        duration: duration
                    };
                    if (step) {
                        dummyOptions.step = function (t) {
                            step(t, currentValues);
                        };
                    }
                    if (complete) {
                        dummyOptions.complete = function (t) {
                            complete(t, currentValues);
                        };
                    }
                    animations[animations.length] = dummy = animate(this, null, null, dummyOptions);
                }
                return {
                    stop: function () {
                        while (animations.length) {
                            animations.pop().stop();
                        }
                        if (dummy) {
                            dummy.stop();
                        }
                    }
                };
            }
            options = options || {};
            animation = animate(this, keypath, to, options);
            return {
                stop: function () {
                    animation.stop();
                }
            };
        };
        function animate(root, keypath, to, options) {
            var easing, duration, animation, from;
            if (keypath !== null) {
                from = root.get(keypath);
            }
            animations.abort(keypath, root);
            if (isEqual(from, to)) {
                if (options.complete) {
                    options.complete(1, options.to);
                }
                return noAnimation;
            }
            if (options.easing) {
                if (typeof options.easing === 'function') {
                    easing = options.easing;
                } else {
                    if (root.easing && root.easing[options.easing]) {
                        easing = root.easing[options.easing];
                    } else {
                        easing = easingRegistry[options.easing];
                    }
                }
                if (typeof easing !== 'function') {
                    easing = null;
                }
            }
            duration = options.duration === undefined ? 400 : options.duration;
            animation = new Animation({
                keypath: keypath,
                from: from,
                to: to,
                root: root,
                duration: duration,
                easing: easing,
                step: options.step,
                complete: options.complete
            });
            animations.add(animation);
            root._animations[root._animations.length] = animation;
            return animation;
        }
    }(utils_isEqual, Ractive_prototype_animate_animations, Ractive_prototype_animate_Animation, registries_easing);
var Ractive_prototype_on = function () {
        
        return function (eventName, callback) {
            var self = this, listeners, n;
            if (typeof eventName === 'object') {
                listeners = [];
                for (n in eventName) {
                    if (eventName.hasOwnProperty(n)) {
                        listeners[listeners.length] = this.on(n, eventName[n]);
                    }
                }
                return {
                    cancel: function () {
                        while (listeners.length) {
                            listeners.pop().cancel();
                        }
                    }
                };
            }
            if (!this._subs[eventName]) {
                this._subs[eventName] = [callback];
            } else {
                this._subs[eventName].push(callback);
            }
            return {
                cancel: function () {
                    self.off(eventName, callback);
                }
            };
        };
    }();
var Ractive_prototype_off = function () {
        
        return function (eventName, callback) {
            var subscribers, index;
            if (!callback) {
                if (!eventName) {
                    for (eventName in this._subs) {
                        delete this._subs[eventName];
                    }
                } else {
                    this._subs[eventName] = [];
                }
            }
            subscribers = this._subs[eventName];
            if (subscribers) {
                index = subscribers.indexOf(callback);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
            }
        };
    }();
var shared_registerDependant = function () {
        
        return function (dependant) {
            var depsByKeypath, deps, keys, parentKeypath, map, ractive, keypath, priority;
            ractive = dependant.root;
            keypath = dependant.keypath;
            priority = dependant.priority;
            depsByKeypath = ractive._deps[priority] || (ractive._deps[priority] = {});
            deps = depsByKeypath[keypath] || (depsByKeypath[keypath] = []);
            deps[deps.length] = dependant;
            dependant.registered = true;
            if (!keypath) {
                return;
            }
            keys = keypath.split('.');
            while (keys.length) {
                keys.pop();
                parentKeypath = keys.join('.');
                map = ractive._depsMap[parentKeypath] || (ractive._depsMap[parentKeypath] = []);
                if (map[keypath] === undefined) {
                    map[keypath] = 0;
                    map[map.length] = keypath;
                }
                map[keypath] += 1;
                keypath = parentKeypath;
            }
        };
    }();
var shared_unregisterDependant = function () {
        
        return function (dependant) {
            var deps, index, keys, parentKeypath, map, ractive, keypath, priority;
            ractive = dependant.root;
            keypath = dependant.keypath;
            priority = dependant.priority;
            deps = ractive._deps[priority][keypath];
            index = deps.indexOf(dependant);
            if (index === -1 || !dependant.registered) {
                throw new Error('Attempted to remove a dependant that was no longer registered! This should not happen. If you are seeing this bug in development please raise an issue at https://github.com/RactiveJS/Ractive/issues - thanks');
            }
            deps.splice(index, 1);
            dependant.registered = false;
            if (!keypath) {
                return;
            }
            keys = keypath.split('.');
            while (keys.length) {
                keys.pop();
                parentKeypath = keys.join('.');
                map = ractive._depsMap[parentKeypath];
                map[keypath] -= 1;
                if (!map[keypath]) {
                    map.splice(map.indexOf(keypath), 1);
                    map[keypath] = undefined;
                }
                keypath = parentKeypath;
            }
        };
    }();
var Ractive_prototype_observe_Observer = function (isEqual) {
        
        var Observer = function (ractive, keypath, callback, options) {
            var self = this;
            this.root = ractive;
            this.keypath = keypath;
            this.callback = callback;
            this.defer = options.defer;
            this.debug = options.debug;
            this.proxy = {
                update: function () {
                    self.reallyUpdate();
                }
            };
            this.priority = 0;
            this.context = options && options.context ? options.context : ractive;
        };
        Observer.prototype = {
            init: function (immediate) {
                if (immediate !== false) {
                    this.update();
                } else {
                    this.value = this.root.get(this.keypath);
                }
            },
            update: function () {
                if (this.defer && this.ready) {
                    this.root._deferred.observers.push(this.proxy);
                    return;
                }
                this.reallyUpdate();
            },
            reallyUpdate: function () {
                var oldValue, newValue;
                oldValue = this.value;
                newValue = this.root.get(this.keypath);
                this.value = newValue;
                if (this.updating) {
                    return;
                }
                this.updating = true;
                if (!isEqual(newValue, oldValue) || !this.ready) {
                    try {
                        this.callback.call(this.context, newValue, oldValue, this.keypath);
                    } catch (err) {
                        if (this.debug || this.root.debug) {
                            throw err;
                        }
                    }
                }
                this.updating = false;
            }
        };
        return Observer;
    }(utils_isEqual);
var Ractive_prototype_observe_getPattern = function () {
        
        return function (ractive, pattern) {
            var keys, key, values, toGet, newToGet, expand, concatenate;
            keys = pattern.split('.');
            toGet = [];
            expand = function (keypath) {
                var value, key;
                value = ractive._wrapped[keypath] ? ractive._wrapped[keypath].get() : ractive.get(keypath);
                for (key in value) {
                    newToGet.push(keypath + '.' + key);
                }
            };
            concatenate = function (keypath) {
                return keypath + '.' + key;
            };
            while (key = keys.shift()) {
                if (key === '*') {
                    newToGet = [];
                    toGet.forEach(expand);
                    toGet = newToGet;
                } else {
                    if (!toGet[0]) {
                        toGet[0] = key;
                    } else {
                        toGet = toGet.map(concatenate);
                    }
                }
            }
            values = {};
            toGet.forEach(function (keypath) {
                values[keypath] = ractive.get(keypath);
            });
            return values;
        };
    }();
var Ractive_prototype_observe_PatternObserver = function (isEqual, getPattern) {
        
        var PatternObserver, wildcard = /\*/;
        PatternObserver = function (ractive, keypath, callback, options) {
            this.root = ractive;
            this.callback = callback;
            this.defer = options.defer;
            this.debug = options.debug;
            this.keypath = keypath;
            this.regex = new RegExp('^' + keypath.replace(/\./g, '\\.').replace(/\*/g, '[^\\.]+') + '$');
            this.values = {};
            if (this.defer) {
                this.proxies = [];
            }
            this.priority = 'pattern';
            this.context = options && options.context ? options.context : ractive;
        };
        PatternObserver.prototype = {
            init: function (immediate) {
                var values, keypath;
                values = getPattern(this.root, this.keypath);
                if (immediate !== false) {
                    for (keypath in values) {
                        if (values.hasOwnProperty(keypath)) {
                            this.update(keypath);
                        }
                    }
                } else {
                    this.values = values;
                }
            },
            update: function (keypath) {
                var values;
                if (wildcard.test(keypath)) {
                    values = getPattern(this.root, keypath);
                    for (keypath in values) {
                        if (values.hasOwnProperty(keypath)) {
                            this.update(keypath);
                        }
                    }
                    return;
                }
                if (this.defer && this.ready) {
                    this.root._deferred.observers.push(this.getProxy(keypath));
                    return;
                }
                this.reallyUpdate(keypath);
            },
            reallyUpdate: function (keypath) {
                var value = this.root.get(keypath);
                if (this.updating) {
                    this.values[keypath] = value;
                    return;
                }
                this.updating = true;
                if (!isEqual(value, this.values[keypath]) || !this.ready) {
                    try {
                        this.callback.call(this.context, value, this.values[keypath], keypath);
                    } catch (err) {
                        if (this.debug || this.root.debug) {
                            throw err;
                        }
                    }
                    this.values[keypath] = value;
                }
                this.updating = false;
            },
            getProxy: function (keypath) {
                var self = this;
                if (!this.proxies[keypath]) {
                    this.proxies[keypath] = {
                        update: function () {
                            self.reallyUpdate(keypath);
                        }
                    };
                }
                return this.proxies[keypath];
            }
        };
        return PatternObserver;
    }(utils_isEqual, Ractive_prototype_observe_getPattern);
var Ractive_prototype_observe_getObserverFacade = function (normaliseKeypath, registerDependant, unregisterDependant, Observer, PatternObserver) {
        
        var wildcard = /\*/, emptyObject = {};
        return function getObserverFacade(ractive, keypath, callback, options) {
            var observer, isPatternObserver;
            keypath = normaliseKeypath(keypath);
            options = options || emptyObject;
            if (wildcard.test(keypath)) {
                observer = new PatternObserver(ractive, keypath, callback, options);
                ractive._patternObservers.push(observer);
                isPatternObserver = true;
            } else {
                observer = new Observer(ractive, keypath, callback, options);
            }
            registerDependant(observer);
            observer.init(options.init);
            observer.ready = true;
            return {
                cancel: function () {
                    var index;
                    if (isPatternObserver) {
                        index = ractive._patternObservers.indexOf(observer);
                        if (index !== -1) {
                            ractive._patternObservers.splice(index, 1);
                        }
                    }
                    unregisterDependant(observer);
                }
            };
        };
    }(utils_normaliseKeypath, shared_registerDependant, shared_unregisterDependant, Ractive_prototype_observe_Observer, Ractive_prototype_observe_PatternObserver);
var Ractive_prototype_observe__observe = function (isObject, getObserverFacade) {
        
        return function observe(keypath, callback, options) {
            var observers = [], k;
            if (isObject(keypath)) {
                options = callback;
                for (k in keypath) {
                    if (keypath.hasOwnProperty(k)) {
                        callback = keypath[k];
                        observers[observers.length] = getObserverFacade(this, k, callback, options);
                    }
                }
                return {
                    cancel: function () {
                        while (observers.length) {
                            observers.pop().cancel();
                        }
                    }
                };
            }
            return getObserverFacade(this, keypath, callback, options);
        };
    }(utils_isObject, Ractive_prototype_observe_getObserverFacade);
var Ractive_prototype_fire = function () {
        
        return function (eventName) {
            var args, i, len, subscribers = this._subs[eventName];
            if (!subscribers) {
                return;
            }
            args = Array.prototype.slice.call(arguments, 1);
            for (i = 0, len = subscribers.length; i < len; i += 1) {
                subscribers[i].apply(this, args);
            }
        };
    }();
var Ractive_prototype_find = function () {
        
        return function (selector) {
            if (!this.el) {
                return null;
            }
            return this.fragment.find(selector);
        };
    }();
var utils_matches = function (isClient, createElement) {
        
        var div, methodNames, unprefixed, prefixed, vendors, i, j, makeFunction;
        if (!isClient) {
            return;
        }
        div = createElement('div');
        methodNames = [
            'matches',
            'matchesSelector'
        ];
        vendors = [
            'o',
            'ms',
            'moz',
            'webkit'
        ];
        makeFunction = function (methodName) {
            return function (node, selector) {
                return node[methodName](selector);
            };
        };
        i = methodNames.length;
        while (i--) {
            unprefixed = methodNames[i];
            if (div[unprefixed]) {
                return makeFunction(unprefixed);
            }
            j = vendors.length;
            while (j--) {
                prefixed = vendors[i] + unprefixed.substr(0, 1).toUpperCase() + unprefixed.substring(1);
                if (div[prefixed]) {
                    return makeFunction(prefixed);
                }
            }
        }
        return function (node, selector) {
            var nodes, i;
            nodes = (node.parentNode || node.document).querySelectorAll(selector);
            i = nodes.length;
            while (i--) {
                if (nodes[i] === node) {
                    return true;
                }
            }
            return false;
        };
    }(config_isClient, utils_createElement);
var Ractive_prototype_shared_makeQuery_test = function (matches) {
        
        return function (item, noDirty) {
            var itemMatches = this._isComponentQuery ? !this.selector || item.name === this.selector : matches(item.node, this.selector);
            if (itemMatches) {
                this.push(item.node || item.instance);
                if (!noDirty) {
                    this._makeDirty();
                }
                return true;
            }
        };
    }(utils_matches);
var Ractive_prototype_shared_makeQuery_cancel = function () {
        
        return function () {
            var liveQueries, selector, index;
            liveQueries = this._root[this._isComponentQuery ? 'liveComponentQueries' : 'liveQueries'];
            selector = this.selector;
            index = liveQueries.indexOf(selector);
            if (index !== -1) {
                liveQueries.splice(index, 1);
                liveQueries[selector] = null;
            }
        };
    }();
var Ractive_prototype_shared_makeQuery_sortByItemPosition = function () {
        
        return function (a, b) {
            var ancestryA, ancestryB, oldestA, oldestB, mutualAncestor, indexA, indexB, fragments, fragmentA, fragmentB;
            ancestryA = getAncestry(a.component || a._ractive.proxy);
            ancestryB = getAncestry(b.component || b._ractive.proxy);
            oldestA = ancestryA[ancestryA.length - 1];
            oldestB = ancestryB[ancestryB.length - 1];
            while (oldestA && oldestA === oldestB) {
                ancestryA.pop();
                ancestryB.pop();
                mutualAncestor = oldestA;
                oldestA = ancestryA[ancestryA.length - 1];
                oldestB = ancestryB[ancestryB.length - 1];
            }
            oldestA = oldestA.component || oldestA;
            oldestB = oldestB.component || oldestB;
            fragmentA = oldestA.parentFragment;
            fragmentB = oldestB.parentFragment;
            if (fragmentA === fragmentB) {
                indexA = fragmentA.items.indexOf(oldestA);
                indexB = fragmentB.items.indexOf(oldestB);
                return indexA - indexB || ancestryA.length - ancestryB.length;
            }
            if (fragments = mutualAncestor.fragments) {
                indexA = fragments.indexOf(fragmentA);
                indexB = fragments.indexOf(fragmentB);
                return indexA - indexB || ancestryA.length - ancestryB.length;
            }
            throw new Error('An unexpected condition was met while comparing the position of two components. Please file an issue at https://github.com/RactiveJS/Ractive/issues - thanks!');
        };
        function getParent(item) {
            var parentFragment;
            if (parentFragment = item.parentFragment) {
                return parentFragment.owner;
            }
            if (item.component && (parentFragment = item.component.parentFragment)) {
                return parentFragment.owner;
            }
        }
        function getAncestry(item) {
            var ancestry, ancestor;
            ancestry = [item];
            ancestor = getParent(item);
            while (ancestor) {
                ancestry.push(ancestor);
                ancestor = getParent(ancestor);
            }
            return ancestry;
        }
    }();
var Ractive_prototype_shared_makeQuery_sortByDocumentPosition = function (sortByItemPosition) {
        
        return function (node, otherNode) {
            var bitmask;
            if (node.compareDocumentPosition) {
                bitmask = node.compareDocumentPosition(otherNode);
                return bitmask & 2 ? 1 : -1;
            }
            return sortByItemPosition(node, otherNode);
        };
    }(Ractive_prototype_shared_makeQuery_sortByItemPosition);
var Ractive_prototype_shared_makeQuery_sort = function (sortByDocumentPosition, sortByItemPosition) {
        
        return function () {
            this.sort(this._isComponentQuery ? sortByItemPosition : sortByDocumentPosition);
            this._dirty = false;
        };
    }(Ractive_prototype_shared_makeQuery_sortByDocumentPosition, Ractive_prototype_shared_makeQuery_sortByItemPosition);
var Ractive_prototype_shared_makeQuery_dirty = function () {
        
        return function () {
            if (!this._dirty) {
                this._root._deferred.liveQueries.push(this);
                this._dirty = true;
            }
        };
    }();
var Ractive_prototype_shared_makeQuery_remove = function () {
        
        return function (item) {
            var index = this.indexOf(this._isComponentQuery ? item.instance : item.node);
            if (index !== -1) {
                this.splice(index, 1);
            }
        };
    }();
var Ractive_prototype_shared_makeQuery__makeQuery = function (defineProperties, test, cancel, sort, dirty, remove) {
        
        return function (ractive, selector, live, isComponentQuery) {
            var query;
            query = [];
            defineProperties(query, {
                selector: { value: selector },
                live: { value: live },
                _isComponentQuery: { value: isComponentQuery },
                _test: { value: test }
            });
            if (!live) {
                return query;
            }
            defineProperties(query, {
                cancel: { value: cancel },
                _root: { value: ractive },
                _sort: { value: sort },
                _makeDirty: { value: dirty },
                _remove: { value: remove },
                _dirty: {
                    value: false,
                    writable: true
                }
            });
            return query;
        };
    }(utils_defineProperties, Ractive_prototype_shared_makeQuery_test, Ractive_prototype_shared_makeQuery_cancel, Ractive_prototype_shared_makeQuery_sort, Ractive_prototype_shared_makeQuery_dirty, Ractive_prototype_shared_makeQuery_remove);
var Ractive_prototype_findAll = function (warn, matches, defineProperties, makeQuery) {
        
        return function (selector, options) {
            var liveQueries, query;
            if (!this.el) {
                return [];
            }
            options = options || {};
            liveQueries = this._liveQueries;
            if (query = liveQueries[selector]) {
                return options && options.live ? query : query.slice();
            }
            query = makeQuery(this, selector, !!options.live, false);
            if (query.live) {
                liveQueries.push(selector);
                liveQueries[selector] = query;
            }
            this.fragment.findAll(selector, query);
            return query;
        };
    }(utils_warn, utils_matches, utils_defineProperties, Ractive_prototype_shared_makeQuery__makeQuery);
var Ractive_prototype_findComponent = function () {
        
        return function (selector) {
            return this.fragment.findComponent(selector);
        };
    }();
var Ractive_prototype_findAllComponents = function (warn, matches, defineProperties, makeQuery) {
        
        return function (selector, options) {
            var liveQueries, query;
            options = options || {};
            liveQueries = this._liveComponentQueries;
            if (query = liveQueries[selector]) {
                return options && options.live ? query : query.slice();
            }
            query = makeQuery(this, selector, !!options.live, true);
            if (query.live) {
                liveQueries.push(selector);
                liveQueries[selector] = query;
            }
            this.fragment.findAllComponents(selector, query);
            return query;
        };
    }(utils_warn, utils_matches, utils_defineProperties, Ractive_prototype_shared_makeQuery__makeQuery);
var utils_getElement = function () {
        
        return function (input) {
            var output;
            if (typeof window === 'undefined' || !document || !input) {
                return null;
            }
            if (input.nodeType) {
                return input;
            }
            if (typeof input === 'string') {
                output = document.getElementById(input);
                if (!output && document.querySelector) {
                    output = document.querySelector(input);
                }
                if (output && output.nodeType) {
                    return output;
                }
            }
            if (input[0] && input[0].nodeType) {
                return input[0];
            }
            return null;
        };
    }();
var render_shared_initFragment = function (types, create) {
        
        return function (fragment, options) {
            var numItems, i, parentFragment, parentRefs, ref;
            fragment.owner = options.owner;
            parentFragment = fragment.owner.parentFragment;
            fragment.root = options.root;
            fragment.pNode = options.pNode;
            fragment.contextStack = options.contextStack || [];
            if (fragment.owner.type === types.SECTION) {
                fragment.index = options.index;
            }
            if (parentFragment) {
                parentRefs = parentFragment.indexRefs;
                if (parentRefs) {
                    fragment.indexRefs = create(null);
                    for (ref in parentRefs) {
                        fragment.indexRefs[ref] = parentRefs[ref];
                    }
                }
            }
            fragment.priority = parentFragment ? parentFragment.priority + 1 : 1;
            if (options.indexRef) {
                if (!fragment.indexRefs) {
                    fragment.indexRefs = {};
                }
                fragment.indexRefs[options.indexRef] = options.index;
            }
            fragment.items = [];
            numItems = options.descriptor ? options.descriptor.length : 0;
            for (i = 0; i < numItems; i += 1) {
                fragment.items[fragment.items.length] = fragment.createItem({
                    parentFragment: fragment,
                    descriptor: options.descriptor[i],
                    index: i
                });
            }
        };
    }(config_types, utils_create);
var render_DomFragment_shared_insertHtml = function (createElement) {
        
        var elementCache = {};
        return function (html, tagName, docFrag) {
            var container, nodes = [];
            if (html) {
                container = elementCache[tagName] || (elementCache[tagName] = createElement(tagName));
                container.innerHTML = html;
                while (container.firstChild) {
                    nodes[nodes.length] = container.firstChild;
                    docFrag.appendChild(container.firstChild);
                }
            }
            return nodes;
        };
    }(utils_createElement);
var render_DomFragment_Text = function (types) {
        
        var DomText, lessThan, greaterThan;
        lessThan = /</g;
        greaterThan = />/g;
        DomText = function (options, docFrag) {
            this.type = types.TEXT;
            this.descriptor = options.descriptor;
            if (docFrag) {
                this.node = document.createTextNode(options.descriptor);
                docFrag.appendChild(this.node);
            }
        };
        DomText.prototype = {
            detach: function () {
                this.node.parentNode.removeChild(this.node);
                return this.node;
            },
            teardown: function (destroy) {
                if (destroy) {
                    this.detach();
                }
            },
            firstNode: function () {
                return this.node;
            },
            toString: function () {
                return ('' + this.descriptor).replace(lessThan, '&lt;').replace(greaterThan, '&gt;');
            }
        };
        return DomText;
    }(config_types);
var shared_teardown = function (unregisterDependant) {
        
        return function (thing) {
            if (!thing.keypath) {
                var index = thing.root._pendingResolution.indexOf(thing);
                if (index !== -1) {
                    thing.root._pendingResolution.splice(index, 1);
                }
            } else {
                unregisterDependant(thing);
            }
        };
    }(shared_unregisterDependant);
var render_shared_Evaluator_Reference = function (types, isEqual, defineProperty, registerDependant, unregisterDependant) {
        
        var Reference, thisPattern;
        thisPattern = /this/;
        Reference = function (root, keypath, evaluator, argNum, priority) {
            var value;
            this.evaluator = evaluator;
            this.keypath = keypath;
            this.root = root;
            this.argNum = argNum;
            this.type = types.REFERENCE;
            this.priority = priority;
            value = root.get(keypath);
            if (typeof value === 'function') {
                value = wrapFunction(value, root, evaluator);
            }
            this.value = evaluator.values[argNum] = value;
            registerDependant(this);
        };
        Reference.prototype = {
            update: function () {
                var value = this.root.get(this.keypath);
                if (typeof value === 'function' && !value._nowrap) {
                    value = wrapFunction(value, this.root, this.evaluator);
                }
                if (!isEqual(value, this.value)) {
                    this.evaluator.values[this.argNum] = value;
                    this.evaluator.bubble();
                    this.value = value;
                }
            },
            teardown: function () {
                unregisterDependant(this);
            }
        };
        return Reference;
        function wrapFunction(fn, ractive, evaluator) {
            var prop, evaluators, index;
            if (!thisPattern.test(fn.toString())) {
                defineProperty(fn, '_nowrap', { value: true });
                return fn;
            }
            if (!fn['_' + ractive._guid]) {
                defineProperty(fn, '_' + ractive._guid, {
                    value: function () {
                        var originalCaptured, result, i, evaluator;
                        originalCaptured = ractive._captured;
                        if (!originalCaptured) {
                            ractive._captured = [];
                        }
                        result = fn.apply(ractive, arguments);
                        if (ractive._captured.length) {
                            i = evaluators.length;
                            while (i--) {
                                evaluator = evaluators[i];
                                evaluator.updateSoftDependencies(ractive._captured);
                            }
                        }
                        ractive._captured = originalCaptured;
                        return result;
                    },
                    writable: true
                });
                for (prop in fn) {
                    if (fn.hasOwnProperty(prop)) {
                        fn['_' + ractive._guid][prop] = fn[prop];
                    }
                }
                fn['_' + ractive._guid + '_evaluators'] = [];
            }
            evaluators = fn['_' + ractive._guid + '_evaluators'];
            index = evaluators.indexOf(evaluator);
            if (index === -1) {
                evaluators.push(evaluator);
            }
            return fn['_' + ractive._guid];
        }
    }(config_types, utils_isEqual, utils_defineProperty, shared_registerDependant, shared_unregisterDependant);
var render_shared_Evaluator_SoftReference = function (isEqual, registerDependant, unregisterDependant) {
        
        var SoftReference = function (root, keypath, evaluator) {
            this.root = root;
            this.keypath = keypath;
            this.priority = evaluator.priority;
            this.evaluator = evaluator;
            registerDependant(this);
        };
        SoftReference.prototype = {
            update: function () {
                var value = this.root.get(this.keypath);
                if (!isEqual(value, this.value)) {
                    this.evaluator.bubble();
                    this.value = value;
                }
            },
            teardown: function () {
                unregisterDependant(this);
            }
        };
        return SoftReference;
    }(utils_isEqual, shared_registerDependant, shared_unregisterDependant);
var render_shared_Evaluator__Evaluator = function (isEqual, defineProperty, clearCache, notifyDependants, registerDependant, unregisterDependant, adaptIfNecessary, Reference, SoftReference) {
        
        var Evaluator, cache = {};
        Evaluator = function (root, keypath, functionStr, args, priority) {
            var i, arg;
            this.root = root;
            this.keypath = keypath;
            this.priority = priority;
            this.fn = getFunctionFromString(functionStr, args.length);
            this.values = [];
            this.refs = [];
            i = args.length;
            while (i--) {
                if (arg = args[i]) {
                    if (arg[0]) {
                        this.values[i] = arg[1];
                    } else {
                        this.refs[this.refs.length] = new Reference(root, arg[1], this, i, priority);
                    }
                } else {
                    this.values[i] = undefined;
                }
            }
            this.selfUpdating = this.refs.length <= 1;
            this.update();
        };
        Evaluator.prototype = {
            bubble: function () {
                if (this.selfUpdating) {
                    this.update();
                } else if (!this.deferred) {
                    this.root._deferred.evals.push(this);
                    this.deferred = true;
                }
            },
            update: function () {
                var value;
                if (this.evaluating) {
                    return this;
                }
                this.evaluating = true;
                try {
                    value = this.fn.apply(null, this.values);
                } catch (err) {
                    if (this.root.debug) {
                        throw err;
                    } else {
                        value = undefined;
                    }
                }
                if (!isEqual(value, this.value)) {
                    clearCache(this.root, this.keypath);
                    this.root._cache[this.keypath] = value;
                    adaptIfNecessary(this.root, this.keypath, value, true);
                    this.value = value;
                    notifyDependants(this.root, this.keypath);
                }
                this.evaluating = false;
                return this;
            },
            teardown: function () {
                while (this.refs.length) {
                    this.refs.pop().teardown();
                }
                clearCache(this.root, this.keypath);
                this.root._evaluators[this.keypath] = null;
            },
            refresh: function () {
                if (!this.selfUpdating) {
                    this.deferred = true;
                }
                var i = this.refs.length;
                while (i--) {
                    this.refs[i].update();
                }
                if (this.deferred) {
                    this.update();
                    this.deferred = false;
                }
            },
            updateSoftDependencies: function (softDeps) {
                var i, keypath, ref;
                if (!this.softRefs) {
                    this.softRefs = [];
                }
                i = this.softRefs.length;
                while (i--) {
                    ref = this.softRefs[i];
                    if (!softDeps[ref.keypath]) {
                        this.softRefs.splice(i, 1);
                        this.softRefs[ref.keypath] = false;
                        ref.teardown();
                    }
                }
                i = softDeps.length;
                while (i--) {
                    keypath = softDeps[i];
                    if (!this.softRefs[keypath]) {
                        ref = new SoftReference(this.root, keypath, this);
                        this.softRefs[this.softRefs.length] = ref;
                        this.softRefs[keypath] = true;
                    }
                }
                this.selfUpdating = this.refs.length + this.softRefs.length <= 1;
            }
        };
        return Evaluator;
        function getFunctionFromString(str, i) {
            var fn, args;
            str = str.replace(/\$\{([0-9]+)\}/g, '_$1');
            if (cache[str]) {
                return cache[str];
            }
            args = [];
            while (i--) {
                args[i] = '_' + i;
            }
            fn = new Function(args.join(','), 'return(' + str + ')');
            cache[str] = fn;
            return fn;
        }
    }(utils_isEqual, utils_defineProperty, shared_clearCache, shared_notifyDependants, shared_registerDependant, shared_unregisterDependant, shared_adaptIfNecessary, render_shared_Evaluator_Reference, render_shared_Evaluator_SoftReference);
var render_shared_ExpressionResolver_ReferenceScout = function (resolveRef, teardown) {
        
        var ReferenceScout = function (resolver, ref, contextStack, argNum) {
            var keypath, root;
            root = this.root = resolver.root;
            keypath = resolveRef(root, ref, contextStack);
            if (keypath !== undefined) {
                resolver.resolveRef(argNum, false, keypath);
            } else {
                this.ref = ref;
                this.argNum = argNum;
                this.resolver = resolver;
                this.contextStack = contextStack;
                root._pendingResolution[root._pendingResolution.length] = this;
            }
        };
        ReferenceScout.prototype = {
            resolve: function (keypath) {
                this.keypath = keypath;
                this.resolver.resolveRef(this.argNum, false, keypath);
            },
            teardown: function () {
                if (!this.keypath) {
                    teardown(this);
                }
            }
        };
        return ReferenceScout;
    }(shared_resolveRef, shared_teardown);
var render_shared_ExpressionResolver_isRegularKeypath = function () {
        
        var keyPattern = /^(?:(?:[a-zA-Z$_][a-zA-Z$_0-9]*)|(?:[0-9]|[1-9][0-9]+))$/;
        return function (keypath) {
            var keys, key, i;
            keys = keypath.split('.');
            i = keys.length;
            while (i--) {
                key = keys[i];
                if (key === 'undefined' || !keyPattern.test(key)) {
                    return false;
                }
            }
            return true;
        };
    }();
var render_shared_ExpressionResolver_getKeypath = function (normaliseKeypath, isRegularKeypath) {
        
        return function (str, args) {
            var unique, normalised;
            unique = str.replace(/\$\{([0-9]+)\}/g, function (match, $1) {
                return args[$1] ? args[$1][1] : 'undefined';
            });
            normalised = normaliseKeypath(unique);
            if (isRegularKeypath(normalised)) {
                return normalised;
            }
            return '${' + unique.replace(/[\.\[\]]/g, '-') + '}';
        };
    }(utils_normaliseKeypath, render_shared_ExpressionResolver_isRegularKeypath);
var render_shared_ExpressionResolver_reassignDependants = function (registerDependant, unregisterDependant) {
        
        return function (ractive, oldKeypath, newKeypath) {
            var toReassign, i, dependant;
            toReassign = [];
            gatherDependants(ractive, oldKeypath, toReassign);
            i = toReassign.length;
            while (i--) {
                dependant = toReassign[i];
                unregisterDependant(dependant);
                dependant.keypath = dependant.keypath.replace(oldKeypath, newKeypath);
                registerDependant(dependant);
                dependant.update();
            }
        };
        function cascade(ractive, oldKeypath, toReassign) {
            var map, i;
            map = ractive._depsMap[oldKeypath];
            if (!map) {
                return;
            }
            i = map.length;
            while (i--) {
                gatherDependants(ractive, map[i], toReassign);
            }
        }
        function gatherDependants(ractive, oldKeypath, toReassign) {
            var priority, dependantsByKeypath, dependants, i;
            priority = ractive._deps.length;
            while (priority--) {
                dependantsByKeypath = ractive._deps[priority];
                if (dependantsByKeypath) {
                    dependants = dependantsByKeypath[oldKeypath];
                    if (dependants) {
                        i = dependants.length;
                        while (i--) {
                            toReassign.push(dependants[i]);
                        }
                    }
                }
            }
            cascade(ractive, oldKeypath, toReassign);
        }
    }(shared_registerDependant, shared_unregisterDependant);
var render_shared_ExpressionResolver__ExpressionResolver = function (Evaluator, ReferenceScout, getKeypath, reassignDependants) {
        
        var ExpressionResolver = function (mustache) {
            var expression, i, len, ref, indexRefs;
            this.root = mustache.root;
            this.mustache = mustache;
            this.args = [];
            this.scouts = [];
            expression = mustache.descriptor.x;
            indexRefs = mustache.parentFragment.indexRefs;
            this.str = expression.s;
            len = this.unresolved = this.args.length = expression.r ? expression.r.length : 0;
            if (!len) {
                this.resolved = this.ready = true;
                this.bubble();
                return;
            }
            for (i = 0; i < len; i += 1) {
                ref = expression.r[i];
                if (indexRefs && indexRefs[ref] !== undefined) {
                    this.resolveRef(i, true, indexRefs[ref]);
                } else {
                    this.scouts[this.scouts.length] = new ReferenceScout(this, ref, mustache.contextStack, i);
                }
            }
            this.ready = true;
            this.bubble();
        };
        ExpressionResolver.prototype = {
            bubble: function () {
                var oldKeypath;
                if (!this.ready) {
                    return;
                }
                oldKeypath = this.keypath;
                this.keypath = getKeypath(this.str, this.args);
                if (this.keypath.substr(0, 2) === '${') {
                    this.createEvaluator();
                }
                if (oldKeypath) {
                    reassignDependants(this.root, oldKeypath, this.keypath);
                } else {
                    this.mustache.resolve(this.keypath);
                }
            },
            teardown: function () {
                while (this.scouts.length) {
                    this.scouts.pop().teardown();
                }
            },
            resolveRef: function (argNum, isIndexRef, value) {
                this.args[argNum] = [
                    isIndexRef,
                    value
                ];
                this.bubble();
                this.resolved = !--this.unresolved;
            },
            createEvaluator: function () {
                if (!this.root._evaluators[this.keypath]) {
                    this.root._evaluators[this.keypath] = new Evaluator(this.root, this.keypath, this.str, this.args, this.mustache.priority);
                } else {
                    this.root._evaluators[this.keypath].refresh();
                }
            }
        };
        return ExpressionResolver;
    }(render_shared_Evaluator__Evaluator, render_shared_ExpressionResolver_ReferenceScout, render_shared_ExpressionResolver_getKeypath, render_shared_ExpressionResolver_reassignDependants);
var render_shared_initMustache = function (resolveRef, ExpressionResolver) {
        
        return function (mustache, options) {
            var keypath, indexRef, parentFragment;
            parentFragment = mustache.parentFragment = options.parentFragment;
            mustache.root = parentFragment.root;
            mustache.contextStack = parentFragment.contextStack;
            mustache.descriptor = options.descriptor;
            mustache.index = options.index || 0;
            mustache.priority = parentFragment.priority;
            mustache.type = options.descriptor.t;
            if (options.descriptor.r) {
                if (parentFragment.indexRefs && parentFragment.indexRefs[options.descriptor.r] !== undefined) {
                    indexRef = parentFragment.indexRefs[options.descriptor.r];
                    mustache.indexRef = options.descriptor.r;
                    mustache.value = indexRef;
                    mustache.render(mustache.value);
                } else {
                    keypath = resolveRef(mustache.root, options.descriptor.r, mustache.contextStack);
                    if (keypath !== undefined) {
                        mustache.resolve(keypath);
                    } else {
                        mustache.ref = options.descriptor.r;
                        mustache.root._pendingResolution[mustache.root._pendingResolution.length] = mustache;
                    }
                }
            }
            if (options.descriptor.x) {
                mustache.expressionResolver = new ExpressionResolver(mustache);
            }
            if (mustache.descriptor.n && !mustache.hasOwnProperty('value')) {
                mustache.render(undefined);
            }
        };
    }(shared_resolveRef, render_shared_ExpressionResolver__ExpressionResolver);
var render_shared_resolveMustache = function (types, registerDependant, unregisterDependant) {
        
        return function (keypath) {
            if (keypath === this.keypath) {
                return;
            }
            if (this.registered) {
                unregisterDependant(this);
            }
            this.keypath = keypath;
            registerDependant(this);
            this.update();
            if (this.root.twoway && this.parentFragment.owner.type === types.ATTRIBUTE) {
                this.parentFragment.owner.element.bind();
            }
            if (this.expressionResolver && this.expressionResolver.resolved) {
                this.expressionResolver = null;
            }
        };
    }(config_types, shared_registerDependant, shared_unregisterDependant);
var render_shared_updateMustache = function (isEqual) {
        
        return function () {
            var wrapped, value;
            value = this.root.get(this.keypath);
            if (wrapped = this.root._wrapped[this.keypath]) {
                value = wrapped.get();
            }
            if (!isEqual(value, this.value)) {
                this.render(value);
                this.value = value;
            }
        };
    }(utils_isEqual);
var render_DomFragment_Interpolator = function (types, teardown, initMustache, resolveMustache, updateMustache) {
        
        var DomInterpolator, lessThan, greaterThan;
        lessThan = /</g;
        greaterThan = />/g;
        DomInterpolator = function (options, docFrag) {
            this.type = types.INTERPOLATOR;
            if (docFrag) {
                this.node = document.createTextNode('');
                docFrag.appendChild(this.node);
            }
            initMustache(this, options);
        };
        DomInterpolator.prototype = {
            update: updateMustache,
            resolve: resolveMustache,
            detach: function () {
                this.node.parentNode.removeChild(this.node);
                return this.node;
            },
            teardown: function (destroy) {
                if (destroy) {
                    this.detach();
                }
                teardown(this);
            },
            render: function (value) {
                if (this.node) {
                    this.node.data = value == undefined ? '' : value;
                }
            },
            firstNode: function () {
                return this.node;
            },
            toString: function () {
                var value = this.value != undefined ? '' + this.value : '';
                return value.replace(lessThan, '&lt;').replace(greaterThan, '&gt;');
            }
        };
        return DomInterpolator;
    }(config_types, shared_teardown, render_shared_initMustache, render_shared_resolveMustache, render_shared_updateMustache);
var render_shared_updateSection = function (isArray, isObject, create) {
        
        return function (section, value) {
            var fragmentOptions;
            fragmentOptions = {
                descriptor: section.descriptor.f,
                root: section.root,
                pNode: section.parentFragment.pNode,
                owner: section
            };
            if (section.descriptor.n) {
                updateConditionalSection(section, value, true, fragmentOptions);
                return;
            }
            if (isArray(value)) {
                updateListSection(section, value, fragmentOptions);
            } else if (isObject(value)) {
                if (section.descriptor.i) {
                    updateListObjectSection(section, value, fragmentOptions);
                } else {
                    updateContextSection(section, fragmentOptions);
                }
            } else {
                updateConditionalSection(section, value, false, fragmentOptions);
            }
        };
        function updateListSection(section, value, fragmentOptions) {
            var i, length, fragmentsToRemove;
            length = value.length;
            if (length < section.length) {
                fragmentsToRemove = section.fragments.splice(length, section.length - length);
                while (fragmentsToRemove.length) {
                    fragmentsToRemove.pop().teardown(true);
                }
            } else {
                if (length > section.length) {
                    for (i = section.length; i < length; i += 1) {
                        fragmentOptions.contextStack = section.contextStack.concat(section.keypath + '.' + i);
                        fragmentOptions.index = i;
                        if (section.descriptor.i) {
                            fragmentOptions.indexRef = section.descriptor.i;
                        }
                        section.fragments[i] = section.createFragment(fragmentOptions);
                    }
                }
            }
            section.length = length;
        }
        function updateListObjectSection(section, value, fragmentOptions) {
            var id, fragmentsById;
            fragmentsById = section.fragmentsById || (section.fragmentsById = create(null));
            for (id in fragmentsById) {
                if (value[id] === undefined && fragmentsById[id]) {
                    fragmentsById[id].teardown(true);
                    fragmentsById[id] = null;
                }
            }
            for (id in value) {
                if (value[id] !== undefined && !fragmentsById[id]) {
                    fragmentOptions.contextStack = section.contextStack.concat(section.keypath + '.' + id);
                    fragmentOptions.index = id;
                    if (section.descriptor.i) {
                        fragmentOptions.indexRef = section.descriptor.i;
                    }
                    fragmentsById[id] = section.createFragment(fragmentOptions);
                }
            }
        }
        function updateContextSection(section, fragmentOptions) {
            if (!section.length) {
                fragmentOptions.contextStack = section.contextStack.concat(section.keypath);
                fragmentOptions.index = 0;
                section.fragments[0] = section.createFragment(fragmentOptions);
                section.length = 1;
            }
        }
        function updateConditionalSection(section, value, inverted, fragmentOptions) {
            var doRender, emptyArray, fragmentsToRemove, fragment;
            emptyArray = isArray(value) && value.length === 0;
            if (inverted) {
                doRender = emptyArray || !value;
            } else {
                doRender = value && !emptyArray;
            }
            if (doRender) {
                if (!section.length) {
                    fragmentOptions.contextStack = section.contextStack;
                    fragmentOptions.index = 0;
                    section.fragments[0] = section.createFragment(fragmentOptions);
                    section.length = 1;
                }
                if (section.length > 1) {
                    fragmentsToRemove = section.fragments.splice(1);
                    while (fragment = fragmentsToRemove.pop()) {
                        fragment.teardown(true);
                    }
                }
            } else if (section.length) {
                section.teardownFragments(true);
                section.length = 0;
            }
        }
    }(utils_isArray, utils_isObject, utils_create);
var render_DomFragment_Section_reassignFragment = function (types, unregisterDependant, ExpressionResolver) {
        
        return reassignFragment;
        function reassignFragment(fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath) {
            var i, item, context, query;
            if (fragment.html) {
                return;
            }
            if (fragment.indexRefs && fragment.indexRefs[indexRef] !== undefined) {
                fragment.indexRefs[indexRef] = newIndex;
            }
            i = fragment.contextStack.length;
            while (i--) {
                context = fragment.contextStack[i];
                if (context.substr(0, oldKeypath.length) === oldKeypath) {
                    fragment.contextStack[i] = context.replace(oldKeypath, newKeypath);
                }
            }
            i = fragment.items.length;
            while (i--) {
                item = fragment.items[i];
                switch (item.type) {
                case types.ELEMENT:
                    reassignElement(item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                    break;
                case types.PARTIAL:
                    reassignFragment(item.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                    break;
                case types.COMPONENT:
                    reassignFragment(item.instance.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                    if (query = fragment.root._liveComponentQueries[item.name]) {
                        query._makeDirty();
                    }
                    break;
                case types.SECTION:
                case types.INTERPOLATOR:
                case types.TRIPLE:
                    reassignMustache(item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                    break;
                }
            }
        }
        function reassignElement(element, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath) {
            var i, attribute, storage, masterEventName, proxies, proxy, binding, bindings, liveQueries, ractive;
            i = element.attributes.length;
            while (i--) {
                attribute = element.attributes[i];
                if (attribute.fragment) {
                    reassignFragment(attribute.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                    if (attribute.twoway) {
                        attribute.updateBindings();
                    }
                }
            }
            if (storage = element.node._ractive) {
                if (storage.keypath.substr(0, oldKeypath.length) === oldKeypath) {
                    storage.keypath = storage.keypath.replace(oldKeypath, newKeypath);
                }
                if (indexRef !== undefined) {
                    storage.index[indexRef] = newIndex;
                }
                for (masterEventName in storage.events) {
                    proxies = storage.events[masterEventName].proxies;
                    i = proxies.length;
                    while (i--) {
                        proxy = proxies[i];
                        if (typeof proxy.n === 'object') {
                            reassignFragment(proxy.a, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                        }
                        if (proxy.d) {
                            reassignFragment(proxy.d, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                        }
                    }
                }
                if (binding = storage.binding) {
                    if (binding.keypath.substr(0, oldKeypath.length) === oldKeypath) {
                        bindings = storage.root._twowayBindings[binding.keypath];
                        bindings.splice(bindings.indexOf(binding), 1);
                        binding.keypath = binding.keypath.replace(oldKeypath, newKeypath);
                        bindings = storage.root._twowayBindings[binding.keypath] || (storage.root._twowayBindings[binding.keypath] = []);
                        bindings.push(binding);
                    }
                }
            }
            if (element.fragment) {
                reassignFragment(element.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
            }
            if (liveQueries = element.liveQueries) {
                ractive = element.root;
                i = liveQueries.length;
                while (i--) {
                    ractive._liveQueries[liveQueries[i]]._makeDirty();
                }
            }
        }
        function reassignMustache(mustache, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath) {
            var i;
            if (mustache.descriptor.x) {
                if (mustache.expressionResolver) {
                    mustache.expressionResolver.teardown();
                }
                mustache.expressionResolver = new ExpressionResolver(mustache);
            }
            if (mustache.keypath) {
                if (mustache.keypath.substr(0, oldKeypath.length) === oldKeypath) {
                    mustache.resolve(mustache.keypath.replace(oldKeypath, newKeypath));
                }
            } else if (mustache.indexRef === indexRef) {
                mustache.value = newIndex;
                mustache.render(newIndex);
            }
            if (mustache.fragments) {
                i = mustache.fragments.length;
                while (i--) {
                    reassignFragment(mustache.fragments[i], indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
                }
            }
        }
    }(config_types, shared_unregisterDependant, render_shared_ExpressionResolver__ExpressionResolver);
var render_DomFragment_Section_reassignFragments = function (types, reassignFragment, preDomUpdate) {
        
        return function (root, section, start, end, by) {
            var i, fragment, indexRef, oldIndex, newIndex, oldKeypath, newKeypath;
            indexRef = section.descriptor.i;
            for (i = start; i < end; i += 1) {
                fragment = section.fragments[i];
                oldIndex = i - by;
                newIndex = i;
                oldKeypath = section.keypath + '.' + (i - by);
                newKeypath = section.keypath + '.' + i;
                fragment.index += by;
                reassignFragment(fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath);
            }
            preDomUpdate(root);
        };
    }(config_types, render_DomFragment_Section_reassignFragment, shared_preDomUpdate);
var render_DomFragment_Section_prototype_merge = function (reassignFragment) {
        
        return function (newIndices) {
            var section = this, parentFragment, firstChange, changed, i, newLength, newFragments, toTeardown, fragmentOptions, fragment, nextNode;
            parentFragment = this.parentFragment;
            newFragments = [];
            newIndices.forEach(function (newIndex, oldIndex) {
                var by, oldKeypath, newKeypath;
                if (newIndex === oldIndex) {
                    newFragments[newIndex] = section.fragments[oldIndex];
                    return;
                }
                if (firstChange === undefined) {
                    firstChange = oldIndex;
                }
                if (newIndex === -1) {
                    (toTeardown || (toTeardown = [])).push(section.fragments[oldIndex]);
                    return;
                }
                by = newIndex - oldIndex;
                oldKeypath = section.keypath + '.' + oldIndex;
                newKeypath = section.keypath + '.' + newIndex;
                reassignFragment(section.fragments[oldIndex], section.descriptor.i, oldIndex, newIndex, by, oldKeypath, newKeypath);
                newFragments[newIndex] = section.fragments[oldIndex];
                changed = true;
            });
            if (toTeardown) {
                while (fragment = toTeardown.pop()) {
                    fragment.teardown(true);
                }
            }
            if (firstChange === undefined) {
                firstChange = this.length;
            }
            newLength = this.root.get(this.keypath).length;
            if (newLength === firstChange) {
                return;
            }
            fragmentOptions = {
                descriptor: this.descriptor.f,
                root: this.root,
                pNode: parentFragment.pNode,
                owner: this
            };
            if (this.descriptor.i) {
                fragmentOptions.indexRef = this.descriptor.i;
            }
            for (i = firstChange; i < newLength; i += 1) {
                if (fragment = newFragments[i]) {
                    this.docFrag.appendChild(fragment.detach(false));
                } else {
                    fragmentOptions.contextStack = this.contextStack.concat(this.keypath + '.' + i);
                    fragmentOptions.index = i;
                    fragment = this.createFragment(fragmentOptions);
                }
                this.fragments[i] = fragment;
            }
            nextNode = parentFragment.findNextNode(this);
            parentFragment.pNode.insertBefore(this.docFrag, nextNode);
            this.length = newLength;
        };
    }(render_DomFragment_Section_reassignFragment);
var circular = function () {
        
        return [];
    }();
var render_DomFragment_Section__Section = function (types, isClient, initMustache, updateMustache, resolveMustache, updateSection, reassignFragment, reassignFragments, merge, teardown, circular) {
        
        var DomSection, DomFragment;
        circular.push(function () {
            DomFragment = circular.DomFragment;
        });
        DomSection = function (options, docFrag) {
            this.type = types.SECTION;
            this.inverted = !!options.descriptor.n;
            this.fragments = [];
            this.length = 0;
            if (docFrag) {
                this.docFrag = document.createDocumentFragment();
            }
            this.initialising = true;
            initMustache(this, options);
            if (docFrag) {
                docFrag.appendChild(this.docFrag);
            }
            this.initialising = false;
        };
        DomSection.prototype = {
            update: updateMustache,
            resolve: resolveMustache,
            smartUpdate: function (methodName, args) {
                var fragmentOptions;
                if (methodName === 'push' || methodName === 'unshift' || methodName === 'splice') {
                    fragmentOptions = {
                        descriptor: this.descriptor.f,
                        root: this.root,
                        pNode: this.parentFragment.pNode,
                        owner: this
                    };
                    if (this.descriptor.i) {
                        fragmentOptions.indexRef = this.descriptor.i;
                    }
                }
                if (this[methodName]) {
                    this.rendering = true;
                    this[methodName](fragmentOptions, args);
                    this.rendering = false;
                }
            },
            pop: function () {
                if (this.length) {
                    this.fragments.pop().teardown(true);
                    this.length -= 1;
                }
            },
            push: function (fragmentOptions, args) {
                var start, end, i;
                start = this.length;
                end = start + args.length;
                for (i = start; i < end; i += 1) {
                    fragmentOptions.contextStack = this.contextStack.concat(this.keypath + '.' + i);
                    fragmentOptions.index = i;
                    this.fragments[i] = this.createFragment(fragmentOptions);
                }
                this.length += args.length;
                this.parentFragment.pNode.insertBefore(this.docFrag, this.parentFragment.findNextNode(this));
            },
            shift: function () {
                this.splice(null, [
                    0,
                    1
                ]);
            },
            unshift: function (fragmentOptions, args) {
                this.splice(fragmentOptions, [
                    0,
                    0
                ].concat(new Array(args.length)));
            },
            splice: function (fragmentOptions, args) {
                var insertionPoint, addedItems, removedItems, balance, i, start, end, spliceArgs, reassignStart;
                if (!args.length) {
                    return;
                }
                start = +(args[0] < 0 ? this.length + args[0] : args[0]);
                addedItems = Math.max(0, args.length - 2);
                removedItems = args[1] !== undefined ? args[1] : this.length - start;
                removedItems = Math.min(removedItems, this.length - start);
                balance = addedItems - removedItems;
                if (!balance) {
                    return;
                }
                if (balance < 0) {
                    end = start - balance;
                    for (i = start; i < end; i += 1) {
                        this.fragments[i].teardown(true);
                    }
                    this.fragments.splice(start, -balance);
                } else {
                    end = start + balance;
                    insertionPoint = this.fragments[start] ? this.fragments[start].firstNode() : this.parentFragment.findNextNode(this);
                    spliceArgs = [
                        start,
                        0
                    ].concat(new Array(balance));
                    this.fragments.splice.apply(this.fragments, spliceArgs);
                    for (i = start; i < end; i += 1) {
                        fragmentOptions.contextStack = this.contextStack.concat(this.keypath + '.' + i);
                        fragmentOptions.index = i;
                        this.fragments[i] = this.createFragment(fragmentOptions);
                    }
                    this.parentFragment.pNode.insertBefore(this.docFrag, insertionPoint);
                }
                this.length += balance;
                reassignStart = start + addedItems;
                reassignFragments(this.root, this, reassignStart, this.length, balance);
            },
            merge: merge,
            detach: function () {
                var i, len;
                len = this.fragments.length;
                for (i = 0; i < len; i += 1) {
                    this.docFrag.appendChild(this.fragments[i].detach());
                }
                return this.docFrag;
            },
            teardown: function (destroy) {
                this.teardownFragments(destroy);
                teardown(this);
            },
            firstNode: function () {
                if (this.fragments[0]) {
                    return this.fragments[0].firstNode();
                }
                return this.parentFragment.findNextNode(this);
            },
            findNextNode: function (fragment) {
                if (this.fragments[fragment.index + 1]) {
                    return this.fragments[fragment.index + 1].firstNode();
                }
                return this.parentFragment.findNextNode(this);
            },
            teardownFragments: function (destroy) {
                var id, fragment;
                while (fragment = this.fragments.shift()) {
                    fragment.teardown(destroy);
                }
                if (this.fragmentsById) {
                    for (id in this.fragmentsById) {
                        if (this.fragments[id]) {
                            this.fragmentsById[id].teardown(destroy);
                            this.fragmentsById[id] = null;
                        }
                    }
                }
            },
            render: function (value) {
                var nextNode, wrapped;
                if (wrapped = this.root._wrapped[this.keypath]) {
                    value = wrapped.get();
                }
                if (this.rendering) {
                    return;
                }
                this.rendering = true;
                updateSection(this, value);
                this.rendering = false;
                if (this.docFrag && !this.docFrag.childNodes.length) {
                    return;
                }
                if (!this.initialising && isClient) {
                    nextNode = this.parentFragment.findNextNode(this);
                    if (nextNode && nextNode.parentNode === this.parentFragment.pNode) {
                        this.parentFragment.pNode.insertBefore(this.docFrag, nextNode);
                    } else {
                        this.parentFragment.pNode.appendChild(this.docFrag);
                    }
                }
            },
            createFragment: function (options) {
                var fragment = new DomFragment(options);
                if (this.docFrag) {
                    this.docFrag.appendChild(fragment.docFrag);
                }
                return fragment;
            },
            toString: function () {
                var str, i, id, len;
                str = '';
                i = 0;
                len = this.length;
                for (i = 0; i < len; i += 1) {
                    str += this.fragments[i].toString();
                }
                if (this.fragmentsById) {
                    for (id in this.fragmentsById) {
                        if (this.fragmentsById[id]) {
                            str += this.fragmentsById[id].toString();
                        }
                    }
                }
                return str;
            },
            find: function (selector) {
                var i, len, queryResult;
                len = this.fragments.length;
                for (i = 0; i < len; i += 1) {
                    if (queryResult = this.fragments[i].find(selector)) {
                        return queryResult;
                    }
                }
                return null;
            },
            findAll: function (selector, query) {
                var i, len;
                len = this.fragments.length;
                for (i = 0; i < len; i += 1) {
                    this.fragments[i].findAll(selector, query);
                }
            },
            findComponent: function (selector) {
                var i, len, queryResult;
                len = this.fragments.length;
                for (i = 0; i < len; i += 1) {
                    if (queryResult = this.fragments[i].findComponent(selector)) {
                        return queryResult;
                    }
                }
                return null;
            },
            findAllComponents: function (selector, query) {
                var i, len;
                len = this.fragments.length;
                for (i = 0; i < len; i += 1) {
                    this.fragments[i].findAllComponents(selector, query);
                }
            }
        };
        return DomSection;
    }(config_types, config_isClient, render_shared_initMustache, render_shared_updateMustache, render_shared_resolveMustache, render_shared_updateSection, render_DomFragment_Section_reassignFragment, render_DomFragment_Section_reassignFragments, render_DomFragment_Section_prototype_merge, shared_teardown, circular);
var render_DomFragment_Triple = function (types, matches, initMustache, updateMustache, resolveMustache, insertHtml, teardown) {
        
        var DomTriple = function (options, docFrag) {
            this.type = types.TRIPLE;
            if (docFrag) {
                this.nodes = [];
                this.docFrag = document.createDocumentFragment();
            }
            this.initialising = true;
            initMustache(this, options);
            if (docFrag) {
                docFrag.appendChild(this.docFrag);
            }
            this.initialising = false;
        };
        DomTriple.prototype = {
            update: updateMustache,
            resolve: resolveMustache,
            detach: function () {
                var i = this.nodes.length;
                while (i--) {
                    this.docFrag.appendChild(this.nodes[i]);
                }
                return this.docFrag;
            },
            teardown: function (destroy) {
                if (destroy) {
                    this.detach();
                    this.docFrag = this.nodes = null;
                }
                teardown(this);
            },
            firstNode: function () {
                if (this.nodes[0]) {
                    return this.nodes[0];
                }
                return this.parentFragment.findNextNode(this);
            },
            render: function (html) {
                var node, pNode;
                if (!this.nodes) {
                    return;
                }
                while (this.nodes.length) {
                    node = this.nodes.pop();
                    node.parentNode.removeChild(node);
                }
                if (!html) {
                    this.nodes = [];
                    return;
                }
                pNode = this.parentFragment.pNode;
                this.nodes = insertHtml(html, pNode.tagName, this.docFrag);
                if (!this.initialising) {
                    pNode.insertBefore(this.docFrag, this.parentFragment.findNextNode(this));
                }
            },
            toString: function () {
                return this.value != undefined ? this.value : '';
            },
            find: function (selector) {
                var i, len, node, queryResult;
                len = this.nodes.length;
                for (i = 0; i < len; i += 1) {
                    node = this.nodes[i];
                    if (node.nodeType !== 1) {
                        continue;
                    }
                    if (matches(node, selector)) {
                        return node;
                    }
                    if (queryResult = node.querySelector(selector)) {
                        return queryResult;
                    }
                }
                return null;
            },
            findAll: function (selector, queryResult) {
                var i, len, node, queryAllResult, numNodes, j;
                len = this.nodes.length;
                for (i = 0; i < len; i += 1) {
                    node = this.nodes[i];
                    if (node.nodeType !== 1) {
                        continue;
                    }
                    if (matches(node, selector)) {
                        queryResult.push(node);
                    }
                    if (queryAllResult = node.querySelectorAll(selector)) {
                        numNodes = queryAllResult.length;
                        for (j = 0; j < numNodes; j += 1) {
                            queryResult.push(queryAllResult[j]);
                        }
                    }
                }
            }
        };
        return DomTriple;
    }(config_types, utils_matches, render_shared_initMustache, render_shared_updateMustache, render_shared_resolveMustache, render_DomFragment_shared_insertHtml, shared_teardown);
var render_DomFragment_Element_initialise_getElementNamespace = function (namespaces) {
        
        return function (descriptor, parentNode) {
            if (descriptor.a && descriptor.a.xmlns) {
                return descriptor.a.xmlns;
            }
            return descriptor.e === 'svg' ? namespaces.svg : parentNode.namespaceURI || namespaces.html;
        };
    }(config_namespaces);
var render_DomFragment_shared_enforceCase = function () {
        
        var svgCamelCaseElements, svgCamelCaseAttributes, createMap, map;
        svgCamelCaseElements = 'altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath vkern'.split(' ');
        svgCamelCaseAttributes = 'attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits contentScriptType contentStyleType diffuseConstant edgeMode externalResourcesRequired filterRes filterUnits glyphRef gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan'.split(' ');
        createMap = function (items) {
            var map = {}, i = items.length;
            while (i--) {
                map[items[i].toLowerCase()] = items[i];
            }
            return map;
        };
        map = createMap(svgCamelCaseElements.concat(svgCamelCaseAttributes));
        return function (elementName) {
            var lowerCaseElementName = elementName.toLowerCase();
            return map[lowerCaseElementName] || lowerCaseElementName;
        };
    }();
var render_DomFragment_Attribute_helpers_determineNameAndNamespace = function (namespaces, enforceCase) {
        
        return function (attribute, name) {
            var colonIndex, namespacePrefix;
            colonIndex = name.indexOf(':');
            if (colonIndex !== -1) {
                namespacePrefix = name.substr(0, colonIndex);
                if (namespacePrefix !== 'xmlns') {
                    name = name.substring(colonIndex + 1);
                    attribute.name = enforceCase(name);
                    attribute.lcName = attribute.name.toLowerCase();
                    attribute.namespace = namespaces[namespacePrefix.toLowerCase()];
                    if (!attribute.namespace) {
                        throw 'Unknown namespace ("' + namespacePrefix + '")';
                    }
                    return;
                }
            }
            attribute.name = attribute.element.namespace !== namespaces.html ? enforceCase(name) : name;
            attribute.lcName = attribute.name.toLowerCase();
        };
    }(config_namespaces, render_DomFragment_shared_enforceCase);
var render_DomFragment_Attribute_helpers_setStaticAttribute = function (namespaces) {
        
        return function (attribute, options) {
            var node, value = options.value === null ? '' : options.value;
            if (node = options.pNode) {
                if (attribute.namespace) {
                    node.setAttributeNS(attribute.namespace, options.name, value);
                } else {
                    if (options.name === 'style' && node.style.setAttribute) {
                        node.style.setAttribute('cssText', value);
                    } else if (options.name === 'class' && (!node.namespaceURI || node.namespaceURI === namespaces.html)) {
                        node.className = value;
                    } else {
                        node.setAttribute(options.name, value);
                    }
                }
                if (attribute.name === 'id') {
                    options.root.nodes[options.value] = node;
                }
                if (attribute.name === 'value') {
                    node._ractive.value = options.value;
                }
            }
            attribute.value = options.value;
        };
    }(config_namespaces);
var render_DomFragment_Attribute_helpers_determinePropertyName = function (namespaces) {
        
        var propertyNames = {
                'accept-charset': 'acceptCharset',
                accesskey: 'accessKey',
                bgcolor: 'bgColor',
                'class': 'className',
                codebase: 'codeBase',
                colspan: 'colSpan',
                contenteditable: 'contentEditable',
                datetime: 'dateTime',
                dirname: 'dirName',
                'for': 'htmlFor',
                'http-equiv': 'httpEquiv',
                ismap: 'isMap',
                maxlength: 'maxLength',
                novalidate: 'noValidate',
                pubdate: 'pubDate',
                readonly: 'readOnly',
                rowspan: 'rowSpan',
                tabindex: 'tabIndex',
                usemap: 'useMap'
            };
        return function (attribute, options) {
            var propertyName;
            if (attribute.pNode && !attribute.namespace && (!options.pNode.namespaceURI || options.pNode.namespaceURI === namespaces.html)) {
                propertyName = propertyNames[attribute.name] || attribute.name;
                if (options.pNode[propertyName] !== undefined) {
                    attribute.propertyName = propertyName;
                }
                if (typeof options.pNode[propertyName] === 'boolean' || propertyName === 'value') {
                    attribute.useProperty = true;
                }
            }
        };
    }(config_namespaces);
var render_DomFragment_Attribute_prototype_bind = function (types, warn, arrayContentsMatch, getValueFromCheckboxes) {
        
        var bindAttribute, getInterpolator, updateModel, update, getBinding, inheritProperties, MultipleSelectBinding, SelectBinding, RadioNameBinding, CheckboxNameBinding, CheckedBinding, FileListBinding, ContentEditableBinding, GenericBinding;
        bindAttribute = function () {
            var node = this.pNode, interpolator, binding, bindings;
            if (!this.fragment) {
                return false;
            }
            interpolator = getInterpolator(this);
            if (!interpolator) {
                return false;
            }
            this.interpolator = interpolator;
            this.keypath = interpolator.keypath || interpolator.descriptor.r;
            binding = getBinding(this);
            if (!binding) {
                return false;
            }
            node._ractive.binding = this.element.binding = binding;
            this.twoway = true;
            bindings = this.root._twowayBindings[this.keypath] || (this.root._twowayBindings[this.keypath] = []);
            bindings[bindings.length] = binding;
            return true;
        };
        updateModel = function () {
            this._ractive.binding.update();
        };
        update = function () {
            var value = this._ractive.root.get(this._ractive.binding.keypath);
            this.value = value == undefined ? '' : value;
        };
        getInterpolator = function (attribute) {
            var item, errorMessage;
            if (attribute.fragment.items.length !== 1) {
                return null;
            }
            item = attribute.fragment.items[0];
            if (item.type !== types.INTERPOLATOR) {
                return null;
            }
            if (!item.keypath && !item.ref) {
                return null;
            }
            if (item.keypath && item.keypath.substr(0, 2) === '${') {
                errorMessage = 'You cannot set up two-way binding against an expression ' + item.keypath;
                if (attribute.root.debug) {
                    warn(errorMessage);
                }
                return null;
            }
            return item;
        };
        getBinding = function (attribute) {
            var node = attribute.pNode;
            if (node.tagName === 'SELECT') {
                return node.multiple ? new MultipleSelectBinding(attribute, node) : new SelectBinding(attribute, node);
            }
            if (node.type === 'checkbox' || node.type === 'radio') {
                if (attribute.propertyName === 'name') {
                    if (node.type === 'checkbox') {
                        return new CheckboxNameBinding(attribute, node);
                    }
                    if (node.type === 'radio') {
                        return new RadioNameBinding(attribute, node);
                    }
                }
                if (attribute.propertyName === 'checked') {
                    return new CheckedBinding(attribute, node);
                }
                return null;
            }
            if (attribute.lcName !== 'value') {
                warn('This is... odd');
            }
            if (node.type === 'file') {
                return new FileListBinding(attribute, node);
            }
            if (node.getAttribute('contenteditable')) {
                return new ContentEditableBinding(attribute, node);
            }
            return new GenericBinding(attribute, node);
        };
        MultipleSelectBinding = function (attribute, node) {
            var valueFromModel;
            inheritProperties(this, attribute, node);
            node.addEventListener('change', updateModel, false);
            valueFromModel = this.root.get(this.keypath);
            if (valueFromModel === undefined) {
                this.update();
            }
        };
        MultipleSelectBinding.prototype = {
            value: function () {
                var value, options, i, len;
                value = [];
                options = this.node.options;
                len = options.length;
                for (i = 0; i < len; i += 1) {
                    if (options[i].selected) {
                        value[value.length] = options[i]._ractive.value;
                    }
                }
                return value;
            },
            update: function () {
                var attribute, previousValue, value;
                attribute = this.attr;
                previousValue = attribute.value;
                value = this.value();
                if (previousValue === undefined || !arrayContentsMatch(value, previousValue)) {
                    attribute.receiving = true;
                    attribute.value = value;
                    this.root.set(this.keypath, value);
                    attribute.receiving = false;
                }
                return this;
            },
            deferUpdate: function () {
                if (this.deferred === true) {
                    return;
                }
                this.root._deferred.attrs.push(this);
                this.deferred = true;
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
            }
        };
        SelectBinding = function (attribute, node) {
            var valueFromModel;
            inheritProperties(this, attribute, node);
            node.addEventListener('change', updateModel, false);
            valueFromModel = this.root.get(this.keypath);
            if (valueFromModel === undefined) {
                this.update();
            }
        };
        SelectBinding.prototype = {
            value: function () {
                var options, i, len;
                options = this.node.options;
                len = options.length;
                for (i = 0; i < len; i += 1) {
                    if (options[i].selected) {
                        return options[i]._ractive.value;
                    }
                }
            },
            update: function () {
                var value = this.value();
                this.attr.receiving = true;
                this.attr.value = value;
                this.root.set(this.keypath, value);
                this.attr.receiving = false;
                return this;
            },
            deferUpdate: function () {
                if (this.deferred === true) {
                    return;
                }
                this.root._deferred.attrs.push(this);
                this.deferred = true;
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
            }
        };
        RadioNameBinding = function (attribute, node) {
            var valueFromModel;
            this.radioName = true;
            inheritProperties(this, attribute, node);
            node.name = '{{' + attribute.keypath + '}}';
            node.addEventListener('change', updateModel, false);
            if (node.attachEvent) {
                node.addEventListener('click', updateModel, false);
            }
            valueFromModel = this.root.get(this.keypath);
            if (valueFromModel !== undefined) {
                node.checked = valueFromModel == node._ractive.value;
            } else {
                this.root._deferred.radios.push(this);
            }
        };
        RadioNameBinding.prototype = {
            value: function () {
                return this.node._ractive ? this.node._ractive.value : this.node.value;
            },
            update: function () {
                var node = this.node;
                if (node.checked) {
                    this.attr.receiving = true;
                    this.root.set(this.keypath, this.value());
                    this.attr.receiving = false;
                }
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
                this.node.removeEventListener('click', updateModel, false);
            }
        };
        CheckboxNameBinding = function (attribute, node) {
            var valueFromModel, checked;
            this.checkboxName = true;
            inheritProperties(this, attribute, node);
            node.name = '{{' + this.keypath + '}}';
            node.addEventListener('change', updateModel, false);
            if (node.attachEvent) {
                node.addEventListener('click', updateModel, false);
            }
            valueFromModel = this.root.get(this.keypath);
            if (valueFromModel !== undefined) {
                checked = valueFromModel.indexOf(node._ractive.value) !== -1;
                node.checked = checked;
            } else {
                if (this.root._deferred.checkboxes.indexOf(this.keypath) === -1) {
                    this.root._deferred.checkboxes.push(this.keypath);
                }
            }
        };
        CheckboxNameBinding.prototype = {
            changed: function () {
                return this.node.checked !== !!this.checked;
            },
            update: function () {
                this.checked = this.node.checked;
                this.attr.receiving = true;
                this.root.set(this.keypath, getValueFromCheckboxes(this.root, this.keypath));
                this.attr.receiving = false;
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
                this.node.removeEventListener('click', updateModel, false);
            }
        };
        CheckedBinding = function (attribute, node) {
            inheritProperties(this, attribute, node);
            node.addEventListener('change', updateModel, false);
            if (node.attachEvent) {
                node.addEventListener('click', updateModel, false);
            }
        };
        CheckedBinding.prototype = {
            value: function () {
                return this.node.checked;
            },
            update: function () {
                this.attr.receiving = true;
                this.root.set(this.keypath, this.value());
                this.attr.receiving = false;
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
                this.node.removeEventListener('click', updateModel, false);
            }
        };
        FileListBinding = function (attribute, node) {
            inheritProperties(this, attribute, node);
            node.addEventListener('change', updateModel, false);
        };
        FileListBinding.prototype = {
            value: function () {
                return this.attr.pNode.files;
            },
            update: function () {
                this.attr.root.set(this.attr.keypath, this.value());
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
            }
        };
        ContentEditableBinding = function (attribute, node) {
            inheritProperties(this, attribute, node);
            node.addEventListener('change', updateModel, false);
            if (!this.root.lazy) {
                node.addEventListener('input', updateModel, false);
                if (node.attachEvent) {
                    node.addEventListener('keyup', updateModel, false);
                }
            }
        };
        ContentEditableBinding.prototype = {
            update: function () {
                this.attr.receiving = true;
                this.root.set(this.keypath, this.node.innerHTML);
                this.attr.receiving = false;
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
                this.node.removeEventListener('input', updateModel, false);
                this.node.removeEventListener('keyup', updateModel, false);
            }
        };
        GenericBinding = function (attribute, node) {
            inheritProperties(this, attribute, node);
            node.addEventListener('change', updateModel, false);
            if (!this.root.lazy) {
                node.addEventListener('input', updateModel, false);
                if (node.attachEvent) {
                    node.addEventListener('keyup', updateModel, false);
                }
            }
            this.node.addEventListener('blur', update, false);
        };
        GenericBinding.prototype = {
            value: function () {
                var value = this.attr.pNode.value;
                if (+value + '' === value && value.indexOf('e') === -1) {
                    value = +value;
                }
                return value;
            },
            update: function () {
                var attribute = this.attr, value = this.value();
                attribute.receiving = true;
                attribute.root.set(attribute.keypath, value);
                attribute.receiving = false;
            },
            teardown: function () {
                this.node.removeEventListener('change', updateModel, false);
                this.node.removeEventListener('input', updateModel, false);
                this.node.removeEventListener('keyup', updateModel, false);
                this.node.removeEventListener('blur', update, false);
            }
        };
        inheritProperties = function (binding, attribute, node) {
            binding.attr = attribute;
            binding.node = node;
            binding.root = attribute.root;
            binding.keypath = attribute.keypath;
        };
        return bindAttribute;
    }(config_types, utils_warn, utils_arrayContentsMatch, shared_getValueFromCheckboxes);
var render_DomFragment_Attribute_prototype_update = function (isArray, namespaces) {
        
        var updateAttribute, updateFileInputValue, deferSelect, initSelect, updateSelect, updateMultipleSelect, updateRadioName, updateCheckboxName, updateIEStyleAttribute, updateClassName, updateContentEditableValue, updateEverythingElse;
        updateAttribute = function () {
            var node;
            if (!this.ready) {
                return this;
            }
            node = this.pNode;
            if (node.tagName === 'SELECT' && this.lcName === 'value') {
                this.update = deferSelect;
                this.deferredUpdate = initSelect;
                return this.update();
            }
            if (this.isFileInputValue) {
                this.update = updateFileInputValue;
                return this;
            }
            if (this.twoway && this.lcName === 'name') {
                if (node.type === 'radio') {
                    this.update = updateRadioName;
                    return this.update();
                }
                if (node.type === 'checkbox') {
                    this.update = updateCheckboxName;
                    return this.update();
                }
            }
            if (this.lcName === 'style' && node.style.setAttribute) {
                this.update = updateIEStyleAttribute;
                return this.update();
            }
            if (this.lcName === 'class' && (!node.namespaceURI || node.namespaceURI === namespaces.html)) {
                this.update = updateClassName;
                return this.update();
            }
            if (node.getAttribute('contenteditable') && this.lcName === 'value') {
                this.update = updateContentEditableValue;
                return this.update();
            }
            this.update = updateEverythingElse;
            return this.update();
        };
        updateFileInputValue = function () {
            return this;
        };
        initSelect = function () {
            this.deferredUpdate = this.pNode.multiple ? updateMultipleSelect : updateSelect;
            this.deferredUpdate();
        };
        deferSelect = function () {
            this.root._deferred.selectValues.push(this);
            return this;
        };
        updateSelect = function () {
            var value = this.fragment.getValue(), options, option, i;
            this.value = this.pNode._ractive.value = value;
            options = this.pNode.options;
            i = options.length;
            while (i--) {
                option = options[i];
                if (option._ractive.value == value) {
                    option.selected = true;
                    return this;
                }
            }
            return this;
        };
        updateMultipleSelect = function () {
            var value = this.fragment.getValue(), options, i;
            if (!isArray(value)) {
                value = [value];
            }
            options = this.pNode.options;
            i = options.length;
            while (i--) {
                options[i].selected = value.indexOf(options[i]._ractive.value) !== -1;
            }
            this.value = value;
            return this;
        };
        updateRadioName = function () {
            var node, value;
            node = this.pNode;
            value = this.fragment.getValue();
            node.checked = value == node._ractive.value;
            return this;
        };
        updateCheckboxName = function () {
            var node, value;
            node = this.pNode;
            value = this.fragment.getValue();
            if (!isArray(value)) {
                node.checked = value == node._ractive.value;
                return this;
            }
            node.checked = value.indexOf(node._ractive.value) !== -1;
            return this;
        };
        updateIEStyleAttribute = function () {
            var node, value;
            node = this.pNode;
            value = this.fragment.getValue();
            if (value === undefined) {
                value = '';
            }
            if (value !== this.value) {
                node.style.setAttribute('cssText', value);
                this.value = value;
            }
            return this;
        };
        updateClassName = function () {
            var node, value;
            node = this.pNode;
            value = this.fragment.getValue();
            if (value === undefined) {
                value = '';
            }
            if (value !== this.value) {
                node.className = value;
                this.value = value;
            }
            return this;
        };
        updateContentEditableValue = function () {
            var node, value;
            node = this.pNode;
            value = this.fragment.getValue();
            if (value === undefined) {
                value = '';
            }
            if (value !== this.value) {
                if (!this.receiving) {
                    node.innerHTML = value;
                }
                this.value = value;
            }
            return this;
        };
        updateEverythingElse = function () {
            var node, value;
            node = this.pNode;
            value = this.fragment.getValue();
            if (this.isValueAttribute) {
                node._ractive.value = value;
            }
            if (value === undefined) {
                value = '';
            }
            if (value !== this.value) {
                if (this.useProperty) {
                    if (!this.receiving) {
                        node[this.propertyName] = value;
                    }
                    this.value = value;
                    return this;
                }
                if (this.namespace) {
                    node.setAttributeNS(this.namespace, this.name, value);
                    this.value = value;
                    return this;
                }
                if (this.lcName === 'id') {
                    if (this.value !== undefined) {
                        this.root.nodes[this.value] = undefined;
                    }
                    this.root.nodes[value] = node;
                }
                node.setAttribute(this.name, value);
                this.value = value;
            }
            return this;
        };
        return updateAttribute;
    }(utils_isArray, config_namespaces);
var parse_Tokenizer_utils_getStringMatch = function () {
        
        return function (string) {
            var substr;
            substr = this.str.substr(this.pos, string.length);
            if (substr === string) {
                this.pos += string.length;
                return string;
            }
            return null;
        };
    }();
var parse_Tokenizer_utils_allowWhitespace = function () {
        
        var leadingWhitespace = /^\s+/;
        return function () {
            var match = leadingWhitespace.exec(this.remaining());
            if (!match) {
                return null;
            }
            this.pos += match[0].length;
            return match[0];
        };
    }();
var parse_Tokenizer_utils_makeRegexMatcher = function () {
        
        return function (regex) {
            return function (tokenizer) {
                var match = regex.exec(tokenizer.str.substring(tokenizer.pos));
                if (!match) {
                    return null;
                }
                tokenizer.pos += match[0].length;
                return match[1] || match[0];
            };
        };
    }();
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getEscapedChars = function () {
        
        return function (tokenizer) {
            var chars = '', character;
            character = getEscapedChar(tokenizer);
            while (character) {
                chars += character;
                character = getEscapedChar(tokenizer);
            }
            return chars || null;
        };
        function getEscapedChar(tokenizer) {
            var character;
            if (!tokenizer.getStringMatch('\\')) {
                return null;
            }
            character = tokenizer.str.charAt(tokenizer.pos);
            tokenizer.pos += 1;
            return character;
        }
    }();
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getQuotedString = function (makeRegexMatcher, getEscapedChars) {
        
        var getUnescapedDoubleQuotedChars = makeRegexMatcher(/^[^\\"]+/), getUnescapedSingleQuotedChars = makeRegexMatcher(/^[^\\']+/);
        return function getQuotedString(tokenizer, singleQuotes) {
            var start, string, escaped, unescaped, next, matcher;
            start = tokenizer.pos;
            string = '';
            matcher = singleQuotes ? getUnescapedSingleQuotedChars : getUnescapedDoubleQuotedChars;
            escaped = getEscapedChars(tokenizer);
            if (escaped) {
                string += escaped;
            }
            unescaped = matcher(tokenizer);
            if (unescaped) {
                string += unescaped;
            }
            if (!string) {
                return '';
            }
            next = getQuotedString(tokenizer, singleQuotes);
            while (next !== '') {
                string += next;
            }
            return string;
        };
    }(parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getEscapedChars);
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral = function (types, getQuotedString) {
        
        return function (tokenizer) {
            var start, string;
            start = tokenizer.pos;
            if (tokenizer.getStringMatch('"')) {
                string = getQuotedString(tokenizer, false);
                if (!tokenizer.getStringMatch('"')) {
                    tokenizer.pos = start;
                    return null;
                }
                return {
                    t: types.STRING_LITERAL,
                    v: string
                };
            }
            if (tokenizer.getStringMatch('\'')) {
                string = getQuotedString(tokenizer, true);
                if (!tokenizer.getStringMatch('\'')) {
                    tokenizer.pos = start;
                    return null;
                }
                return {
                    t: types.STRING_LITERAL,
                    v: string
                };
            }
            return null;
        };
    }(config_types, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getQuotedString);
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getNumberLiteral = function (types, makeRegexMatcher) {
        
        var getNumber = makeRegexMatcher(/^(?:[+-]?)(?:(?:(?:0|[1-9]\d*)?\.\d+)|(?:(?:0|[1-9]\d*)\.)|(?:0|[1-9]\d*))(?:[eE][+-]?\d+)?/);
        return function (tokenizer) {
            var result;
            if (result = getNumber(tokenizer)) {
                return {
                    t: types.NUMBER_LITERAL,
                    v: result
                };
            }
            return null;
        };
    }(config_types, parse_Tokenizer_utils_makeRegexMatcher);
var parse_Tokenizer_getExpression_shared_getName = function (makeRegexMatcher) {
        
        return makeRegexMatcher(/^[a-zA-Z_$][a-zA-Z_$0-9]*/);
    }(parse_Tokenizer_utils_makeRegexMatcher);
var parse_Tokenizer_getExpression_shared_getKey = function (getStringLiteral, getNumberLiteral, getName) {
        
        var identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
        return function (tokenizer) {
            var token;
            if (token = getStringLiteral(tokenizer)) {
                return identifier.test(token.v) ? token.v : '"' + token.v.replace(/"/g, '\\"') + '"';
            }
            if (token = getNumberLiteral(tokenizer)) {
                return token.v;
            }
            if (token = getName(tokenizer)) {
                return token;
            }
        };
    }(parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getNumberLiteral, parse_Tokenizer_getExpression_shared_getName);
var utils_parseJSON = function (getStringMatch, allowWhitespace, getStringLiteral, getKey) {
        
        var Tokenizer, specials, specialsPattern, numberPattern, placeholderPattern, placeholderAtStartPattern;
        specials = {
            'true': true,
            'false': false,
            'undefined': undefined,
            'null': null
        };
        specialsPattern = new RegExp('^(?:' + Object.keys(specials).join('|') + ')');
        numberPattern = /^(?:[+-]?)(?:(?:(?:0|[1-9]\d*)?\.\d+)|(?:(?:0|[1-9]\d*)\.)|(?:0|[1-9]\d*))(?:[eE][+-]?\d+)?/;
        placeholderPattern = /\$\{([^\}]+)\}/g;
        placeholderAtStartPattern = /^\$\{([^\}]+)\}/;
        Tokenizer = function (str, values) {
            this.str = str;
            this.values = values;
            this.pos = 0;
            this.result = this.getToken();
        };
        Tokenizer.prototype = {
            remaining: function () {
                return this.str.substring(this.pos);
            },
            getStringMatch: getStringMatch,
            getToken: function () {
                this.allowWhitespace();
                return this.getPlaceholder() || this.getSpecial() || this.getNumber() || this.getString() || this.getObject() || this.getArray();
            },
            getPlaceholder: function () {
                var match;
                if (!this.values) {
                    return null;
                }
                if ((match = placeholderAtStartPattern.exec(this.remaining())) && this.values.hasOwnProperty(match[1])) {
                    this.pos += match[0].length;
                    return { v: this.values[match[1]] };
                }
            },
            getSpecial: function () {
                var match;
                if (match = specialsPattern.exec(this.remaining())) {
                    this.pos += match[0].length;
                    return { v: specials[match[0]] };
                }
            },
            getNumber: function () {
                var match;
                if (match = numberPattern.exec(this.remaining())) {
                    this.pos += match[0].length;
                    return { v: +match[0] };
                }
            },
            getString: function () {
                var stringLiteral = getStringLiteral(this), values;
                if (stringLiteral && (values = this.values)) {
                    return {
                        v: stringLiteral.v.replace(placeholderPattern, function (match, $1) {
                            return values[$1] || $1;
                        })
                    };
                }
                return stringLiteral;
            },
            getObject: function () {
                var result, pair;
                if (!this.getStringMatch('{')) {
                    return null;
                }
                result = {};
                while (pair = getKeyValuePair(this)) {
                    result[pair.key] = pair.value;
                    this.allowWhitespace();
                    if (this.getStringMatch('}')) {
                        return { v: result };
                    }
                    if (!this.getStringMatch(',')) {
                        return null;
                    }
                }
                return null;
            },
            getArray: function () {
                var result, valueToken;
                if (!this.getStringMatch('[')) {
                    return null;
                }
                result = [];
                while (valueToken = this.getToken()) {
                    result.push(valueToken.v);
                    if (this.getStringMatch(']')) {
                        return { v: result };
                    }
                    if (!this.getStringMatch(',')) {
                        return null;
                    }
                }
                return null;
            },
            allowWhitespace: allowWhitespace
        };
        function getKeyValuePair(tokenizer) {
            var key, valueToken, pair;
            tokenizer.allowWhitespace();
            key = getKey(tokenizer);
            if (!key) {
                return null;
            }
            pair = { key: key };
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch(':')) {
                return null;
            }
            tokenizer.allowWhitespace();
            valueToken = tokenizer.getToken();
            if (!valueToken) {
                return null;
            }
            pair.value = valueToken.v;
            return pair;
        }
        return function (str, values) {
            var tokenizer = new Tokenizer(str, values);
            if (tokenizer.result) {
                return {
                    value: tokenizer.result.v,
                    remaining: tokenizer.remaining()
                };
            }
            return null;
        };
    }(parse_Tokenizer_utils_getStringMatch, parse_Tokenizer_utils_allowWhitespace, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral, parse_Tokenizer_getExpression_shared_getKey);
var render_StringFragment_Interpolator = function (types, teardown, initMustache, updateMustache, resolveMustache) {
        
        var StringInterpolator = function (options) {
            this.type = types.INTERPOLATOR;
            initMustache(this, options);
        };
        StringInterpolator.prototype = {
            update: updateMustache,
            resolve: resolveMustache,
            render: function (value) {
                this.value = value;
                this.parentFragment.bubble();
            },
            teardown: function () {
                teardown(this);
            },
            toString: function () {
                if (this.value == undefined) {
                    return '';
                }
                return stringify(this.value);
            }
        };
        return StringInterpolator;
        function stringify(value) {
            if (typeof value === 'string') {
                return value;
            }
            return JSON.stringify(value);
        }
    }(config_types, shared_teardown, render_shared_initMustache, render_shared_updateMustache, render_shared_resolveMustache);
var render_StringFragment_Section = function (types, initMustache, updateMustache, resolveMustache, updateSection, teardown, circular) {
        
        var StringSection, StringFragment;
        circular.push(function () {
            StringFragment = circular.StringFragment;
        });
        StringSection = function (options) {
            this.type = types.SECTION;
            this.fragments = [];
            this.length = 0;
            initMustache(this, options);
        };
        StringSection.prototype = {
            update: updateMustache,
            resolve: resolveMustache,
            teardown: function () {
                this.teardownFragments();
                teardown(this);
            },
            teardownFragments: function () {
                while (this.fragments.length) {
                    this.fragments.shift().teardown();
                }
                this.length = 0;
            },
            bubble: function () {
                this.value = this.fragments.join('');
                this.parentFragment.bubble();
            },
            render: function (value) {
                var wrapped;
                if (wrapped = this.root._wrapped[this.keypath]) {
                    value = wrapped.get();
                }
                updateSection(this, value);
                this.parentFragment.bubble();
            },
            createFragment: function (options) {
                return new StringFragment(options);
            },
            toString: function () {
                return this.fragments.join('');
            }
        };
        return StringSection;
    }(config_types, render_shared_initMustache, render_shared_updateMustache, render_shared_resolveMustache, render_shared_updateSection, shared_teardown, circular);
var render_StringFragment_Text = function (types) {
        
        var StringText = function (text) {
            this.type = types.TEXT;
            this.text = text;
        };
        StringText.prototype = {
            toString: function () {
                return this.text;
            },
            teardown: function () {
            }
        };
        return StringText;
    }(config_types);
var render_StringFragment_prototype_toArgsList = function (warn, parseJSON) {
        
        return function () {
            var values, counter, jsonesque, guid, errorMessage, parsed, processItems;
            if (!this.argsList || this.dirty) {
                values = {};
                counter = 0;
                guid = this.root._guid;
                processItems = function (items) {
                    return items.map(function (item) {
                        var placeholderId, wrapped, value;
                        if (item.text) {
                            return item.text;
                        }
                        if (item.fragments) {
                            return item.fragments.map(function (fragment) {
                                return processItems(fragment.items);
                            }).join('');
                        }
                        placeholderId = guid + '-' + counter++;
                        if (wrapped = item.root._wrapped[item.keypath]) {
                            value = wrapped.value;
                        } else {
                            value = item.value;
                        }
                        values[placeholderId] = value;
                        return '${' + placeholderId + '}';
                    }).join('');
                };
                jsonesque = processItems(this.items);
                parsed = parseJSON('[' + jsonesque + ']', values);
                if (!parsed) {
                    errorMessage = 'Could not parse directive arguments (' + this.toString() + '). If you think this is a bug, please file an issue at http://github.com/RactiveJS/Ractive/issues';
                    if (this.root.debug) {
                        throw new Error(errorMessage);
                    } else {
                        warn(errorMessage);
                        this.argsList = [jsonesque];
                    }
                } else {
                    this.argsList = parsed.value;
                }
                this.dirty = false;
            }
            return this.argsList;
        };
    }(utils_warn, utils_parseJSON);
var render_StringFragment__StringFragment = function (types, parseJSON, initFragment, Interpolator, Section, Text, toArgsList, circular) {
        
        var StringFragment = function (options) {
            initFragment(this, options);
        };
        StringFragment.prototype = {
            createItem: function (options) {
                if (typeof options.descriptor === 'string') {
                    return new Text(options.descriptor);
                }
                switch (options.descriptor.t) {
                case types.INTERPOLATOR:
                    return new Interpolator(options);
                case types.TRIPLE:
                    return new Interpolator(options);
                case types.SECTION:
                    return new Section(options);
                default:
                    throw 'Something went wrong in a rather interesting way';
                }
            },
            bubble: function () {
                this.dirty = true;
                this.owner.bubble();
            },
            teardown: function () {
                var numItems, i;
                numItems = this.items.length;
                for (i = 0; i < numItems; i += 1) {
                    this.items[i].teardown();
                }
            },
            getValue: function () {
                var value;
                if (this.items.length === 1 && this.items[0].type === types.INTERPOLATOR) {
                    value = this.items[0].value;
                    if (value !== undefined) {
                        return value;
                    }
                }
                return this.toString();
            },
            isSimple: function () {
                var i, item, containsInterpolator;
                if (this.simple !== undefined) {
                    return this.simple;
                }
                i = this.items.length;
                while (i--) {
                    item = this.items[i];
                    if (item.type === types.TEXT) {
                        continue;
                    }
                    if (item.type === types.INTERPOLATOR) {
                        if (containsInterpolator) {
                            return false;
                        } else {
                            containsInterpolator = true;
                            continue;
                        }
                    }
                    return this.simple = false;
                }
                return this.simple = true;
            },
            toString: function () {
                return this.items.join('');
            },
            toJSON: function () {
                var value = this.getValue(), parsed;
                if (typeof value === 'string') {
                    parsed = parseJSON(value);
                    value = parsed ? parsed.value : value;
                }
                return value;
            },
            toArgsList: toArgsList
        };
        circular.StringFragment = StringFragment;
        return StringFragment;
    }(config_types, utils_parseJSON, render_shared_initFragment, render_StringFragment_Interpolator, render_StringFragment_Section, render_StringFragment_Text, render_StringFragment_prototype_toArgsList, circular);
var render_DomFragment_Attribute__Attribute = function (types, determineNameAndNamespace, setStaticAttribute, determinePropertyName, bind, update, StringFragment) {
        
        var DomAttribute = function (options) {
            this.type = types.ATTRIBUTE;
            this.element = options.element;
            determineNameAndNamespace(this, options.name);
            if (options.value === null || typeof options.value === 'string') {
                setStaticAttribute(this, options);
                return;
            }
            this.root = options.root;
            this.pNode = options.pNode;
            this.parentFragment = this.element.parentFragment;
            this.fragment = new StringFragment({
                descriptor: options.value,
                root: this.root,
                owner: this,
                contextStack: options.contextStack
            });
            if (!this.pNode) {
                return;
            }
            if (this.name === 'value') {
                this.isValueAttribute = true;
                if (this.pNode.tagName === 'INPUT' && this.pNode.type === 'file') {
                    this.isFileInputValue = true;
                }
            }
            determinePropertyName(this, options);
            this.selfUpdating = this.fragment.isSimple();
            this.ready = true;
        };
        DomAttribute.prototype = {
            bind: bind,
            update: update,
            updateBindings: function () {
                this.keypath = this.interpolator.keypath || this.interpolator.ref;
                if (this.propertyName === 'name') {
                    this.pNode.name = '{{' + this.keypath + '}}';
                }
            },
            teardown: function () {
                var i;
                if (this.boundEvents) {
                    i = this.boundEvents.length;
                    while (i--) {
                        this.pNode.removeEventListener(this.boundEvents[i], this.updateModel, false);
                    }
                }
                if (this.fragment) {
                    this.fragment.teardown();
                }
            },
            bubble: function () {
                if (this.selfUpdating) {
                    this.update();
                } else if (!this.deferred && this.ready) {
                    this.root._deferred.attrs.push(this);
                    this.deferred = true;
                }
            },
            toString: function () {
                var str;
                if (this.value === null) {
                    return this.name;
                }
                if (!this.fragment) {
                    return this.name + '=' + JSON.stringify(this.value);
                }
                str = this.fragment.toString();
                return this.name + '=' + JSON.stringify(str);
            }
        };
        return DomAttribute;
    }(config_types, render_DomFragment_Attribute_helpers_determineNameAndNamespace, render_DomFragment_Attribute_helpers_setStaticAttribute, render_DomFragment_Attribute_helpers_determinePropertyName, render_DomFragment_Attribute_prototype_bind, render_DomFragment_Attribute_prototype_update, render_StringFragment__StringFragment);
var render_DomFragment_Element_initialise_createElementAttributes = function (DomAttribute) {
        
        return function (element, attributes) {
            var attrName, attrValue, attr;
            element.attributes = [];
            for (attrName in attributes) {
                if (attributes.hasOwnProperty(attrName)) {
                    attrValue = attributes[attrName];
                    attr = new DomAttribute({
                        element: element,
                        name: attrName,
                        value: attrValue,
                        root: element.root,
                        pNode: element.node,
                        contextStack: element.parentFragment.contextStack
                    });
                    element.attributes[element.attributes.length] = element.attributes[attrName] = attr;
                    if (attrName !== 'name') {
                        attr.update();
                    }
                }
            }
            return element.attributes;
        };
    }(render_DomFragment_Attribute__Attribute);
var render_DomFragment_Element_initialise_appendElementChildren = function (warn, namespaces, StringFragment, circular) {
        
        var DomFragment, updateCss, updateScript;
        circular.push(function () {
            DomFragment = circular.DomFragment;
        });
        updateCss = function () {
            var node = this.node, content = this.fragment.toString();
            if (node.styleSheet) {
                node.styleSheet.cssText = content;
            }
            node.innerHTML = content;
        };
        updateScript = function () {
            if (!this.node.type || this.node.type === 'text/javascript') {
                warn('Script tag was updated. This does not cause the code to be re-evaluated!');
            }
            this.node.innerHTML = this.fragment.toString();
        };
        return function (element, node, descriptor, docFrag) {
            var liveQueries, i, selector, queryAllResult, j;
            if (element.lcName === 'script' || element.lcName === 'style') {
                element.fragment = new StringFragment({
                    descriptor: descriptor.f,
                    root: element.root,
                    contextStack: element.parentFragment.contextStack,
                    owner: element
                });
                if (docFrag) {
                    if (element.lcName === 'script') {
                        element.bubble = updateScript;
                        element.node.innerHTML = element.fragment.toString();
                    } else {
                        element.bubble = updateCss;
                        element.bubble();
                    }
                }
                return;
            }
            if (typeof descriptor.f === 'string' && (!node || (!node.namespaceURI || node.namespaceURI === namespaces.html))) {
                element.html = descriptor.f;
                if (docFrag) {
                    node.innerHTML = element.html;
                    liveQueries = element.root._liveQueries;
                    i = liveQueries.length;
                    while (i--) {
                        selector = liveQueries[i];
                        if ((queryAllResult = node.querySelectorAll(selector)) && (j = queryAllResult.length)) {
                            (element.liveQueries || (element.liveQueries = [])).push(selector);
                            element.liveQueries[selector] = [];
                            while (j--) {
                                element.liveQueries[selector][j] = queryAllResult[j];
                            }
                        }
                    }
                }
            } else {
                element.fragment = new DomFragment({
                    descriptor: descriptor.f,
                    root: element.root,
                    pNode: node,
                    contextStack: element.parentFragment.contextStack,
                    owner: element
                });
                if (docFrag) {
                    node.appendChild(element.fragment.docFrag);
                }
            }
        };
    }(utils_warn, config_namespaces, render_StringFragment__StringFragment, circular);
var render_DomFragment_Element_initialise_decorate_Decorator = function (warn, StringFragment) {
        
        var Decorator = function (descriptor, root, owner, contextStack) {
            var name, fragment, errorMessage;
            this.root = root;
            this.node = owner.node;
            name = descriptor.n || descriptor;
            if (typeof name !== 'string') {
                fragment = new StringFragment({
                    descriptor: name,
                    root: this.root,
                    owner: owner,
                    contextStack: contextStack
                });
                name = fragment.toString();
                fragment.teardown();
            }
            if (descriptor.a) {
                this.params = descriptor.a;
            } else if (descriptor.d) {
                fragment = new StringFragment({
                    descriptor: descriptor.d,
                    root: this.root,
                    owner: owner,
                    contextStack: contextStack
                });
                this.params = fragment.toArgsList();
                fragment.teardown();
            }
            this.fn = root.decorators[name];
            if (!this.fn) {
                errorMessage = 'Missing "' + name + '" decorator. You may need to download a plugin via https://github.com/RactiveJS/Ractive/wiki/Plugins#decorators';
                if (root.debug) {
                    throw new Error(errorMessage);
                } else {
                    warn(errorMessage);
                }
            }
        };
        Decorator.prototype = {
            init: function () {
                var result, args;
                if (this.params) {
                    args = [this.node].concat(this.params);
                    result = this.fn.apply(this.root, args);
                } else {
                    result = this.fn.call(this.root, this.node);
                }
                if (!result || !result.teardown) {
                    throw new Error('Decorator definition must return an object with a teardown method');
                }
                this.teardown = result.teardown;
            }
        };
        return Decorator;
    }(utils_warn, render_StringFragment__StringFragment);
var render_DomFragment_Element_initialise_decorate__decorate = function (Decorator) {
        
        return function (descriptor, root, owner, contextStack) {
            owner.decorator = new Decorator(descriptor, root, owner, contextStack);
            if (owner.decorator.fn) {
                root._deferred.decorators.push(owner.decorator);
            }
        };
    }(render_DomFragment_Element_initialise_decorate_Decorator);
var render_DomFragment_Element_initialise_addEventProxies_addEventProxy = function (warn, StringFragment) {
        
        var addEventProxy, MasterEventHandler, ProxyEvent, firePlainEvent, fireEventWithArgs, fireEventWithDynamicArgs, customHandlers, genericHandler, getCustomHandler;
        addEventProxy = function (element, triggerEventName, proxyDescriptor, contextStack, indexRefs) {
            var events, master;
            events = element.node._ractive.events;
            master = events[triggerEventName] || (events[triggerEventName] = new MasterEventHandler(element, triggerEventName, contextStack, indexRefs));
            master.add(proxyDescriptor);
        };
        MasterEventHandler = function (element, eventName, contextStack) {
            var definition;
            this.element = element;
            this.root = element.root;
            this.node = element.node;
            this.name = eventName;
            this.contextStack = contextStack;
            this.proxies = [];
            if (definition = this.root.events[eventName]) {
                this.custom = definition(this.node, getCustomHandler(eventName));
            } else {
                if (!('on' + eventName in this.node)) {
                    warn('Missing "' + this.name + '" event. You may need to download a plugin via https://github.com/RactiveJS/Ractive/wiki/Plugins#events');
                }
                this.node.addEventListener(eventName, genericHandler, false);
            }
        };
        MasterEventHandler.prototype = {
            add: function (proxy) {
                this.proxies[this.proxies.length] = new ProxyEvent(this.element, this.root, proxy, this.contextStack);
            },
            teardown: function () {
                var i;
                if (this.custom) {
                    this.custom.teardown();
                } else {
                    this.node.removeEventListener(this.name, genericHandler, false);
                }
                i = this.proxies.length;
                while (i--) {
                    this.proxies[i].teardown();
                }
            },
            fire: function (event) {
                var i = this.proxies.length;
                while (i--) {
                    this.proxies[i].fire(event);
                }
            }
        };
        ProxyEvent = function (element, ractive, descriptor, contextStack) {
            var name;
            this.root = ractive;
            name = descriptor.n || descriptor;
            if (typeof name === 'string') {
                this.n = name;
            } else {
                this.n = new StringFragment({
                    descriptor: descriptor.n,
                    root: this.root,
                    owner: element,
                    contextStack: contextStack
                });
            }
            if (descriptor.a) {
                this.a = descriptor.a;
                this.fire = fireEventWithArgs;
                return;
            }
            if (descriptor.d) {
                this.d = new StringFragment({
                    descriptor: descriptor.d,
                    root: this.root,
                    owner: element,
                    contextStack: contextStack
                });
                this.fire = fireEventWithDynamicArgs;
                return;
            }
            this.fire = firePlainEvent;
        };
        ProxyEvent.prototype = {
            teardown: function () {
                if (this.n.teardown) {
                    this.n.teardown();
                }
                if (this.d) {
                    this.d.teardown();
                }
            },
            bubble: function () {
            }
        };
        firePlainEvent = function (event) {
            this.root.fire(this.n.toString(), event);
        };
        fireEventWithArgs = function (event) {
            this.root.fire.apply(this.root, [
                this.n.toString(),
                event
            ].concat(this.a));
        };
        fireEventWithDynamicArgs = function (event) {
            var args = this.d.toArgsList();
            if (typeof args === 'string') {
                args = args.substr(1, args.length - 2);
            }
            this.root.fire.apply(this.root, [
                this.n.toString(),
                event
            ].concat(args));
        };
        genericHandler = function (event) {
            var storage = this._ractive;
            storage.events[event.type].fire({
                node: this,
                original: event,
                index: storage.index,
                keypath: storage.keypath,
                context: storage.root.get(storage.keypath)
            });
        };
        customHandlers = {};
        getCustomHandler = function (eventName) {
            if (customHandlers[eventName]) {
                return customHandlers[eventName];
            }
            return customHandlers[eventName] = function (event) {
                var storage = event.node._ractive;
                event.index = storage.index;
                event.keypath = storage.keypath;
                event.context = storage.root.get(storage.keypath);
                storage.events[eventName].fire(event);
            };
        };
        return addEventProxy;
    }(utils_warn, render_StringFragment__StringFragment);
var render_DomFragment_Element_initialise_addEventProxies__addEventProxies = function (addEventProxy) {
        
        return function (element, proxies) {
            var i, eventName, eventNames;
            for (eventName in proxies) {
                if (proxies.hasOwnProperty(eventName)) {
                    eventNames = eventName.split('-');
                    i = eventNames.length;
                    while (i--) {
                        addEventProxy(element, eventNames[i], proxies[eventName], element.parentFragment.contextStack);
                    }
                }
            }
        };
    }(render_DomFragment_Element_initialise_addEventProxies_addEventProxy);
var render_DomFragment_Element_initialise_updateLiveQueries = function () {
        
        return function (element) {
            var ractive, liveQueries, i, selector, query;
            ractive = element.root;
            liveQueries = ractive._liveQueries;
            i = liveQueries.length;
            while (i--) {
                selector = liveQueries[i];
                query = liveQueries[selector];
                if (query._test(element)) {
                    (element.liveQueries || (element.liveQueries = [])).push(selector);
                    element.liveQueries[selector] = [element.node];
                }
            }
        };
    }();
var utils_camelCase = function () {
        
        return function (hyphenatedStr) {
            return hyphenatedStr.replace(/-([a-zA-Z])/g, function (match, $1) {
                return $1.toUpperCase();
            });
        };
    }();
var utils_fillGaps = function () {
        
        return function (target, source) {
            var key;
            for (key in source) {
                if (source.hasOwnProperty(key) && !target.hasOwnProperty(key)) {
                    target[key] = source[key];
                }
            }
            return target;
        };
    }();
var render_DomFragment_Element_shared_executeTransition_Transition = function (isClient, createElement, warn, isNumeric, isArray, camelCase, fillGaps, StringFragment) {
        
        var Transition, testStyle, vendors, vendorPattern, unprefixPattern, prefixCache, CSS_TRANSITIONS_ENABLED, TRANSITION, TRANSITION_DURATION, TRANSITION_PROPERTY, TRANSITION_TIMING_FUNCTION, TRANSITIONEND;
        if (!isClient) {
            return;
        }
        testStyle = createElement('div').style;
        (function () {
            if (testStyle.transition !== undefined) {
                TRANSITION = 'transition';
                TRANSITIONEND = 'transitionend';
                CSS_TRANSITIONS_ENABLED = true;
            } else if (testStyle.webkitTransition !== undefined) {
                TRANSITION = 'webkitTransition';
                TRANSITIONEND = 'webkitTransitionEnd';
                CSS_TRANSITIONS_ENABLED = true;
            } else {
                CSS_TRANSITIONS_ENABLED = false;
            }
        }());
        if (TRANSITION) {
            TRANSITION_DURATION = TRANSITION + 'Duration';
            TRANSITION_PROPERTY = TRANSITION + 'Property';
            TRANSITION_TIMING_FUNCTION = TRANSITION + 'TimingFunction';
        }
        Transition = function (descriptor, root, owner, contextStack, isIntro) {
            var t = this, name, fragment, errorMessage;
            this.root = root;
            this.node = owner.node;
            this.isIntro = isIntro;
            this.originalStyle = this.node.getAttribute('style');
            this.complete = function (noReset) {
                if (!noReset && t.isIntro) {
                    t.resetStyle();
                }
                t._manager.pop(t.node);
                t.node._ractive.transition = null;
            };
            name = descriptor.n || descriptor;
            if (typeof name !== 'string') {
                fragment = new StringFragment({
                    descriptor: name,
                    root: this.root,
                    owner: owner,
                    contextStack: contextStack
                });
                name = fragment.toString();
                fragment.teardown();
            }
            this.name = name;
            if (descriptor.a) {
                this.params = descriptor.a;
            } else if (descriptor.d) {
                fragment = new StringFragment({
                    descriptor: descriptor.d,
                    root: this.root,
                    owner: owner,
                    contextStack: contextStack
                });
                this.params = fragment.toArgsList();
                fragment.teardown();
            }
            this._fn = root.transitions[name];
            if (!this._fn) {
                errorMessage = 'Missing "' + name + '" transition. You may need to download a plugin via https://github.com/RactiveJS/Ractive/wiki/Plugins#transitions';
                if (root.debug) {
                    throw new Error(errorMessage);
                } else {
                    warn(errorMessage);
                }
                return;
            }
        };
        Transition.prototype = {
            init: function () {
                if (this._inited) {
                    throw new Error('Cannot initialize a transition more than once');
                }
                this._inited = true;
                this._fn.apply(this.root, [this].concat(this.params));
            },
            getStyle: function (props) {
                var computedStyle, styles, i, prop, value;
                computedStyle = window.getComputedStyle(this.node);
                if (typeof props === 'string') {
                    value = computedStyle[prefix(props)];
                    if (value === '0px') {
                        value = 0;
                    }
                    return value;
                }
                if (!isArray(props)) {
                    throw new Error('Transition#getStyle must be passed a string, or an array of strings representing CSS properties');
                }
                styles = {};
                i = props.length;
                while (i--) {
                    prop = props[i];
                    value = computedStyle[prefix(prop)];
                    if (value === '0px') {
                        value = 0;
                    }
                    styles[prop] = value;
                }
                return styles;
            },
            setStyle: function (style, value) {
                var prop;
                if (typeof style === 'string') {
                    this.node.style[prefix(style)] = value;
                } else {
                    for (prop in style) {
                        if (style.hasOwnProperty(prop)) {
                            this.node.style[prefix(prop)] = style[prop];
                        }
                    }
                }
                return this;
            },
            animateStyle: function (style, value, options, complete) {
                var t = this, propertyNames, changedProperties, computedStyle, current, to, from, transitionEndHandler, i, prop;
                if (typeof style === 'string') {
                    to = {};
                    to[style] = value;
                } else {
                    to = style;
                    complete = options;
                    options = value;
                }
                if (!options) {
                    warn('The "' + t.name + '" transition does not supply an options object to `t.animateStyle()`. This will break in a future version of Ractive. For more info see https://github.com/RactiveJS/Ractive/issues/340');
                    options = t;
                    complete = t.complete;
                }
                if (!options.duration) {
                    t.setStyle(to);
                    if (complete) {
                        complete();
                    }
                }
                propertyNames = Object.keys(to);
                changedProperties = [];
                computedStyle = window.getComputedStyle(t.node);
                from = {};
                i = propertyNames.length;
                while (i--) {
                    prop = propertyNames[i];
                    current = computedStyle[prefix(prop)];
                    if (current === '0px') {
                        current = 0;
                    }
                    if (current != to[prop]) {
                        changedProperties[changedProperties.length] = prop;
                        t.node.style[prefix(prop)] = current;
                    }
                }
                if (!changedProperties.length) {
                    if (complete) {
                        complete();
                    }
                    return;
                }
                setTimeout(function () {
                    t.node.style[TRANSITION_PROPERTY] = propertyNames.map(prefix).map(hyphenate).join(',');
                    t.node.style[TRANSITION_TIMING_FUNCTION] = hyphenate(options.easing || 'linear');
                    t.node.style[TRANSITION_DURATION] = options.duration / 1000 + 's';
                    transitionEndHandler = function (event) {
                        var index;
                        index = changedProperties.indexOf(camelCase(unprefix(event.propertyName)));
                        if (index !== -1) {
                            changedProperties.splice(index, 1);
                        }
                        if (changedProperties.length) {
                            return;
                        }
                        t.root.fire(t.name + ':end');
                        t.node.removeEventListener(TRANSITIONEND, transitionEndHandler, false);
                        if (complete) {
                            complete();
                        }
                    };
                    t.node.addEventListener(TRANSITIONEND, transitionEndHandler, false);
                    setTimeout(function () {
                        var i = changedProperties.length;
                        while (i--) {
                            prop = changedProperties[i];
                            t.node.style[prefix(prop)] = to[prop];
                        }
                    }, 0);
                }, options.delay || 0);
            },
            resetStyle: function () {
                if (this.originalStyle) {
                    this.node.setAttribute('style', this.originalStyle);
                } else {
                    this.node.getAttribute('style');
                    this.node.removeAttribute('style');
                }
            },
            processParams: function (params, defaults) {
                if (typeof params === 'number') {
                    params = { duration: params };
                } else if (typeof params === 'string') {
                    if (params === 'slow') {
                        params = { duration: 600 };
                    } else if (params === 'fast') {
                        params = { duration: 200 };
                    } else {
                        params = { duration: 400 };
                    }
                } else if (!params) {
                    params = {};
                }
                return fillGaps(params, defaults);
            }
        };
        vendors = [
            'o',
            'ms',
            'moz',
            'webkit'
        ];
        vendorPattern = new RegExp('^(?:' + vendors.join('|') + ')([A-Z])');
        unprefixPattern = new RegExp('^-(?:' + vendors.join('|') + ')-');
        prefixCache = {};
        function prefix(prop) {
            var i, vendor, capped;
            if (!prefixCache[prop]) {
                if (testStyle[prop] !== undefined) {
                    prefixCache[prop] = prop;
                } else {
                    capped = prop.charAt(0).toUpperCase() + prop.substring(1);
                    i = vendors.length;
                    while (i--) {
                        vendor = vendors[i];
                        if (testStyle[vendor + capped] !== undefined) {
                            prefixCache[prop] = vendor + capped;
                            break;
                        }
                    }
                }
            }
            return prefixCache[prop];
        }
        function unprefix(prop) {
            return prop.replace(unprefixPattern, '');
        }
        function hyphenate(str) {
            var hyphenated;
            if (vendorPattern.test(str)) {
                str = '-' + str;
            }
            hyphenated = str.replace(/[A-Z]/g, function (match) {
                return '-' + match.toLowerCase();
            });
            return hyphenated;
        }
        return Transition;
    }(config_isClient, utils_createElement, utils_warn, utils_isNumeric, utils_isArray, utils_camelCase, utils_fillGaps, render_StringFragment__StringFragment);
var render_DomFragment_Element_shared_executeTransition__executeTransition = function (warn, Transition) {
        
        return function (descriptor, root, owner, contextStack, isIntro) {
            var transition, node, oldTransition;
            if (!root.transitionsEnabled || root._parent && !root._parent.transitionsEnabled) {
                return;
            }
            transition = new Transition(descriptor, root, owner, contextStack, isIntro);
            if (transition._fn) {
                node = transition.node;
                transition._manager = root._transitionManager;
                if (oldTransition = node._ractive.transition) {
                    oldTransition.complete();
                }
                node._ractive.transition = transition;
                transition._manager.push(node);
                if (isIntro) {
                    root._deferred.transitions.push(transition);
                } else {
                    transition.init();
                }
            }
        };
    }(utils_warn, render_DomFragment_Element_shared_executeTransition_Transition);
var render_DomFragment_Element_initialise__initialise = function (types, namespaces, create, defineProperty, matches, warn, createElement, getElementNamespace, createElementAttributes, appendElementChildren, decorate, addEventProxies, updateLiveQueries, executeTransition, enforceCase) {
        
        return function (element, options, docFrag) {
            var parentFragment, pNode, contextStack, descriptor, namespace, name, attributes, width, height, loadHandler, root, selectBinding, errorMessage;
            element.type = types.ELEMENT;
            parentFragment = element.parentFragment = options.parentFragment;
            pNode = parentFragment.pNode;
            contextStack = parentFragment.contextStack;
            descriptor = element.descriptor = options.descriptor;
            element.root = root = parentFragment.root;
            element.index = options.index;
            element.lcName = descriptor.e.toLowerCase();
            element.eventListeners = [];
            element.customEventListeners = [];
            if (pNode) {
                namespace = element.namespace = getElementNamespace(descriptor, pNode);
                name = namespace !== namespaces.html ? enforceCase(descriptor.e) : descriptor.e;
                element.node = createElement(name, namespace);
                defineProperty(element.node, '_ractive', {
                    value: {
                        proxy: element,
                        keypath: contextStack.length ? contextStack[contextStack.length - 1] : '',
                        index: parentFragment.indexRefs,
                        events: create(null),
                        root: root
                    }
                });
            }
            attributes = createElementAttributes(element, descriptor.a);
            if (descriptor.f) {
                if (element.node && element.node.getAttribute('contenteditable')) {
                    if (element.node.innerHTML) {
                        errorMessage = 'A pre-populated contenteditable element should not have children';
                        if (root.debug) {
                            throw new Error(errorMessage);
                        } else {
                            warn(errorMessage);
                        }
                    }
                }
                appendElementChildren(element, element.node, descriptor, docFrag);
            }
            if (docFrag && descriptor.v) {
                addEventProxies(element, descriptor.v);
            }
            if (docFrag) {
                if (root.twoway) {
                    element.bind();
                    if (element.node.getAttribute('contenteditable') && element.node._ractive.binding) {
                        element.node._ractive.binding.update();
                    }
                }
                if (attributes.name && !attributes.name.twoway) {
                    attributes.name.update();
                }
                if (element.node.tagName === 'IMG' && ((width = element.attributes.width) || (height = element.attributes.height))) {
                    element.node.addEventListener('load', loadHandler = function () {
                        if (width) {
                            element.node.width = width.value;
                        }
                        if (height) {
                            element.node.height = height.value;
                        }
                        element.node.removeEventListener('load', loadHandler, false);
                    }, false);
                }
                docFrag.appendChild(element.node);
                if (descriptor.o) {
                    decorate(descriptor.o, root, element, contextStack);
                }
                if (descriptor.t1) {
                    executeTransition(descriptor.t1, root, element, contextStack, true);
                }
                if (element.node.tagName === 'OPTION') {
                    if (pNode.tagName === 'SELECT' && (selectBinding = pNode._ractive.binding)) {
                        selectBinding.deferUpdate();
                    }
                    if (element.node._ractive.value == pNode._ractive.value) {
                        element.node.selected = true;
                    }
                }
                if (element.node.autofocus) {
                    root._deferred.focusable = element.node;
                }
            }
            updateLiveQueries(element);
        };
    }(config_types, config_namespaces, utils_create, utils_defineProperty, utils_matches, utils_warn, utils_createElement, render_DomFragment_Element_initialise_getElementNamespace, render_DomFragment_Element_initialise_createElementAttributes, render_DomFragment_Element_initialise_appendElementChildren, render_DomFragment_Element_initialise_decorate__decorate, render_DomFragment_Element_initialise_addEventProxies__addEventProxies, render_DomFragment_Element_initialise_updateLiveQueries, render_DomFragment_Element_shared_executeTransition__executeTransition, render_DomFragment_shared_enforceCase);
var render_DomFragment_Element_prototype_teardown = function (executeTransition) {
        
        return function (destroy) {
            var eventName, binding, bindings, i, liveQueries, selector, query, nodesToRemove, j;
            if (this.fragment) {
                this.fragment.teardown(false);
            }
            while (this.attributes.length) {
                this.attributes.pop().teardown();
            }
            if (this.node) {
                for (eventName in this.node._ractive.events) {
                    this.node._ractive.events[eventName].teardown();
                }
                if (binding = this.node._ractive.binding) {
                    binding.teardown();
                    bindings = this.root._twowayBindings[binding.attr.keypath];
                    bindings.splice(bindings.indexOf(binding), 1);
                }
            }
            if (this.decorator) {
                this.decorator.teardown();
            }
            if (this.descriptor.t2) {
                executeTransition(this.descriptor.t2, this.root, this, this.parentFragment.contextStack, false);
            }
            if (destroy) {
                this.root._transitionManager.detachWhenReady(this);
            }
            if (liveQueries = this.liveQueries) {
                i = liveQueries.length;
                while (i--) {
                    selector = liveQueries[i];
                    if (nodesToRemove = this.liveQueries[selector]) {
                        j = nodesToRemove.length;
                        query = this.root._liveQueries[selector];
                        while (j--) {
                            query._remove(nodesToRemove[j]);
                        }
                    }
                }
            }
        };
    }(render_DomFragment_Element_shared_executeTransition__executeTransition);
var config_voidElementNames = function () {
        
        return 'area base br col command doctype embed hr img input keygen link meta param source track wbr'.split(' ');
    }();
var render_DomFragment_Element_prototype_toString = function (voidElementNames) {
        
        return function () {
            var str, i, len;
            str = '<' + (this.descriptor.y ? '!doctype' : this.descriptor.e);
            len = this.attributes.length;
            for (i = 0; i < len; i += 1) {
                str += ' ' + this.attributes[i].toString();
            }
            str += '>';
            if (this.html) {
                str += this.html;
            } else if (this.fragment) {
                str += this.fragment.toString();
            }
            if (voidElementNames.indexOf(this.descriptor.e) === -1) {
                str += '</' + this.descriptor.e + '>';
            }
            return str;
        };
    }(config_voidElementNames);
var render_DomFragment_Element_prototype_find = function (matches) {
        
        return function (selector) {
            var queryResult;
            if (matches(this.node, selector)) {
                return this.node;
            }
            if (this.html && (queryResult = this.node.querySelector(selector))) {
                return queryResult;
            }
            if (this.fragment && this.fragment.find) {
                return this.fragment.find(selector);
            }
        };
    }(utils_matches);
var render_DomFragment_Element_prototype_findAll = function () {
        
        return function (selector, query) {
            var queryAllResult, i, numNodes, node, registeredNodes;
            if (query._test(this, true) && query.live) {
                (this.liveQueries || (this.liveQueries = [])).push(selector);
                this.liveQueries[selector] = [this.node];
            }
            if (this.html && (queryAllResult = this.node.querySelectorAll(selector)) && (numNodes = queryAllResult.length)) {
                if (query.live) {
                    if (!this.liveQueries[selector]) {
                        (this.liveQueries || (this.liveQueries = [])).push(selector);
                        this.liveQueries[selector] = [];
                    }
                    registeredNodes = this.liveQueries[selector];
                }
                for (i = 0; i < numNodes; i += 1) {
                    node = queryAllResult[i];
                    query.push(node);
                    if (query.live) {
                        registeredNodes.push(node);
                    }
                }
            }
            if (this.fragment) {
                this.fragment.findAll(selector, query);
            }
        };
    }();
var render_DomFragment_Element_prototype_findComponent = function () {
        
        return function (selector) {
            if (this.fragment) {
                return this.fragment.findComponent(selector);
            }
        };
    }();
var render_DomFragment_Element_prototype_findAllComponents = function () {
        
        return function (selector, query) {
            if (this.fragment) {
                this.fragment.findAllComponents(selector, query);
            }
        };
    }();
var render_DomFragment_Element_prototype_bind = function () {
        
        return function () {
            var attributes = this.attributes;
            if (!this.node) {
                return;
            }
            if (this.binding) {
                this.binding.teardown();
                this.binding = null;
            }
            if (this.node.getAttribute('contenteditable') && attributes.value && attributes.value.bind()) {
                return;
            }
            switch (this.descriptor.e) {
            case 'select':
            case 'textarea':
                if (attributes.value) {
                    attributes.value.bind();
                }
                return;
            case 'input':
                if (this.node.type === 'radio' || this.node.type === 'checkbox') {
                    if (attributes.name && attributes.name.bind()) {
                        return;
                    }
                    if (attributes.checked && attributes.checked.bind()) {
                        return;
                    }
                }
                if (attributes.value && attributes.value.bind()) {
                    return;
                }
            }
        };
    }();
var render_DomFragment_Element__Element = function (initialise, teardown, toString, find, findAll, findComponent, findAllComponents, bind) {
        
        var DomElement = function (options, docFrag) {
            initialise(this, options, docFrag);
        };
        DomElement.prototype = {
            detach: function () {
                if (this.node) {
                    if (this.node.parentNode) {
                        this.node.parentNode.removeChild(this.node);
                    }
                    return this.node;
                }
            },
            teardown: teardown,
            firstNode: function () {
                return this.node;
            },
            findNextNode: function () {
                return null;
            },
            bubble: function () {
            },
            toString: toString,
            find: find,
            findAll: findAll,
            findComponent: findComponent,
            findAllComponents: findAllComponents,
            bind: bind
        };
        return DomElement;
    }(render_DomFragment_Element_initialise__initialise, render_DomFragment_Element_prototype_teardown, render_DomFragment_Element_prototype_toString, render_DomFragment_Element_prototype_find, render_DomFragment_Element_prototype_findAll, render_DomFragment_Element_prototype_findComponent, render_DomFragment_Element_prototype_findAllComponents, render_DomFragment_Element_prototype_bind);
var config_errors = { missingParser: 'Missing Ractive.parse - cannot parse template. Either preparse or use the version that includes the parser' };
var registries_partials = {};
var parse_utils_stripHtmlComments = function () {
        
        return function (html) {
            var commentStart, commentEnd, processed;
            processed = '';
            while (html.length) {
                commentStart = html.indexOf('<!--');
                commentEnd = html.indexOf('-->');
                if (commentStart === -1 && commentEnd === -1) {
                    processed += html;
                    break;
                }
                if (commentStart !== -1 && commentEnd === -1) {
                    throw 'Illegal HTML - expected closing comment sequence (\'-->\')';
                }
                if (commentEnd !== -1 && commentStart === -1 || commentEnd < commentStart) {
                    throw 'Illegal HTML - unexpected closing comment sequence (\'-->\')';
                }
                processed += html.substr(0, commentStart);
                html = html.substring(commentEnd + 3);
            }
            return processed;
        };
    }();
var parse_utils_stripStandalones = function (types) {
        
        return function (tokens) {
            var i, current, backOne, backTwo, leadingLinebreak, trailingLinebreak;
            leadingLinebreak = /^\s*\r?\n/;
            trailingLinebreak = /\r?\n\s*$/;
            for (i = 2; i < tokens.length; i += 1) {
                current = tokens[i];
                backOne = tokens[i - 1];
                backTwo = tokens[i - 2];
                if (current.type === types.TEXT && backOne.type === types.MUSTACHE && backTwo.type === types.TEXT) {
                    if (trailingLinebreak.test(backTwo.value) && leadingLinebreak.test(current.value)) {
                        if (backOne.mustacheType !== types.INTERPOLATOR && backOne.mustacheType !== types.TRIPLE) {
                            backTwo.value = backTwo.value.replace(trailingLinebreak, '\n');
                        }
                        current.value = current.value.replace(leadingLinebreak, '');
                        if (current.value === '') {
                            tokens.splice(i--, 1);
                        }
                    }
                }
            }
            return tokens;
        };
    }(config_types);
var parse_utils_stripCommentTokens = function (types) {
        
        return function (tokens) {
            var i, current, previous, next;
            for (i = 0; i < tokens.length; i += 1) {
                current = tokens[i];
                previous = tokens[i - 1];
                next = tokens[i + 1];
                if (current.mustacheType === types.COMMENT || current.mustacheType === types.DELIMCHANGE) {
                    tokens.splice(i, 1);
                    if (previous && next) {
                        if (previous.type === types.TEXT && next.type === types.TEXT) {
                            previous.value += next.value;
                            tokens.splice(i, 1);
                        }
                    }
                    i -= 1;
                }
            }
            return tokens;
        };
    }(config_types);
var parse_Tokenizer_getMustache_getDelimiterChange = function (makeRegexMatcher) {
        
        var getDelimiter = makeRegexMatcher(/^[^\s=]+/);
        return function (tokenizer) {
            var start, opening, closing;
            if (!tokenizer.getStringMatch('=')) {
                return null;
            }
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            opening = getDelimiter(tokenizer);
            if (!opening) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            closing = getDelimiter(tokenizer);
            if (!closing) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch('=')) {
                tokenizer.pos = start;
                return null;
            }
            return [
                opening,
                closing
            ];
        };
    }(parse_Tokenizer_utils_makeRegexMatcher);
var parse_Tokenizer_getMustache_getMustacheType = function (types) {
        
        var mustacheTypes = {
                '#': types.SECTION,
                '^': types.INVERTED,
                '/': types.CLOSING,
                '>': types.PARTIAL,
                '!': types.COMMENT,
                '&': types.TRIPLE
            };
        return function (tokenizer) {
            var type = mustacheTypes[tokenizer.str.charAt(tokenizer.pos)];
            if (!type) {
                return null;
            }
            tokenizer.pos += 1;
            return type;
        };
    }(config_types);
var parse_Tokenizer_getMustache_getMustacheContent = function (types, makeRegexMatcher, getMustacheType) {
        
        var getIndexRef = makeRegexMatcher(/^\s*:\s*([a-zA-Z_$][a-zA-Z_$0-9]*)/), arrayMember = /^[0-9][1-9]*$/;
        return function (tokenizer, isTriple) {
            var start, mustache, type, expr, i, remaining, index;
            start = tokenizer.pos;
            mustache = { type: isTriple ? types.TRIPLE : types.MUSTACHE };
            if (!isTriple) {
                if (expr = tokenizer.getExpression()) {
                    mustache.mustacheType = types.INTERPOLATOR;
                    tokenizer.allowWhitespace();
                    if (tokenizer.getStringMatch(tokenizer.delimiters[1])) {
                        tokenizer.pos -= tokenizer.delimiters[1].length;
                    } else {
                        tokenizer.pos = start;
                        expr = null;
                    }
                }
                if (!expr) {
                    type = getMustacheType(tokenizer);
                    if (type === types.TRIPLE) {
                        mustache = { type: types.TRIPLE };
                    } else {
                        mustache.mustacheType = type || types.INTERPOLATOR;
                    }
                    if (type === types.COMMENT || type === types.CLOSING) {
                        remaining = tokenizer.remaining();
                        index = remaining.indexOf(tokenizer.delimiters[1]);
                        if (index !== -1) {
                            mustache.ref = remaining.substr(0, index);
                            tokenizer.pos += index;
                            return mustache;
                        }
                    }
                }
            }
            if (!expr) {
                tokenizer.allowWhitespace();
                expr = tokenizer.getExpression();
            }
            while (expr.t === types.BRACKETED && expr.x) {
                expr = expr.x;
            }
            if (expr.t === types.REFERENCE) {
                mustache.ref = expr.n;
            } else if (expr.t === types.NUMBER_LITERAL && arrayMember.test(expr.v)) {
                mustache.ref = expr.v;
            } else {
                mustache.expression = expr;
            }
            i = getIndexRef(tokenizer);
            if (i !== null) {
                mustache.indexRef = i;
            }
            return mustache;
        };
    }(config_types, parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_getMustache_getMustacheType);
var parse_Tokenizer_getMustache__getMustache = function (types, getDelimiterChange, getMustacheContent) {
        
        return function () {
            var seekTripleFirst = this.tripleDelimiters[0].length > this.delimiters[0].length;
            return getMustache(this, seekTripleFirst) || getMustache(this, !seekTripleFirst);
        };
        function getMustache(tokenizer, seekTriple) {
            var start = tokenizer.pos, content, delimiters;
            delimiters = seekTriple ? tokenizer.tripleDelimiters : tokenizer.delimiters;
            if (!tokenizer.getStringMatch(delimiters[0])) {
                return null;
            }
            content = getDelimiterChange(tokenizer);
            if (content) {
                if (!tokenizer.getStringMatch(delimiters[1])) {
                    tokenizer.pos = start;
                    return null;
                }
                tokenizer[seekTriple ? 'tripleDelimiters' : 'delimiters'] = content;
                return {
                    type: types.MUSTACHE,
                    mustacheType: types.DELIMCHANGE
                };
            }
            tokenizer.allowWhitespace();
            content = getMustacheContent(tokenizer, seekTriple);
            if (content === null) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch(delimiters[1])) {
                tokenizer.pos = start;
                return null;
            }
            return content;
        }
    }(config_types, parse_Tokenizer_getMustache_getDelimiterChange, parse_Tokenizer_getMustache_getMustacheContent);
var parse_Tokenizer_getComment_getComment = function (types) {
        
        return function () {
            var content, remaining, endIndex;
            if (!this.getStringMatch('<!--')) {
                return null;
            }
            remaining = this.remaining();
            endIndex = remaining.indexOf('-->');
            if (endIndex === -1) {
                throw new Error('Unexpected end of input (expected "-->" to close comment)');
            }
            content = remaining.substr(0, endIndex);
            this.pos += endIndex + 3;
            return {
                type: types.COMMENT,
                content: content
            };
        };
    }(config_types);
var parse_Tokenizer_utils_getLowestIndex = function () {
        
        return function (haystack, needles) {
            var i, index, lowest;
            i = needles.length;
            while (i--) {
                index = haystack.indexOf(needles[i]);
                if (!index) {
                    return 0;
                }
                if (index === -1) {
                    continue;
                }
                if (!lowest || index < lowest) {
                    lowest = index;
                }
            }
            return lowest || -1;
        };
    }();
var parse_Tokenizer_getTag__getTag = function (types, makeRegexMatcher, getLowestIndex) {
        
        var getTag, getOpeningTag, getClosingTag, getTagName, getAttributes, getAttribute, getAttributeName, getAttributeValue, getUnquotedAttributeValue, getUnquotedAttributeValueToken, getUnquotedAttributeValueText, getQuotedStringToken, getQuotedAttributeValue;
        getTag = function () {
            return getOpeningTag(this) || getClosingTag(this);
        };
        getOpeningTag = function (tokenizer) {
            var start, tag, attrs, lowerCaseName;
            start = tokenizer.pos;
            if (tokenizer.inside) {
                return null;
            }
            if (!tokenizer.getStringMatch('<')) {
                return null;
            }
            tag = { type: types.TAG };
            if (tokenizer.getStringMatch('!')) {
                tag.doctype = true;
            }
            tag.name = getTagName(tokenizer);
            if (!tag.name) {
                tokenizer.pos = start;
                return null;
            }
            attrs = getAttributes(tokenizer);
            if (attrs) {
                tag.attrs = attrs;
            }
            tokenizer.allowWhitespace();
            if (tokenizer.getStringMatch('/')) {
                tag.selfClosing = true;
            }
            if (!tokenizer.getStringMatch('>')) {
                tokenizer.pos = start;
                return null;
            }
            lowerCaseName = tag.name.toLowerCase();
            if (lowerCaseName === 'script' || lowerCaseName === 'style') {
                tokenizer.inside = lowerCaseName;
            }
            return tag;
        };
        getClosingTag = function (tokenizer) {
            var start, tag, expected;
            start = tokenizer.pos;
            expected = function (str) {
                throw new Error('Unexpected character ' + tokenizer.remaining().charAt(0) + ' (expected ' + str + ')');
            };
            if (!tokenizer.getStringMatch('<')) {
                return null;
            }
            tag = {
                type: types.TAG,
                closing: true
            };
            if (!tokenizer.getStringMatch('/')) {
                expected('"/"');
            }
            tag.name = getTagName(tokenizer);
            if (!tag.name) {
                expected('tag name');
            }
            if (!tokenizer.getStringMatch('>')) {
                expected('">"');
            }
            if (tokenizer.inside) {
                if (tag.name.toLowerCase() !== tokenizer.inside) {
                    tokenizer.pos = start;
                    return null;
                }
                tokenizer.inside = null;
            }
            return tag;
        };
        getTagName = makeRegexMatcher(/^[a-zA-Z]{1,}:?[a-zA-Z0-9\-]*/);
        getAttributes = function (tokenizer) {
            var start, attrs, attr;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            attr = getAttribute(tokenizer);
            if (!attr) {
                tokenizer.pos = start;
                return null;
            }
            attrs = [];
            while (attr !== null) {
                attrs[attrs.length] = attr;
                tokenizer.allowWhitespace();
                attr = getAttribute(tokenizer);
            }
            return attrs;
        };
        getAttribute = function (tokenizer) {
            var attr, name, value;
            name = getAttributeName(tokenizer);
            if (!name) {
                return null;
            }
            attr = { name: name };
            value = getAttributeValue(tokenizer);
            if (value) {
                attr.value = value;
            }
            return attr;
        };
        getAttributeName = makeRegexMatcher(/^[^\s"'>\/=]+/);
        getAttributeValue = function (tokenizer) {
            var start, value;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch('=')) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            value = getQuotedAttributeValue(tokenizer, '\'') || getQuotedAttributeValue(tokenizer, '"') || getUnquotedAttributeValue(tokenizer);
            if (value === null) {
                tokenizer.pos = start;
                return null;
            }
            return value;
        };
        getUnquotedAttributeValueText = makeRegexMatcher(/^[^\s"'=<>`]+/);
        getUnquotedAttributeValueToken = function (tokenizer) {
            var start, text, index;
            start = tokenizer.pos;
            text = getUnquotedAttributeValueText(tokenizer);
            if (!text) {
                return null;
            }
            if ((index = text.indexOf(tokenizer.delimiters[0])) !== -1) {
                text = text.substr(0, index);
                tokenizer.pos = start + text.length;
            }
            return {
                type: types.TEXT,
                value: text
            };
        };
        getUnquotedAttributeValue = function (tokenizer) {
            var tokens, token;
            tokens = [];
            token = tokenizer.getMustache() || getUnquotedAttributeValueToken(tokenizer);
            while (token !== null) {
                tokens[tokens.length] = token;
                token = tokenizer.getMustache() || getUnquotedAttributeValueToken(tokenizer);
            }
            if (!tokens.length) {
                return null;
            }
            return tokens;
        };
        getQuotedAttributeValue = function (tokenizer, quoteMark) {
            var start, tokens, token;
            start = tokenizer.pos;
            if (!tokenizer.getStringMatch(quoteMark)) {
                return null;
            }
            tokens = [];
            token = tokenizer.getMustache() || getQuotedStringToken(tokenizer, quoteMark);
            while (token !== null) {
                tokens[tokens.length] = token;
                token = tokenizer.getMustache() || getQuotedStringToken(tokenizer, quoteMark);
            }
            if (!tokenizer.getStringMatch(quoteMark)) {
                tokenizer.pos = start;
                return null;
            }
            return tokens;
        };
        getQuotedStringToken = function (tokenizer, quoteMark) {
            var start, index, remaining;
            start = tokenizer.pos;
            remaining = tokenizer.remaining();
            index = getLowestIndex(remaining, [
                quoteMark,
                tokenizer.delimiters[0],
                tokenizer.delimiters[1]
            ]);
            if (index === -1) {
                throw new Error('Quoted attribute value must have a closing quote');
            }
            if (!index) {
                return null;
            }
            tokenizer.pos += index;
            return {
                type: types.TEXT,
                value: remaining.substr(0, index)
            };
        };
        return getTag;
    }(config_types, parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_utils_getLowestIndex);
var parse_Tokenizer_getText__getText = function (types, getLowestIndex) {
        
        return function () {
            var index, remaining, barrier;
            remaining = this.remaining();
            barrier = this.inside ? '</' + this.inside : '<';
            index = getLowestIndex(remaining, [
                barrier,
                this.delimiters[0],
                this.tripleDelimiters[0]
            ]);
            if (!index) {
                return null;
            }
            if (index === -1) {
                index = remaining.length;
            }
            this.pos += index;
            return {
                type: types.TEXT,
                value: remaining.substr(0, index)
            };
        };
    }(config_types, parse_Tokenizer_utils_getLowestIndex);
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getBooleanLiteral = function (types) {
        
        return function (tokenizer) {
            var remaining = tokenizer.remaining();
            if (remaining.substr(0, 4) === 'true') {
                tokenizer.pos += 4;
                return {
                    t: types.BOOLEAN_LITERAL,
                    v: 'true'
                };
            }
            if (remaining.substr(0, 5) === 'false') {
                tokenizer.pos += 5;
                return {
                    t: types.BOOLEAN_LITERAL,
                    v: 'false'
                };
            }
            return null;
        };
    }(config_types);
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePair = function (types, getKey) {
        
        return function (tokenizer) {
            var start, key, value;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            key = getKey(tokenizer);
            if (key === null) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch(':')) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            value = tokenizer.getExpression();
            if (value === null) {
                tokenizer.pos = start;
                return null;
            }
            return {
                t: types.KEY_VALUE_PAIR,
                k: key,
                v: value
            };
        };
    }(config_types, parse_Tokenizer_getExpression_shared_getKey);
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePairs = function (getKeyValuePair) {
        
        return function getKeyValuePairs(tokenizer) {
            var start, pairs, pair, keyValuePairs;
            start = tokenizer.pos;
            pair = getKeyValuePair(tokenizer);
            if (pair === null) {
                return null;
            }
            pairs = [pair];
            if (tokenizer.getStringMatch(',')) {
                keyValuePairs = getKeyValuePairs(tokenizer);
                if (!keyValuePairs) {
                    tokenizer.pos = start;
                    return null;
                }
                return pairs.concat(keyValuePairs);
            }
            return pairs;
        };
    }(parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePair);
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral__getObjectLiteral = function (types, getKeyValuePairs) {
        
        return function (tokenizer) {
            var start, keyValuePairs;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch('{')) {
                tokenizer.pos = start;
                return null;
            }
            keyValuePairs = getKeyValuePairs(tokenizer);
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch('}')) {
                tokenizer.pos = start;
                return null;
            }
            return {
                t: types.OBJECT_LITERAL,
                m: keyValuePairs
            };
        };
    }(config_types, parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePairs);
var parse_Tokenizer_getExpression_shared_getExpressionList = function () {
        
        return function getExpressionList(tokenizer) {
            var start, expressions, expr, next;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            expr = tokenizer.getExpression();
            if (expr === null) {
                return null;
            }
            expressions = [expr];
            tokenizer.allowWhitespace();
            if (tokenizer.getStringMatch(',')) {
                next = getExpressionList(tokenizer);
                if (next === null) {
                    tokenizer.pos = start;
                    return null;
                }
                expressions = expressions.concat(next);
            }
            return expressions;
        };
    }();
var parse_Tokenizer_getExpression_getPrimary_getLiteral_getArrayLiteral = function (types, getExpressionList) {
        
        return function (tokenizer) {
            var start, expressionList;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch('[')) {
                tokenizer.pos = start;
                return null;
            }
            expressionList = getExpressionList(tokenizer);
            if (!tokenizer.getStringMatch(']')) {
                tokenizer.pos = start;
                return null;
            }
            return {
                t: types.ARRAY_LITERAL,
                m: expressionList
            };
        };
    }(config_types, parse_Tokenizer_getExpression_shared_getExpressionList);
var parse_Tokenizer_getExpression_getPrimary_getLiteral__getLiteral = function (getNumberLiteral, getBooleanLiteral, getStringLiteral, getObjectLiteral, getArrayLiteral) {
        
        return function (tokenizer) {
            var literal = getNumberLiteral(tokenizer) || getBooleanLiteral(tokenizer) || getStringLiteral(tokenizer) || getObjectLiteral(tokenizer) || getArrayLiteral(tokenizer);
            return literal;
        };
    }(parse_Tokenizer_getExpression_getPrimary_getLiteral_getNumberLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getBooleanLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral__getObjectLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getArrayLiteral);
var parse_Tokenizer_getExpression_getPrimary_getReference = function (types, makeRegexMatcher, getName) {
        
        var getDotRefinement, getArrayRefinement, getArrayMember, globals;
        getDotRefinement = makeRegexMatcher(/^\.[a-zA-Z_$0-9]+/);
        getArrayRefinement = function (tokenizer) {
            var num = getArrayMember(tokenizer);
            if (num) {
                return '.' + num;
            }
            return null;
        };
        getArrayMember = makeRegexMatcher(/^\[(0|[1-9][0-9]*)\]/);
        globals = /^(?:Array|Date|RegExp|decodeURIComponent|decodeURI|encodeURIComponent|encodeURI|isFinite|isNaN|parseFloat|parseInt|JSON|Math|NaN|undefined|null)$/;
        return function (tokenizer) {
            var startPos, ancestor, name, dot, combo, refinement, lastDotIndex;
            startPos = tokenizer.pos;
            ancestor = '';
            while (tokenizer.getStringMatch('../')) {
                ancestor += '../';
            }
            if (!ancestor) {
                dot = tokenizer.getStringMatch('.') || '';
            }
            name = getName(tokenizer) || '';
            if (!ancestor && !dot && globals.test(name)) {
                return {
                    t: types.GLOBAL,
                    v: name
                };
            }
            if (name === 'this' && !ancestor && !dot) {
                name = '.';
                startPos += 3;
            }
            combo = (ancestor || dot) + name;
            if (!combo) {
                return null;
            }
            while (refinement = getDotRefinement(tokenizer) || getArrayRefinement(tokenizer)) {
                combo += refinement;
            }
            if (tokenizer.getStringMatch('(')) {
                lastDotIndex = combo.lastIndexOf('.');
                if (lastDotIndex !== -1) {
                    combo = combo.substr(0, lastDotIndex);
                    tokenizer.pos = startPos + combo.length;
                } else {
                    tokenizer.pos -= 1;
                }
            }
            return {
                t: types.REFERENCE,
                n: combo
            };
        };
    }(config_types, parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_getExpression_shared_getName);
var parse_Tokenizer_getExpression_getPrimary_getBracketedExpression = function (types) {
        
        return function (tokenizer) {
            var start, expr;
            start = tokenizer.pos;
            if (!tokenizer.getStringMatch('(')) {
                return null;
            }
            tokenizer.allowWhitespace();
            expr = tokenizer.getExpression();
            if (!expr) {
                tokenizer.pos = start;
                return null;
            }
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch(')')) {
                tokenizer.pos = start;
                return null;
            }
            return {
                t: types.BRACKETED,
                x: expr
            };
        };
    }(config_types);
var parse_Tokenizer_getExpression_getPrimary__getPrimary = function (getLiteral, getReference, getBracketedExpression) {
        
        return function (tokenizer) {
            return getLiteral(tokenizer) || getReference(tokenizer) || getBracketedExpression(tokenizer);
        };
    }(parse_Tokenizer_getExpression_getPrimary_getLiteral__getLiteral, parse_Tokenizer_getExpression_getPrimary_getReference, parse_Tokenizer_getExpression_getPrimary_getBracketedExpression);
var parse_Tokenizer_getExpression_shared_getRefinement = function (types, getName) {
        
        return function getRefinement(tokenizer) {
            var start, name, expr;
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            if (tokenizer.getStringMatch('.')) {
                tokenizer.allowWhitespace();
                if (name = getName(tokenizer)) {
                    return {
                        t: types.REFINEMENT,
                        n: name
                    };
                }
                tokenizer.expected('a property name');
            }
            if (tokenizer.getStringMatch('[')) {
                tokenizer.allowWhitespace();
                expr = tokenizer.getExpression();
                if (!expr) {
                    tokenizer.expected('an expression');
                }
                tokenizer.allowWhitespace();
                if (!tokenizer.getStringMatch(']')) {
                    tokenizer.expected('"]"');
                }
                return {
                    t: types.REFINEMENT,
                    x: expr
                };
            }
            return null;
        };
    }(config_types, parse_Tokenizer_getExpression_shared_getName);
var parse_Tokenizer_getExpression_getMemberOrInvocation = function (types, getPrimary, getExpressionList, getRefinement) {
        
        return function (tokenizer) {
            var current, expression, refinement, expressionList;
            expression = getPrimary(tokenizer);
            if (!expression) {
                return null;
            }
            while (expression) {
                current = tokenizer.pos;
                if (refinement = getRefinement(tokenizer)) {
                    expression = {
                        t: types.MEMBER,
                        x: expression,
                        r: refinement
                    };
                } else if (tokenizer.getStringMatch('(')) {
                    tokenizer.allowWhitespace();
                    expressionList = getExpressionList(tokenizer);
                    tokenizer.allowWhitespace();
                    if (!tokenizer.getStringMatch(')')) {
                        tokenizer.pos = current;
                        break;
                    }
                    expression = {
                        t: types.INVOCATION,
                        x: expression
                    };
                    if (expressionList) {
                        expression.o = expressionList;
                    }
                } else {
                    break;
                }
            }
            return expression;
        };
    }(config_types, parse_Tokenizer_getExpression_getPrimary__getPrimary, parse_Tokenizer_getExpression_shared_getExpressionList, parse_Tokenizer_getExpression_shared_getRefinement);
var parse_Tokenizer_getExpression_getTypeOf = function (types, getMemberOrInvocation) {
        
        var getTypeOf, makePrefixSequenceMatcher;
        makePrefixSequenceMatcher = function (symbol, fallthrough) {
            return function (tokenizer) {
                var start, expression;
                if (!tokenizer.getStringMatch(symbol)) {
                    return fallthrough(tokenizer);
                }
                start = tokenizer.pos;
                tokenizer.allowWhitespace();
                expression = tokenizer.getExpression();
                if (!expression) {
                    tokenizer.expected('an expression');
                }
                return {
                    s: symbol,
                    o: expression,
                    t: types.PREFIX_OPERATOR
                };
            };
        };
        (function () {
            var i, len, matcher, prefixOperators, fallthrough;
            prefixOperators = '! ~ + - typeof'.split(' ');
            fallthrough = getMemberOrInvocation;
            for (i = 0, len = prefixOperators.length; i < len; i += 1) {
                matcher = makePrefixSequenceMatcher(prefixOperators[i], fallthrough);
                fallthrough = matcher;
            }
            getTypeOf = fallthrough;
        }());
        return getTypeOf;
    }(config_types, parse_Tokenizer_getExpression_getMemberOrInvocation);
var parse_Tokenizer_getExpression_getLogicalOr = function (types, getTypeOf) {
        
        var getLogicalOr, makeInfixSequenceMatcher;
        makeInfixSequenceMatcher = function (symbol, fallthrough) {
            return function (tokenizer) {
                var start, left, right;
                left = fallthrough(tokenizer);
                if (!left) {
                    return null;
                }
                start = tokenizer.pos;
                tokenizer.allowWhitespace();
                if (!tokenizer.getStringMatch(symbol)) {
                    tokenizer.pos = start;
                    return left;
                }
                if (symbol === 'in' && /[a-zA-Z_$0-9]/.test(tokenizer.remaining().charAt(0))) {
                    tokenizer.pos = start;
                    return left;
                }
                tokenizer.allowWhitespace();
                right = tokenizer.getExpression();
                if (!right) {
                    tokenizer.pos = start;
                    return left;
                }
                return {
                    t: types.INFIX_OPERATOR,
                    s: symbol,
                    o: [
                        left,
                        right
                    ]
                };
            };
        };
        (function () {
            var i, len, matcher, infixOperators, fallthrough;
            infixOperators = '* / % + - << >> >>> < <= > >= in instanceof == != === !== & ^ | && ||'.split(' ');
            fallthrough = getTypeOf;
            for (i = 0, len = infixOperators.length; i < len; i += 1) {
                matcher = makeInfixSequenceMatcher(infixOperators[i], fallthrough);
                fallthrough = matcher;
            }
            getLogicalOr = fallthrough;
        }());
        return getLogicalOr;
    }(config_types, parse_Tokenizer_getExpression_getTypeOf);
var parse_Tokenizer_getExpression_getConditional = function (types, getLogicalOr) {
        
        return function (tokenizer) {
            var start, expression, ifTrue, ifFalse;
            expression = getLogicalOr(tokenizer);
            if (!expression) {
                return null;
            }
            start = tokenizer.pos;
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch('?')) {
                tokenizer.pos = start;
                return expression;
            }
            tokenizer.allowWhitespace();
            ifTrue = tokenizer.getExpression();
            if (!ifTrue) {
                tokenizer.pos = start;
                return expression;
            }
            tokenizer.allowWhitespace();
            if (!tokenizer.getStringMatch(':')) {
                tokenizer.pos = start;
                return expression;
            }
            tokenizer.allowWhitespace();
            ifFalse = tokenizer.getExpression();
            if (!ifFalse) {
                tokenizer.pos = start;
                return expression;
            }
            return {
                t: types.CONDITIONAL,
                o: [
                    expression,
                    ifTrue,
                    ifFalse
                ]
            };
        };
    }(config_types, parse_Tokenizer_getExpression_getLogicalOr);
var parse_Tokenizer_getExpression__getExpression = function (getConditional) {
        
        return function () {
            return getConditional(this);
        };
    }(parse_Tokenizer_getExpression_getConditional);
var parse_Tokenizer__Tokenizer = function (getMustache, getComment, getTag, getText, getExpression, allowWhitespace, getStringMatch) {
        
        var Tokenizer;
        Tokenizer = function (str, options) {
            var token;
            this.str = str;
            this.pos = 0;
            this.delimiters = options.delimiters;
            this.tripleDelimiters = options.tripleDelimiters;
            this.tokens = [];
            while (this.pos < this.str.length) {
                token = this.getToken();
                if (token === null && this.remaining()) {
                    this.fail();
                }
                this.tokens.push(token);
            }
        };
        Tokenizer.prototype = {
            getToken: function () {
                var token = this.getMustache() || this.getComment() || this.getTag() || this.getText();
                return token;
            },
            getMustache: getMustache,
            getComment: getComment,
            getTag: getTag,
            getText: getText,
            getExpression: getExpression,
            allowWhitespace: allowWhitespace,
            getStringMatch: getStringMatch,
            remaining: function () {
                return this.str.substring(this.pos);
            },
            fail: function () {
                var last20, next20;
                last20 = this.str.substr(0, this.pos).substr(-20);
                if (last20.length === 20) {
                    last20 = '...' + last20;
                }
                next20 = this.remaining().substr(0, 20);
                if (next20.length === 20) {
                    next20 = next20 + '...';
                }
                throw new Error('Could not parse template: ' + (last20 ? last20 + '<- ' : '') + 'failed at character ' + this.pos + ' ->' + next20);
            },
            expected: function (thing) {
                var remaining = this.remaining().substr(0, 40);
                if (remaining.length === 40) {
                    remaining += '...';
                }
                throw new Error('Tokenizer failed: unexpected string "' + remaining + '" (expected ' + thing + ')');
            }
        };
        return Tokenizer;
    }(parse_Tokenizer_getMustache__getMustache, parse_Tokenizer_getComment_getComment, parse_Tokenizer_getTag__getTag, parse_Tokenizer_getText__getText, parse_Tokenizer_getExpression__getExpression, parse_Tokenizer_utils_allowWhitespace, parse_Tokenizer_utils_getStringMatch);
var parse_tokenize = function (stripHtmlComments, stripStandalones, stripCommentTokens, Tokenizer, circular) {
        
        var tokenize, Ractive;
        circular.push(function () {
            Ractive = circular.Ractive;
        });
        tokenize = function (template, options) {
            var tokenizer, tokens;
            options = options || {};
            if (options.stripComments !== false) {
                template = stripHtmlComments(template);
            }
            tokenizer = new Tokenizer(template, {
                delimiters: options.delimiters || (Ractive ? Ractive.delimiters : [
                    '{{',
                    '}}'
                ]),
                tripleDelimiters: options.tripleDelimiters || (Ractive ? Ractive.tripleDelimiters : [
                    '{{{',
                    '}}}'
                ])
            });
            tokens = tokenizer.tokens;
            stripStandalones(tokens);
            stripCommentTokens(tokens);
            return tokens;
        };
        return tokenize;
    }(parse_utils_stripHtmlComments, parse_utils_stripStandalones, parse_utils_stripCommentTokens, parse_Tokenizer__Tokenizer, circular);
var parse_Parser_getText_TextStub__TextStub = function (types) {
        
        var TextStub, htmlEntities, controlCharacters, namedEntityPattern, hexEntityPattern, decimalEntityPattern, validateCode, decodeCharacterReferences, whitespace;
        TextStub = function (token, preserveWhitespace) {
            this.text = preserveWhitespace ? token.value : token.value.replace(whitespace, ' ');
        };
        TextStub.prototype = {
            type: types.TEXT,
            toJSON: function () {
                return this.decoded || (this.decoded = decodeCharacterReferences(this.text));
            },
            toString: function () {
                return this.text;
            }
        };
        htmlEntities = {
            quot: 34,
            amp: 38,
            apos: 39,
            lt: 60,
            gt: 62,
            nbsp: 160,
            iexcl: 161,
            cent: 162,
            pound: 163,
            curren: 164,
            yen: 165,
            brvbar: 166,
            sect: 167,
            uml: 168,
            copy: 169,
            ordf: 170,
            laquo: 171,
            not: 172,
            shy: 173,
            reg: 174,
            macr: 175,
            deg: 176,
            plusmn: 177,
            sup2: 178,
            sup3: 179,
            acute: 180,
            micro: 181,
            para: 182,
            middot: 183,
            cedil: 184,
            sup1: 185,
            ordm: 186,
            raquo: 187,
            frac14: 188,
            frac12: 189,
            frac34: 190,
            iquest: 191,
            Agrave: 192,
            Aacute: 193,
            Acirc: 194,
            Atilde: 195,
            Auml: 196,
            Aring: 197,
            AElig: 198,
            Ccedil: 199,
            Egrave: 200,
            Eacute: 201,
            Ecirc: 202,
            Euml: 203,
            Igrave: 204,
            Iacute: 205,
            Icirc: 206,
            Iuml: 207,
            ETH: 208,
            Ntilde: 209,
            Ograve: 210,
            Oacute: 211,
            Ocirc: 212,
            Otilde: 213,
            Ouml: 214,
            times: 215,
            Oslash: 216,
            Ugrave: 217,
            Uacute: 218,
            Ucirc: 219,
            Uuml: 220,
            Yacute: 221,
            THORN: 222,
            szlig: 223,
            agrave: 224,
            aacute: 225,
            acirc: 226,
            atilde: 227,
            auml: 228,
            aring: 229,
            aelig: 230,
            ccedil: 231,
            egrave: 232,
            eacute: 233,
            ecirc: 234,
            euml: 235,
            igrave: 236,
            iacute: 237,
            icirc: 238,
            iuml: 239,
            eth: 240,
            ntilde: 241,
            ograve: 242,
            oacute: 243,
            ocirc: 244,
            otilde: 245,
            ouml: 246,
            divide: 247,
            oslash: 248,
            ugrave: 249,
            uacute: 250,
            ucirc: 251,
            uuml: 252,
            yacute: 253,
            thorn: 254,
            yuml: 255,
            OElig: 338,
            oelig: 339,
            Scaron: 352,
            scaron: 353,
            Yuml: 376,
            fnof: 402,
            circ: 710,
            tilde: 732,
            Alpha: 913,
            Beta: 914,
            Gamma: 915,
            Delta: 916,
            Epsilon: 917,
            Zeta: 918,
            Eta: 919,
            Theta: 920,
            Iota: 921,
            Kappa: 922,
            Lambda: 923,
            Mu: 924,
            Nu: 925,
            Xi: 926,
            Omicron: 927,
            Pi: 928,
            Rho: 929,
            Sigma: 931,
            Tau: 932,
            Upsilon: 933,
            Phi: 934,
            Chi: 935,
            Psi: 936,
            Omega: 937,
            alpha: 945,
            beta: 946,
            gamma: 947,
            delta: 948,
            epsilon: 949,
            zeta: 950,
            eta: 951,
            theta: 952,
            iota: 953,
            kappa: 954,
            lambda: 955,
            mu: 956,
            nu: 957,
            xi: 958,
            omicron: 959,
            pi: 960,
            rho: 961,
            sigmaf: 962,
            sigma: 963,
            tau: 964,
            upsilon: 965,
            phi: 966,
            chi: 967,
            psi: 968,
            omega: 969,
            thetasym: 977,
            upsih: 978,
            piv: 982,
            ensp: 8194,
            emsp: 8195,
            thinsp: 8201,
            zwnj: 8204,
            zwj: 8205,
            lrm: 8206,
            rlm: 8207,
            ndash: 8211,
            mdash: 8212,
            lsquo: 8216,
            rsquo: 8217,
            sbquo: 8218,
            ldquo: 8220,
            rdquo: 8221,
            bdquo: 8222,
            dagger: 8224,
            Dagger: 8225,
            bull: 8226,
            hellip: 8230,
            permil: 8240,
            prime: 8242,
            Prime: 8243,
            lsaquo: 8249,
            rsaquo: 8250,
            oline: 8254,
            frasl: 8260,
            euro: 8364,
            image: 8465,
            weierp: 8472,
            real: 8476,
            trade: 8482,
            alefsym: 8501,
            larr: 8592,
            uarr: 8593,
            rarr: 8594,
            darr: 8595,
            harr: 8596,
            crarr: 8629,
            lArr: 8656,
            uArr: 8657,
            rArr: 8658,
            dArr: 8659,
            hArr: 8660,
            forall: 8704,
            part: 8706,
            exist: 8707,
            empty: 8709,
            nabla: 8711,
            isin: 8712,
            notin: 8713,
            ni: 8715,
            prod: 8719,
            sum: 8721,
            minus: 8722,
            lowast: 8727,
            radic: 8730,
            prop: 8733,
            infin: 8734,
            ang: 8736,
            and: 8743,
            or: 8744,
            cap: 8745,
            cup: 8746,
            'int': 8747,
            there4: 8756,
            sim: 8764,
            cong: 8773,
            asymp: 8776,
            ne: 8800,
            equiv: 8801,
            le: 8804,
            ge: 8805,
            sub: 8834,
            sup: 8835,
            nsub: 8836,
            sube: 8838,
            supe: 8839,
            oplus: 8853,
            otimes: 8855,
            perp: 8869,
            sdot: 8901,
            lceil: 8968,
            rceil: 8969,
            lfloor: 8970,
            rfloor: 8971,
            lang: 9001,
            rang: 9002,
            loz: 9674,
            spades: 9824,
            clubs: 9827,
            hearts: 9829,
            diams: 9830
        };
        controlCharacters = [
            8364,
            129,
            8218,
            402,
            8222,
            8230,
            8224,
            8225,
            710,
            8240,
            352,
            8249,
            338,
            141,
            381,
            143,
            144,
            8216,
            8217,
            8220,
            8221,
            8226,
            8211,
            8212,
            732,
            8482,
            353,
            8250,
            339,
            157,
            382,
            376
        ];
        namedEntityPattern = new RegExp('&(' + Object.keys(htmlEntities).join('|') + ');?', 'g');
        hexEntityPattern = /&#x([0-9]+);?/g;
        decimalEntityPattern = /&#([0-9]+);?/g;
        validateCode = function (code) {
            if (!code) {
                return 65533;
            }
            if (code === 10) {
                return 32;
            }
            if (code < 128) {
                return code;
            }
            if (code <= 159) {
                return controlCharacters[code - 128];
            }
            if (code < 55296) {
                return code;
            }
            if (code <= 57343) {
                return 65533;
            }
            if (code <= 65535) {
                return code;
            }
            return 65533;
        };
        decodeCharacterReferences = function (html) {
            var result;
            result = html.replace(namedEntityPattern, function (match, name) {
                if (htmlEntities[name]) {
                    return String.fromCharCode(htmlEntities[name]);
                }
                return match;
            });
            result = result.replace(hexEntityPattern, function (match, hex) {
                return String.fromCharCode(validateCode(parseInt(hex, 16)));
            });
            result = result.replace(decimalEntityPattern, function (match, charCode) {
                return String.fromCharCode(validateCode(charCode));
            });
            return result;
        };
        whitespace = /\s+/g;
        return TextStub;
    }(config_types);
var parse_Parser_getText__getText = function (types, TextStub) {
        
        return function (token) {
            if (token.type === types.TEXT) {
                this.pos += 1;
                return new TextStub(token, this.preserveWhitespace);
            }
            return null;
        };
    }(config_types, parse_Parser_getText_TextStub__TextStub);
var parse_Parser_getComment_CommentStub__CommentStub = function (types) {
        
        var CommentStub;
        CommentStub = function (token) {
            this.content = token.content;
        };
        CommentStub.prototype = {
            toJSON: function () {
                return {
                    t: types.COMMENT,
                    f: this.content
                };
            },
            toString: function () {
                return '<!--' + this.content + '-->';
            }
        };
        return CommentStub;
    }(config_types);
var parse_Parser_getComment__getComment = function (types, CommentStub) {
        
        return function (token) {
            if (token.type === types.COMMENT) {
                this.pos += 1;
                return new CommentStub(token, this.preserveWhitespace);
            }
            return null;
        };
    }(config_types, parse_Parser_getComment_CommentStub__CommentStub);
var parse_Parser_getMustache_ExpressionStub__ExpressionStub = function (types, isObject) {
        
        var ExpressionStub, getRefs, stringify;
        ExpressionStub = function (token) {
            this.refs = [];
            getRefs(token, this.refs);
            this.str = stringify(token, this.refs);
        };
        ExpressionStub.prototype = {
            toJSON: function () {
                if (this.json) {
                    return this.json;
                }
                this.json = {
                    r: this.refs,
                    s: this.str
                };
                return this.json;
            }
        };
        getRefs = function (token, refs) {
            var i, list;
            if (token.t === types.REFERENCE) {
                if (refs.indexOf(token.n) === -1) {
                    refs.unshift(token.n);
                }
            }
            list = token.o || token.m;
            if (list) {
                if (isObject(list)) {
                    getRefs(list, refs);
                } else {
                    i = list.length;
                    while (i--) {
                        getRefs(list[i], refs);
                    }
                }
            }
            if (token.x) {
                getRefs(token.x, refs);
            }
            if (token.r) {
                getRefs(token.r, refs);
            }
            if (token.v) {
                getRefs(token.v, refs);
            }
        };
        stringify = function (token, refs) {
            var map = function (item) {
                return stringify(item, refs);
            };
            switch (token.t) {
            case types.BOOLEAN_LITERAL:
            case types.GLOBAL:
            case types.NUMBER_LITERAL:
                return token.v;
            case types.STRING_LITERAL:
                return '\'' + token.v.replace(/'/g, '\\\'') + '\'';
            case types.ARRAY_LITERAL:
                return '[' + (token.m ? token.m.map(map).join(',') : '') + ']';
            case types.OBJECT_LITERAL:
                return '{' + (token.m ? token.m.map(map).join(',') : '') + '}';
            case types.KEY_VALUE_PAIR:
                return token.k + ':' + stringify(token.v, refs);
            case types.PREFIX_OPERATOR:
                return (token.s === 'typeof' ? 'typeof ' : token.s) + stringify(token.o, refs);
            case types.INFIX_OPERATOR:
                return stringify(token.o[0], refs) + (token.s.substr(0, 2) === 'in' ? ' ' + token.s + ' ' : token.s) + stringify(token.o[1], refs);
            case types.INVOCATION:
                return stringify(token.x, refs) + '(' + (token.o ? token.o.map(map).join(',') : '') + ')';
            case types.BRACKETED:
                return '(' + stringify(token.x, refs) + ')';
            case types.MEMBER:
                return stringify(token.x, refs) + stringify(token.r, refs);
            case types.REFINEMENT:
                return token.n ? '.' + token.n : '[' + stringify(token.x, refs) + ']';
            case types.CONDITIONAL:
                return stringify(token.o[0], refs) + '?' + stringify(token.o[1], refs) + ':' + stringify(token.o[2], refs);
            case types.REFERENCE:
                return '${' + refs.indexOf(token.n) + '}';
            default:
                throw new Error('Could not stringify expression token. This error is unexpected');
            }
        };
        return ExpressionStub;
    }(config_types, utils_isObject);
var parse_Parser_getMustache_MustacheStub__MustacheStub = function (types, ExpressionStub) {
        
        var MustacheStub = function (token, parser) {
            this.type = token.type === types.TRIPLE ? types.TRIPLE : token.mustacheType;
            if (token.ref) {
                this.ref = token.ref;
            }
            if (token.expression) {
                this.expr = new ExpressionStub(token.expression);
            }
            parser.pos += 1;
        };
        MustacheStub.prototype = {
            toJSON: function () {
                var json;
                if (this.json) {
                    return this.json;
                }
                json = { t: this.type };
                if (this.ref) {
                    json.r = this.ref;
                }
                if (this.expr) {
                    json.x = this.expr.toJSON();
                }
                this.json = json;
                return json;
            },
            toString: function () {
                return false;
            }
        };
        return MustacheStub;
    }(config_types, parse_Parser_getMustache_ExpressionStub__ExpressionStub);
var parse_Parser_utils_stringifyStubs = function () {
        
        return function (items) {
            var str = '', itemStr, i, len;
            if (!items) {
                return '';
            }
            for (i = 0, len = items.length; i < len; i += 1) {
                itemStr = items[i].toString();
                if (itemStr === false) {
                    return false;
                }
                str += itemStr;
            }
            return str;
        };
    }();
var parse_Parser_utils_jsonifyStubs = function (stringifyStubs) {
        
        return function (items, noStringify) {
            var str, json;
            if (!noStringify) {
                str = stringifyStubs(items);
                if (str !== false) {
                    return str;
                }
            }
            json = items.map(function (item) {
                return item.toJSON(noStringify);
            });
            return json;
        };
    }(parse_Parser_utils_stringifyStubs);
var parse_Parser_getMustache_SectionStub__SectionStub = function (types, jsonifyStubs, ExpressionStub) {
        
        var SectionStub = function (firstToken, parser) {
            var next;
            this.ref = firstToken.ref;
            this.indexRef = firstToken.indexRef;
            this.inverted = firstToken.mustacheType === types.INVERTED;
            if (firstToken.expression) {
                this.expr = new ExpressionStub(firstToken.expression);
            }
            parser.pos += 1;
            this.items = [];
            next = parser.next();
            while (next) {
                if (next.mustacheType === types.CLOSING) {
                    if (next.ref.trim() === this.ref || this.expr) {
                        parser.pos += 1;
                        break;
                    } else {
                        throw new Error('Could not parse template: Illegal closing section');
                    }
                }
                this.items[this.items.length] = parser.getStub();
                next = parser.next();
            }
        };
        SectionStub.prototype = {
            toJSON: function (noStringify) {
                var json;
                if (this.json) {
                    return this.json;
                }
                json = { t: types.SECTION };
                if (this.ref) {
                    json.r = this.ref;
                }
                if (this.indexRef) {
                    json.i = this.indexRef;
                }
                if (this.inverted) {
                    json.n = true;
                }
                if (this.expr) {
                    json.x = this.expr.toJSON();
                }
                if (this.items.length) {
                    json.f = jsonifyStubs(this.items, noStringify);
                }
                this.json = json;
                return json;
            },
            toString: function () {
                return false;
            }
        };
        return SectionStub;
    }(config_types, parse_Parser_utils_jsonifyStubs, parse_Parser_getMustache_ExpressionStub__ExpressionStub);
var parse_Parser_getMustache__getMustache = function (types, MustacheStub, SectionStub) {
        
        return function (token) {
            if (token.type === types.MUSTACHE || token.type === types.TRIPLE) {
                if (token.mustacheType === types.SECTION || token.mustacheType === types.INVERTED) {
                    return new SectionStub(token, this);
                }
                return new MustacheStub(token, this);
            }
        };
    }(config_types, parse_Parser_getMustache_MustacheStub__MustacheStub, parse_Parser_getMustache_SectionStub__SectionStub);
var parse_Parser_getElement_ElementStub_utils_siblingsByTagName = function () {
        
        return {
            li: ['li'],
            dt: [
                'dt',
                'dd'
            ],
            dd: [
                'dt',
                'dd'
            ],
            p: 'address article aside blockquote dir div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hgroup hr menu nav ol p pre section table ul'.split(' '),
            rt: [
                'rt',
                'rp'
            ],
            rp: [
                'rp',
                'rt'
            ],
            optgroup: ['optgroup'],
            option: [
                'option',
                'optgroup'
            ],
            thead: [
                'tbody',
                'tfoot'
            ],
            tbody: [
                'tbody',
                'tfoot'
            ],
            tr: ['tr'],
            td: [
                'td',
                'th'
            ],
            th: [
                'td',
                'th'
            ]
        };
    }();
var parse_Parser_getElement_ElementStub_utils_filterAttributes = function (isArray) {
        
        return function (items) {
            var attrs, proxies, filtered, i, len, item;
            filtered = {};
            attrs = [];
            proxies = [];
            len = items.length;
            for (i = 0; i < len; i += 1) {
                item = items[i];
                if (item.name === 'intro') {
                    if (filtered.intro) {
                        throw new Error('An element can only have one intro transition');
                    }
                    filtered.intro = item;
                } else if (item.name === 'outro') {
                    if (filtered.outro) {
                        throw new Error('An element can only have one outro transition');
                    }
                    filtered.outro = item;
                } else if (item.name === 'intro-outro') {
                    if (filtered.intro || filtered.outro) {
                        throw new Error('An element can only have one intro and one outro transition');
                    }
                    filtered.intro = item;
                    filtered.outro = deepClone(item);
                } else if (item.name.substr(0, 6) === 'proxy-') {
                    item.name = item.name.substring(6);
                    proxies[proxies.length] = item;
                } else if (item.name.substr(0, 3) === 'on-') {
                    item.name = item.name.substring(3);
                    proxies[proxies.length] = item;
                } else if (item.name === 'decorator') {
                    filtered.decorator = item;
                } else {
                    attrs[attrs.length] = item;
                }
            }
            filtered.attrs = attrs;
            filtered.proxies = proxies;
            return filtered;
        };
        function deepClone(obj) {
            var result, key;
            if (typeof obj !== 'object') {
                return obj;
            }
            if (isArray(obj)) {
                return obj.map(deepClone);
            }
            result = {};
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[key] = deepClone(obj[key]);
                }
            }
            return result;
        }
    }(utils_isArray);
var parse_Parser_getElement_ElementStub_utils_processDirective = function (types, parseJSON) {
        
        return function (directive) {
            var processed, tokens, token, colonIndex, throwError, directiveName, directiveArgs, parsed;
            throwError = function () {
                throw new Error('Illegal directive');
            };
            if (!directive.name || !directive.value) {
                throwError();
            }
            processed = { directiveType: directive.name };
            tokens = directive.value;
            directiveName = [];
            directiveArgs = [];
            while (tokens.length) {
                token = tokens.shift();
                if (token.type === types.TEXT) {
                    colonIndex = token.value.indexOf(':');
                    if (colonIndex === -1) {
                        directiveName[directiveName.length] = token;
                    } else {
                        if (colonIndex) {
                            directiveName[directiveName.length] = {
                                type: types.TEXT,
                                value: token.value.substr(0, colonIndex)
                            };
                        }
                        if (token.value.length > colonIndex + 1) {
                            directiveArgs[0] = {
                                type: types.TEXT,
                                value: token.value.substring(colonIndex + 1)
                            };
                        }
                        break;
                    }
                } else {
                    directiveName[directiveName.length] = token;
                }
            }
            directiveArgs = directiveArgs.concat(tokens);
            if (directiveName.length === 1 && directiveName[0].type === types.TEXT) {
                processed.name = directiveName[0].value;
            } else {
                processed.name = directiveName;
            }
            if (directiveArgs.length) {
                if (directiveArgs.length === 1 && directiveArgs[0].type === types.TEXT) {
                    parsed = parseJSON('[' + directiveArgs[0].value + ']');
                    processed.args = parsed ? parsed.value : directiveArgs[0].value;
                } else {
                    processed.dynamicArgs = directiveArgs;
                }
            }
            return processed;
        };
    }(config_types, utils_parseJSON);
var parse_Parser_StringStub_StringParser = function (getText, getMustache) {
        
        var StringParser;
        StringParser = function (tokens, options) {
            var stub;
            this.tokens = tokens || [];
            this.pos = 0;
            this.options = options;
            this.result = [];
            while (stub = this.getStub()) {
                this.result.push(stub);
            }
        };
        StringParser.prototype = {
            getStub: function () {
                var token = this.next();
                if (!token) {
                    return null;
                }
                return this.getText(token) || this.getMustache(token);
            },
            getText: getText,
            getMustache: getMustache,
            next: function () {
                return this.tokens[this.pos];
            }
        };
        return StringParser;
    }(parse_Parser_getText__getText, parse_Parser_getMustache__getMustache);
var parse_Parser_StringStub__StringStub = function (StringParser, stringifyStubs, jsonifyStubs) {
        
        var StringStub;
        StringStub = function (tokens) {
            var parser = new StringParser(tokens);
            this.stubs = parser.result;
        };
        StringStub.prototype = {
            toJSON: function (noStringify) {
                var json;
                if (this['json_' + noStringify]) {
                    return this['json_' + noStringify];
                }
                json = this['json_' + noStringify] = jsonifyStubs(this.stubs, noStringify);
                return json;
            },
            toString: function () {
                if (this.str !== undefined) {
                    return this.str;
                }
                this.str = stringifyStubs(this.stubs);
                return this.str;
            }
        };
        return StringStub;
    }(parse_Parser_StringStub_StringParser, parse_Parser_utils_stringifyStubs, parse_Parser_utils_jsonifyStubs);
var parse_Parser_getElement_ElementStub_utils_jsonifyDirective = function (StringStub) {
        
        return function (directive) {
            var result, name;
            if (typeof directive.name === 'string') {
                if (!directive.args && !directive.dynamicArgs) {
                    return directive.name;
                }
                name = directive.name;
            } else {
                name = new StringStub(directive.name).toJSON();
            }
            result = { n: name };
            if (directive.args) {
                result.a = directive.args;
                return result;
            }
            if (directive.dynamicArgs) {
                result.d = new StringStub(directive.dynamicArgs).toJSON();
            }
            return result;
        };
    }(parse_Parser_StringStub__StringStub);
var parse_Parser_getElement_ElementStub_toJSON = function (types, jsonifyStubs, jsonifyDirective) {
        
        return function (noStringify) {
            var json, name, value, proxy, i, len, attribute;
            if (this['json_' + noStringify]) {
                return this['json_' + noStringify];
            }
            if (this.component) {
                json = {
                    t: types.COMPONENT,
                    e: this.component
                };
            } else {
                json = {
                    t: types.ELEMENT,
                    e: this.tag
                };
            }
            if (this.doctype) {
                json.y = 1;
            }
            if (this.attributes && this.attributes.length) {
                json.a = {};
                len = this.attributes.length;
                for (i = 0; i < len; i += 1) {
                    attribute = this.attributes[i];
                    name = attribute.name;
                    if (json.a[name]) {
                        throw new Error('You cannot have multiple attributes with the same name');
                    }
                    if (attribute.value === null) {
                        value = null;
                    } else {
                        value = attribute.value.toJSON(noStringify);
                    }
                    json.a[name] = value;
                }
            }
            if (this.items && this.items.length) {
                json.f = jsonifyStubs(this.items, noStringify);
            }
            if (this.proxies && this.proxies.length) {
                json.v = {};
                len = this.proxies.length;
                for (i = 0; i < len; i += 1) {
                    proxy = this.proxies[i];
                    json.v[proxy.directiveType] = jsonifyDirective(proxy);
                }
            }
            if (this.intro) {
                json.t1 = jsonifyDirective(this.intro);
            }
            if (this.outro) {
                json.t2 = jsonifyDirective(this.outro);
            }
            if (this.decorator) {
                json.o = jsonifyDirective(this.decorator);
            }
            this['json_' + noStringify] = json;
            return json;
        };
    }(config_types, parse_Parser_utils_jsonifyStubs, parse_Parser_getElement_ElementStub_utils_jsonifyDirective);
var parse_Parser_getElement_ElementStub_toString = function (stringifyStubs, voidElementNames) {
        
        var htmlElements;
        htmlElements = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');
        return function () {
            var str, i, len, attrStr, name, attrValueStr, fragStr, isVoid;
            if (this.str !== undefined) {
                return this.str;
            }
            if (this.component) {
                return this.str = false;
            }
            if (htmlElements.indexOf(this.tag.toLowerCase()) === -1) {
                return this.str = false;
            }
            if (this.proxies || this.intro || this.outro || this.decorator) {
                return this.str = false;
            }
            fragStr = stringifyStubs(this.items);
            if (fragStr === false) {
                return this.str = false;
            }
            isVoid = voidElementNames.indexOf(this.tag.toLowerCase()) !== -1;
            str = '<' + this.tag;
            if (this.attributes) {
                for (i = 0, len = this.attributes.length; i < len; i += 1) {
                    name = this.attributes[i].name;
                    if (name.indexOf(':') !== -1) {
                        return this.str = false;
                    }
                    if (name === 'id' || name === 'intro' || name === 'outro') {
                        return this.str = false;
                    }
                    attrStr = ' ' + name;
                    if (this.attributes[i].value !== null) {
                        attrValueStr = this.attributes[i].value.toString();
                        if (attrValueStr === false) {
                            return this.str = false;
                        }
                        if (attrValueStr !== '') {
                            attrStr += '=';
                            if (/[\s"'=<>`]/.test(attrValueStr)) {
                                attrStr += '"' + attrValueStr.replace(/"/g, '&quot;') + '"';
                            } else {
                                attrStr += attrValueStr;
                            }
                        }
                    }
                    str += attrStr;
                }
            }
            if (this.selfClosing && !isVoid) {
                str += '/>';
                return this.str = str;
            }
            str += '>';
            if (isVoid) {
                return this.str = str;
            }
            str += fragStr;
            str += '</' + this.tag + '>';
            return this.str = str;
        };
    }(parse_Parser_utils_stringifyStubs, config_voidElementNames);
var parse_Parser_getElement_ElementStub__ElementStub = function (types, voidElementNames, warn, camelCase, stringifyStubs, siblingsByTagName, filterAttributes, processDirective, toJSON, toString, StringStub) {
        
        var ElementStub, allElementNames, closedByParentClose, onPattern, sanitize, leadingWhitespace = /^\s+/, trailingWhitespace = /\s+$/;
        ElementStub = function (firstToken, parser, preserveWhitespace) {
            var next, attrs, filtered, proxies, item, getFrag, lowerCaseTag;
            parser.pos += 1;
            getFrag = function (attr) {
                return {
                    name: attr.name,
                    value: attr.value ? new StringStub(attr.value) : null
                };
            };
            this.tag = firstToken.name;
            lowerCaseTag = firstToken.name.toLowerCase();
            if (lowerCaseTag.substr(0, 3) === 'rv-') {
                warn('The "rv-" prefix for components has been deprecated. Support will be removed in a future version');
                this.tag = this.tag.substring(3);
            }
            preserveWhitespace = preserveWhitespace || lowerCaseTag === 'pre';
            if (firstToken.attrs) {
                filtered = filterAttributes(firstToken.attrs);
                attrs = filtered.attrs;
                proxies = filtered.proxies;
                if (parser.options.sanitize && parser.options.sanitize.eventAttributes) {
                    attrs = attrs.filter(sanitize);
                }
                if (attrs.length) {
                    this.attributes = attrs.map(getFrag);
                }
                if (proxies.length) {
                    this.proxies = proxies.map(processDirective);
                }
                if (filtered.intro) {
                    this.intro = processDirective(filtered.intro);
                }
                if (filtered.outro) {
                    this.outro = processDirective(filtered.outro);
                }
                if (filtered.decorator) {
                    this.decorator = processDirective(filtered.decorator);
                }
            }
            if (firstToken.doctype) {
                this.doctype = true;
            }
            if (firstToken.selfClosing) {
                this.selfClosing = true;
            }
            if (voidElementNames.indexOf(lowerCaseTag) !== -1) {
                this.isVoid = true;
            }
            if (this.selfClosing || this.isVoid) {
                return;
            }
            this.siblings = siblingsByTagName[lowerCaseTag];
            this.items = [];
            next = parser.next();
            while (next) {
                if (next.mustacheType === types.CLOSING) {
                    break;
                }
                if (next.type === types.TAG) {
                    if (next.closing) {
                        if (next.name.toLowerCase() === lowerCaseTag) {
                            parser.pos += 1;
                        }
                        break;
                    } else if (this.siblings && this.siblings.indexOf(next.name.toLowerCase()) !== -1) {
                        break;
                    }
                }
                this.items[this.items.length] = parser.getStub();
                next = parser.next();
            }
            if (!preserveWhitespace) {
                item = this.items[0];
                if (item && item.type === types.TEXT) {
                    item.text = item.text.replace(leadingWhitespace, '');
                    if (!item.text) {
                        this.items.shift();
                    }
                }
                item = this.items[this.items.length - 1];
                if (item && item.type === types.TEXT) {
                    item.text = item.text.replace(trailingWhitespace, '');
                    if (!item.text) {
                        this.items.pop();
                    }
                }
            }
        };
        ElementStub.prototype = {
            toJSON: toJSON,
            toString: toString
        };
        allElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');
        closedByParentClose = 'li dd rt rp optgroup option tbody tfoot tr td th'.split(' ');
        onPattern = /^on[a-zA-Z]/;
        sanitize = function (attr) {
            var valid = !onPattern.test(attr.name);
            return valid;
        };
        return ElementStub;
    }(config_types, config_voidElementNames, utils_warn, utils_camelCase, parse_Parser_utils_stringifyStubs, parse_Parser_getElement_ElementStub_utils_siblingsByTagName, parse_Parser_getElement_ElementStub_utils_filterAttributes, parse_Parser_getElement_ElementStub_utils_processDirective, parse_Parser_getElement_ElementStub_toJSON, parse_Parser_getElement_ElementStub_toString, parse_Parser_StringStub__StringStub);
var parse_Parser_getElement__getElement = function (types, ElementStub) {
        
        return function (token) {
            if (this.options.sanitize && this.options.sanitize.elements) {
                if (this.options.sanitize.elements.indexOf(token.name.toLowerCase()) !== -1) {
                    return null;
                }
            }
            return new ElementStub(token, this);
        };
    }(config_types, parse_Parser_getElement_ElementStub__ElementStub);
var parse_Parser__Parser = function (getText, getComment, getMustache, getElement, jsonifyStubs) {
        
        var Parser;
        Parser = function (tokens, options) {
            var stub, stubs;
            this.tokens = tokens || [];
            this.pos = 0;
            this.options = options;
            this.preserveWhitespace = options.preserveWhitespace;
            stubs = [];
            while (stub = this.getStub()) {
                stubs.push(stub);
            }
            this.result = jsonifyStubs(stubs);
        };
        Parser.prototype = {
            getStub: function () {
                var token = this.next();
                if (!token) {
                    return null;
                }
                return this.getText(token) || this.getComment(token) || this.getMustache(token) || this.getElement(token);
            },
            getText: getText,
            getComment: getComment,
            getMustache: getMustache,
            getElement: getElement,
            next: function () {
                return this.tokens[this.pos];
            }
        };
        return Parser;
    }(parse_Parser_getText__getText, parse_Parser_getComment__getComment, parse_Parser_getMustache__getMustache, parse_Parser_getElement__getElement, parse_Parser_utils_jsonifyStubs);
var parse__parse = function (tokenize, types, Parser) {
        
        var parse, onlyWhitespace, inlinePartialStart, inlinePartialEnd, parseCompoundTemplate;
        onlyWhitespace = /^\s*$/;
        inlinePartialStart = /<!--\s*\{\{\s*>\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*}\}\s*-->/;
        inlinePartialEnd = /<!--\s*\{\{\s*\/\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*}\}\s*-->/;
        parse = function (template, options) {
            var tokens, json, token;
            options = options || {};
            if (inlinePartialStart.test(template)) {
                return parseCompoundTemplate(template, options);
            }
            if (options.sanitize === true) {
                options.sanitize = {
                    elements: 'applet base basefont body frame frameset head html isindex link meta noframes noscript object param script style title'.split(' '),
                    eventAttributes: true
                };
            }
            tokens = tokenize(template, options);
            if (!options.preserveWhitespace) {
                token = tokens[0];
                if (token && token.type === types.TEXT && onlyWhitespace.test(token.value)) {
                    tokens.shift();
                }
                token = tokens[tokens.length - 1];
                if (token && token.type === types.TEXT && onlyWhitespace.test(token.value)) {
                    tokens.pop();
                }
            }
            json = new Parser(tokens, options).result;
            if (typeof json === 'string') {
                return [json];
            }
            return json;
        };
        parseCompoundTemplate = function (template, options) {
            var mainTemplate, remaining, partials, name, startMatch, endMatch;
            partials = {};
            mainTemplate = '';
            remaining = template;
            while (startMatch = inlinePartialStart.exec(remaining)) {
                name = startMatch[1];
                mainTemplate += remaining.substr(0, startMatch.index);
                remaining = remaining.substring(startMatch.index + startMatch[0].length);
                endMatch = inlinePartialEnd.exec(remaining);
                if (!endMatch || endMatch[1] !== name) {
                    throw new Error('Inline partials must have a closing delimiter, and cannot be nested');
                }
                partials[name] = parse(remaining.substr(0, endMatch.index), options);
                remaining = remaining.substring(endMatch.index + endMatch[0].length);
            }
            return {
                main: parse(mainTemplate, options),
                partials: partials
            };
        };
        return parse;
    }(parse_tokenize, config_types, parse_Parser__Parser);
var render_DomFragment_Partial_getPartialDescriptor = function (errors, isClient, warn, isObject, partials, parse) {
        
        var getPartialDescriptor, registerPartial, getPartialFromRegistry, unpack;
        getPartialDescriptor = function (root, name) {
            var el, partial, errorMessage;
            if (partial = getPartialFromRegistry(root, name)) {
                return partial;
            }
            if (isClient) {
                el = document.getElementById(name);
                if (el && el.tagName === 'SCRIPT') {
                    if (!parse) {
                        throw new Error(errors.missingParser);
                    }
                    registerPartial(parse(el.innerHTML), name, partials);
                }
            }
            partial = partials[name];
            if (!partial) {
                errorMessage = 'Could not find descriptor for partial "' + name + '"';
                if (root.debug) {
                    throw new Error(errorMessage);
                } else {
                    warn(errorMessage);
                }
                return [];
            }
            return unpack(partial);
        };
        getPartialFromRegistry = function (registryOwner, name) {
            var partial;
            if (registryOwner.partials[name]) {
                if (typeof registryOwner.partials[name] === 'string') {
                    if (!parse) {
                        throw new Error(errors.missingParser);
                    }
                    partial = parse(registryOwner.partials[name], registryOwner.parseOptions);
                    registerPartial(partial, name, registryOwner.partials);
                }
                return unpack(registryOwner.partials[name]);
            }
        };
        registerPartial = function (partial, name, registry) {
            var key;
            if (isObject(partial)) {
                registry[name] = partial.main;
                for (key in partial.partials) {
                    if (partial.partials.hasOwnProperty(key)) {
                        registry[key] = partial.partials[key];
                    }
                }
            } else {
                registry[name] = partial;
            }
        };
        unpack = function (partial) {
            if (partial.length === 1 && typeof partial[0] === 'string') {
                return partial[0];
            }
            return partial;
        };
        return getPartialDescriptor;
    }(config_errors, config_isClient, utils_warn, utils_isObject, registries_partials, parse__parse);
var render_DomFragment_Partial__Partial = function (types, getPartialDescriptor, circular) {
        
        var DomPartial, DomFragment;
        circular.push(function () {
            DomFragment = circular.DomFragment;
        });
        DomPartial = function (options, docFrag) {
            var parentFragment = this.parentFragment = options.parentFragment, descriptor;
            this.type = types.PARTIAL;
            this.name = options.descriptor.r;
            this.index = options.index;
            if (!options.descriptor.r) {
                throw new Error('Partials must have a static reference (no expressions). This may change in a future version of Ractive.');
            }
            descriptor = getPartialDescriptor(parentFragment.root, options.descriptor.r);
            this.fragment = new DomFragment({
                descriptor: descriptor,
                root: parentFragment.root,
                pNode: parentFragment.pNode,
                contextStack: parentFragment.contextStack,
                owner: this
            });
            if (docFrag) {
                docFrag.appendChild(this.fragment.docFrag);
            }
        };
        DomPartial.prototype = {
            firstNode: function () {
                return this.fragment.firstNode();
            },
            findNextNode: function () {
                return this.parentFragment.findNextNode(this);
            },
            detach: function () {
                return this.fragment.detach();
            },
            teardown: function (destroy) {
                this.fragment.teardown(destroy);
            },
            toString: function () {
                return this.fragment.toString();
            },
            find: function (selector) {
                return this.fragment.find(selector);
            },
            findAll: function (selector, query) {
                return this.fragment.findAll(selector, query);
            },
            findComponent: function (selector) {
                return this.fragment.findComponent(selector);
            },
            findAllComponents: function (selector, query) {
                return this.fragment.findAllComponents(selector, query);
            }
        };
        return DomPartial;
    }(config_types, render_DomFragment_Partial_getPartialDescriptor, circular);
var render_DomFragment_Component_initialise_createModel_ComponentParameter = function (StringFragment) {
        
        var ComponentParameter = function (component, key, value) {
            this.parentFragment = component.parentFragment;
            this.component = component;
            this.key = key;
            this.fragment = new StringFragment({
                descriptor: value,
                root: component.root,
                owner: this,
                contextStack: component.parentFragment.contextStack
            });
            this.selfUpdating = this.fragment.isSimple();
            this.value = this.fragment.getValue();
        };
        ComponentParameter.prototype = {
            bubble: function () {
                if (this.selfUpdating) {
                    this.update();
                } else if (!this.deferred && this.ready) {
                    this.root._deferred.attrs.push(this);
                    this.deferred = true;
                }
            },
            update: function () {
                var value = this.fragment.getValue();
                this.component.instance.set(this.key, value);
                this.value = value;
            },
            teardown: function () {
                this.fragment.teardown();
            }
        };
        return ComponentParameter;
    }(render_StringFragment__StringFragment);
var render_DomFragment_Component_initialise_createModel__createModel = function (types, parseJSON, resolveRef, ComponentParameter) {
        
        return function (component, attributes, toBind) {
            var data, key, value;
            data = {};
            component.complexParameters = [];
            for (key in attributes) {
                if (attributes.hasOwnProperty(key)) {
                    value = getValue(component, key, attributes[key], toBind);
                    if (value !== undefined) {
                        data[key] = value;
                    }
                }
            }
            return data;
        };
        function getValue(component, key, descriptor, toBind) {
            var parameter, parsed, root, parentFragment, keypath;
            root = component.root;
            parentFragment = component.parentFragment;
            if (typeof descriptor === 'string') {
                parsed = parseJSON(descriptor);
                return parsed ? parsed.value : descriptor;
            }
            if (descriptor === null) {
                return true;
            }
            if (descriptor.length === 1 && descriptor[0].t === types.INTERPOLATOR && descriptor[0].r) {
                if (parentFragment.indexRefs && parentFragment.indexRefs[descriptor[0].r] !== undefined) {
                    return parentFragment.indexRefs[descriptor[0].r];
                }
                keypath = resolveRef(root, descriptor[0].r, parentFragment.contextStack) || descriptor[0].r;
                toBind.push({
                    childKeypath: key,
                    parentKeypath: keypath
                });
                return root.get(keypath);
            }
            parameter = new ComponentParameter(component, key, descriptor);
            component.complexParameters.push(parameter);
            return parameter.value;
        }
    }(config_types, utils_parseJSON, shared_resolveRef, render_DomFragment_Component_initialise_createModel_ComponentParameter);
var render_DomFragment_Component_initialise_createInstance = function () {
        
        return function (component, Component, data, docFrag, contentDescriptor) {
            var instance, parentFragment, partials, root;
            parentFragment = component.parentFragment;
            root = component.root;
            partials = { content: contentDescriptor || [] };
            instance = new Component({
                el: parentFragment.pNode.cloneNode(false),
                data: data,
                partials: partials,
                _parent: root,
                adaptors: root.adaptors
            });
            instance.component = component;
            component.instance = instance;
            instance.insert(docFrag);
            instance.fragment.pNode = parentFragment.pNode;
            return instance;
        };
    }();
var render_DomFragment_Component_initialise_createObservers = function () {
        
        var observeOptions = {
                init: false,
                debug: true
            };
        return function (component, toBind) {
            var pair, i;
            component.observers = [];
            i = toBind.length;
            while (i--) {
                pair = toBind[i];
                bind(component, pair.parentKeypath, pair.childKeypath);
            }
        };
        function bind(component, parentKeypath, childKeypath) {
            var parentInstance, childInstance, settingParent, settingChild, observers, observer, value;
            parentInstance = component.root;
            childInstance = component.instance;
            observers = component.observers;
            observer = parentInstance.observe(parentKeypath, function (value) {
                if (!settingParent && !parentInstance._wrapped[parentKeypath]) {
                    settingChild = true;
                    childInstance.set(childKeypath, value);
                    settingChild = false;
                }
            }, observeOptions);
            observers.push(observer);
            if (childInstance.twoway) {
                observer = childInstance.observe(childKeypath, function (value) {
                    if (!settingChild) {
                        settingParent = true;
                        parentInstance.set(parentKeypath, value);
                        settingParent = false;
                    }
                }, observeOptions);
                observers.push(observer);
                value = childInstance.get(childKeypath);
                if (value !== undefined) {
                    parentInstance.set(parentKeypath, value);
                }
            }
        }
    }();
var render_DomFragment_Component_initialise_propagateEvents = function (warn) {
        
        var errorMessage = 'Components currently only support simple events - you cannot include arguments. Sorry!';
        return function (component, eventsDescriptor) {
            var eventName;
            for (eventName in eventsDescriptor) {
                if (eventsDescriptor.hasOwnProperty(eventName)) {
                    propagateEvent(component.instance, component.root, eventName, eventsDescriptor[eventName]);
                }
            }
        };
        function propagateEvent(childInstance, parentInstance, eventName, proxyEventName) {
            if (typeof proxyEventName !== 'string') {
                if (parentInstance.debug) {
                    throw new Error(errorMessage);
                } else {
                    warn(errorMessage);
                    return;
                }
            }
            childInstance.on(eventName, function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(proxyEventName);
                parentInstance.fire.apply(parentInstance, args);
            });
        }
    }(utils_warn);
var render_DomFragment_Component_initialise_updateLiveQueries = function () {
        
        return function (component) {
            var ancestor, query;
            ancestor = component.root;
            while (ancestor) {
                if (query = ancestor._liveComponentQueries[component.name]) {
                    query.push(component.instance);
                }
                ancestor = ancestor._parent;
            }
        };
    }();
var render_DomFragment_Component_initialise__initialise = function (types, warn, createModel, createInstance, createObservers, propagateEvents, updateLiveQueries) {
        
        return function (component, options, docFrag) {
            var parentFragment, root, Component, data, toBind;
            parentFragment = component.parentFragment = options.parentFragment;
            root = parentFragment.root;
            component.root = root;
            component.type = types.COMPONENT;
            component.name = options.descriptor.e;
            component.index = options.index;
            component.observers = [];
            Component = root.components[options.descriptor.e];
            if (!Component) {
                throw new Error('Component "' + options.descriptor.e + '" not found');
            }
            toBind = [];
            data = createModel(component, options.descriptor.a, toBind);
            createInstance(component, Component, data, docFrag, options.descriptor.f);
            createObservers(component, toBind);
            propagateEvents(component, options.descriptor.v);
            if (options.descriptor.t1 || options.descriptor.t2 || options.descriptor.o) {
                warn('The "intro", "outro" and "decorator" directives have no effect on components');
            }
            updateLiveQueries(component);
        };
    }(config_types, utils_warn, render_DomFragment_Component_initialise_createModel__createModel, render_DomFragment_Component_initialise_createInstance, render_DomFragment_Component_initialise_createObservers, render_DomFragment_Component_initialise_propagateEvents, render_DomFragment_Component_initialise_updateLiveQueries);
var render_DomFragment_Component__Component = function (initialise) {
        
        var DomComponent = function (options, docFrag) {
            initialise(this, options, docFrag);
        };
        DomComponent.prototype = {
            firstNode: function () {
                return this.instance.fragment.firstNode();
            },
            findNextNode: function () {
                return this.parentFragment.findNextNode(this);
            },
            detach: function () {
                return this.instance.fragment.detach();
            },
            teardown: function () {
                var query;
                while (this.complexParameters.length) {
                    this.complexParameters.pop().teardown();
                }
                while (this.observers.length) {
                    this.observers.pop().cancel();
                }
                if (query = this.root._liveComponentQueries[this.name]) {
                    query._remove(this);
                }
                this.instance.teardown();
            },
            toString: function () {
                return this.instance.fragment.toString();
            },
            find: function (selector) {
                return this.instance.fragment.find(selector);
            },
            findAll: function (selector, query) {
                return this.instance.fragment.findAll(selector, query);
            },
            findComponent: function (selector) {
                if (!selector || selector === this.name) {
                    return this.instance;
                }
                return null;
            },
            findAllComponents: function (selector, query) {
                query._test(this, true);
                if (this.instance.fragment) {
                    this.instance.fragment.findAllComponents(selector, query);
                }
            }
        };
        return DomComponent;
    }(render_DomFragment_Component_initialise__initialise);
var render_DomFragment_Comment = function (types) {
        
        var DomComment = function (options, docFrag) {
            this.type = types.COMMENT;
            this.descriptor = options.descriptor;
            if (docFrag) {
                this.node = document.createComment(options.descriptor.f);
                docFrag.appendChild(this.node);
            }
        };
        DomComment.prototype = {
            detach: function () {
                this.node.parentNode.removeChild(this.node);
                return this.node;
            },
            teardown: function (destroy) {
                if (destroy) {
                    this.detach();
                }
            },
            firstNode: function () {
                return this.node;
            },
            toString: function () {
                return '<!--' + this.descriptor.f + '-->';
            }
        };
        return DomComment;
    }(config_types);
var render_DomFragment__DomFragment = function (types, matches, initFragment, insertHtml, Text, Interpolator, Section, Triple, Element, Partial, Component, Comment, circular) {
        
        var DomFragment = function (options) {
            if (options.pNode) {
                this.docFrag = document.createDocumentFragment();
            }
            if (typeof options.descriptor === 'string') {
                this.html = options.descriptor;
                if (this.docFrag) {
                    this.nodes = insertHtml(this.html, options.pNode.tagName, this.docFrag);
                }
            } else {
                initFragment(this, options);
            }
        };
        DomFragment.prototype = {
            detach: function () {
                var len, i;
                if (this.nodes) {
                    i = this.nodes.length;
                    while (i--) {
                        this.docFrag.appendChild(this.nodes[i]);
                    }
                } else if (this.items) {
                    len = this.items.length;
                    for (i = 0; i < len; i += 1) {
                        this.docFrag.appendChild(this.items[i].detach());
                    }
                }
                return this.docFrag;
            },
            createItem: function (options) {
                if (typeof options.descriptor === 'string') {
                    return new Text(options, this.docFrag);
                }
                switch (options.descriptor.t) {
                case types.INTERPOLATOR:
                    return new Interpolator(options, this.docFrag);
                case types.SECTION:
                    return new Section(options, this.docFrag);
                case types.TRIPLE:
                    return new Triple(options, this.docFrag);
                case types.ELEMENT:
                    if (this.root.components[options.descriptor.e]) {
                        return new Component(options, this.docFrag);
                    }
                    return new Element(options, this.docFrag);
                case types.PARTIAL:
                    return new Partial(options, this.docFrag);
                case types.COMMENT:
                    return new Comment(options, this.docFrag);
                default:
                    throw new Error('Something very strange happened. Please file an issue at https://github.com/RactiveJS/Ractive/issues. Thanks!');
                }
            },
            teardown: function (destroy) {
                var node;
                if (this.nodes && destroy) {
                    while (node = this.nodes.pop()) {
                        node.parentNode.removeChild(node);
                    }
                } else if (this.items) {
                    while (this.items.length) {
                        this.items.pop().teardown(destroy);
                    }
                }
                this.nodes = this.items = this.docFrag = null;
            },
            firstNode: function () {
                if (this.items && this.items[0]) {
                    return this.items[0].firstNode();
                } else if (this.nodes) {
                    return this.nodes[0] || null;
                }
                return null;
            },
            findNextNode: function (item) {
                var index = item.index;
                if (this.items[index + 1]) {
                    return this.items[index + 1].firstNode();
                }
                if (this.owner === this.root) {
                    if (!this.owner.component) {
                        return null;
                    }
                    return this.owner.component.findNextNode();
                }
                return this.owner.findNextNode(this);
            },
            toString: function () {
                var html, i, len, item;
                if (this.html) {
                    return this.html;
                }
                html = '';
                if (!this.items) {
                    return html;
                }
                len = this.items.length;
                for (i = 0; i < len; i += 1) {
                    item = this.items[i];
                    html += item.toString();
                }
                return html;
            },
            find: function (selector) {
                var i, len, item, node, queryResult;
                if (this.nodes) {
                    len = this.nodes.length;
                    for (i = 0; i < len; i += 1) {
                        node = this.nodes[i];
                        if (node.nodeType !== 1) {
                            continue;
                        }
                        if (matches(node, selector)) {
                            return node;
                        }
                        if (queryResult = node.querySelector(selector)) {
                            return queryResult;
                        }
                    }
                    return null;
                }
                if (this.items) {
                    len = this.items.length;
                    for (i = 0; i < len; i += 1) {
                        item = this.items[i];
                        if (item.find && (queryResult = item.find(selector))) {
                            return queryResult;
                        }
                    }
                    return null;
                }
            },
            findAll: function (selector, query) {
                var i, len, item, node, queryAllResult, numNodes, j;
                if (this.nodes) {
                    len = this.nodes.length;
                    for (i = 0; i < len; i += 1) {
                        node = this.nodes[i];
                        if (node.nodeType !== 1) {
                            continue;
                        }
                        if (matches(node, selector)) {
                            query.push(node);
                        }
                        if (queryAllResult = node.querySelectorAll(selector)) {
                            numNodes = queryAllResult.length;
                            for (j = 0; j < numNodes; j += 1) {
                                query.push(queryAllResult[j]);
                            }
                        }
                    }
                } else if (this.items) {
                    len = this.items.length;
                    for (i = 0; i < len; i += 1) {
                        item = this.items[i];
                        if (item.findAll) {
                            item.findAll(selector, query);
                        }
                    }
                }
                return query;
            },
            findComponent: function (selector) {
                var len, i, item, queryResult;
                if (this.items) {
                    len = this.items.length;
                    for (i = 0; i < len; i += 1) {
                        item = this.items[i];
                        if (item.findComponent && (queryResult = item.findComponent(selector))) {
                            return queryResult;
                        }
                    }
                    return null;
                }
            },
            findAllComponents: function (selector, query) {
                var i, len, item;
                if (this.items) {
                    len = this.items.length;
                    for (i = 0; i < len; i += 1) {
                        item = this.items[i];
                        if (item.findAllComponents) {
                            item.findAllComponents(selector, query);
                        }
                    }
                }
                return query;
            }
        };
        circular.DomFragment = DomFragment;
        return DomFragment;
    }(config_types, utils_matches, render_shared_initFragment, render_DomFragment_shared_insertHtml, render_DomFragment_Text, render_DomFragment_Interpolator, render_DomFragment_Section__Section, render_DomFragment_Triple, render_DomFragment_Element__Element, render_DomFragment_Partial__Partial, render_DomFragment_Component__Component, render_DomFragment_Comment, circular);
var Ractive_prototype_render = function (getElement, makeTransitionManager, preDomUpdate, postDomUpdate, DomFragment) {
        
        return function (target, complete) {
            var transitionManager;
            if (!this._initing) {
                throw new Error('You cannot call ractive.render() directly!');
            }
            this._transitionManager = transitionManager = makeTransitionManager(this, complete);
            this.fragment = new DomFragment({
                descriptor: this.template,
                root: this,
                owner: this,
                pNode: target
            });
            preDomUpdate(this);
            if (target) {
                target.appendChild(this.fragment.docFrag);
            }
            postDomUpdate(this);
            this._transitionManager = null;
            transitionManager.ready();
            this.rendered = true;
        };
    }(utils_getElement, shared_makeTransitionManager, shared_preDomUpdate, shared_postDomUpdate, render_DomFragment__DomFragment);
var Ractive_prototype_renderHTML = function (warn) {
        
        return function () {
            warn('renderHTML() has been deprecated and will be removed in a future version. Please use toHTML() instead');
            return this.toHTML();
        };
    }(utils_warn);
var Ractive_prototype_toHTML = function () {
        
        return function () {
            return this.fragment.toString();
        };
    }();
var Ractive_prototype_teardown = function (makeTransitionManager, clearCache) {
        
        return function (complete) {
            var keypath, transitionManager, previousTransitionManager;
            this.fire('teardown');
            previousTransitionManager = this._transitionManager;
            this._transitionManager = transitionManager = makeTransitionManager(this, complete);
            this.fragment.teardown(true);
            while (this._animations[0]) {
                this._animations[0].stop();
            }
            for (keypath in this._cache) {
                clearCache(this, keypath);
            }
            this._transitionManager = previousTransitionManager;
            transitionManager.ready();
        };
    }(shared_makeTransitionManager, shared_clearCache);
var Ractive_prototype_shared_add = function (isNumeric) {
        
        return function (root, keypath, d) {
            var value;
            if (typeof keypath !== 'string' || !isNumeric(d)) {
                if (root.debug) {
                    throw new Error('Bad arguments');
                }
                return;
            }
            value = root.get(keypath);
            if (value === undefined) {
                value = 0;
            }
            if (!isNumeric(value)) {
                if (root.debug) {
                    throw new Error('Cannot add to a non-numeric value');
                }
                return;
            }
            root.set(keypath, value + d);
        };
    }(utils_isNumeric);
var Ractive_prototype_add = function (add) {
        
        return function (keypath, d) {
            add(this, keypath, d === undefined ? 1 : d);
        };
    }(Ractive_prototype_shared_add);
var Ractive_prototype_subtract = function (add) {
        
        return function (keypath, d) {
            add(this, keypath, d === undefined ? -1 : -d);
        };
    }(Ractive_prototype_shared_add);
var Ractive_prototype_toggle = function () {
        
        return function (keypath) {
            var value;
            if (typeof keypath !== 'string') {
                if (this.debug) {
                    throw new Error('Bad arguments');
                }
                return;
            }
            value = this.get(keypath);
            this.set(keypath, !value);
        };
    }();
var Ractive_prototype_merge_mapOldToNewIndex = function () {
        
        return function (oldArray, newArray) {
            var usedIndices, mapper, firstUnusedIndex, newIndices, changed;
            usedIndices = {};
            firstUnusedIndex = 0;
            mapper = function (item, i) {
                var index, start, len;
                start = firstUnusedIndex;
                len = newArray.length;
                do {
                    index = newArray.indexOf(item, start);
                    if (index === -1) {
                        changed = true;
                        return -1;
                    }
                    start = index + 1;
                } while (usedIndices[index] && start < len);
                if (index === firstUnusedIndex) {
                    firstUnusedIndex += 1;
                }
                if (index !== i) {
                    changed = true;
                }
                usedIndices[index] = true;
                return index;
            };
            newIndices = oldArray.map(mapper);
            newIndices.unchanged = !changed;
            return newIndices;
        };
    }();
var Ractive_prototype_merge_queueDependants = function (types) {
        
        return function queueDependants(keypath, deps, mergeQueue, updateQueue) {
            var i, dependant;
            i = deps.length;
            while (i--) {
                dependant = deps[i];
                if (dependant.type === types.REFERENCE) {
                    dependant.update();
                } else if (dependant.keypath === keypath && dependant.type === types.SECTION && !dependant.inverted && dependant.docFrag) {
                    mergeQueue[mergeQueue.length] = dependant;
                } else {
                    updateQueue[updateQueue.length] = dependant;
                }
            }
        };
    }(config_types);
var Ractive_prototype_merge__merge = function (warn, isArray, clearCache, preDomUpdate, processDeferredUpdates, makeTransitionManager, notifyDependants, replaceData, mapOldToNewIndex, queueDependants) {
        
        var identifiers = {};
        return function (keypath, array, options) {
            var currentArray, oldArray, newArray, identifier, lengthUnchanged, i, newIndices, mergeQueue, updateQueue, depsByKeypath, deps, transitionManager, previousTransitionManager, upstreamQueue, keys;
            currentArray = this.get(keypath);
            if (!isArray(currentArray) || !isArray(array)) {
                return this.set(keypath, array, options && options.complete);
            }
            lengthUnchanged = currentArray.length === array.length;
            if (options && options.compare) {
                if (options.compare === true) {
                    identifier = stringify;
                } else if (typeof options.compare === 'string') {
                    identifier = getIdentifier(options.compare);
                } else if (typeof options.compare == 'function') {
                    identifier = options.compare;
                } else {
                    throw new Error('The `compare` option must be a function, or a string representing an identifying field (or `true` to use JSON.stringify)');
                }
                try {
                    oldArray = currentArray.map(identifier);
                    newArray = array.map(identifier);
                } catch (err) {
                    if (this.debug) {
                        throw err;
                    } else {
                        warn('Merge operation: comparison failed. Falling back to identity checking');
                    }
                    oldArray = currentArray;
                    newArray = array;
                }
            } else {
                oldArray = currentArray;
                newArray = array;
            }
            newIndices = mapOldToNewIndex(oldArray, newArray);
            clearCache(this, keypath);
            replaceData(this, keypath, array);
            if (newIndices.unchanged && lengthUnchanged) {
                return;
            }
            previousTransitionManager = this._transitionManager;
            this._transitionManager = transitionManager = makeTransitionManager(this, options && options.complete);
            mergeQueue = [];
            updateQueue = [];
            for (i = 0; i < this._deps.length; i += 1) {
                depsByKeypath = this._deps[i];
                if (!depsByKeypath) {
                    continue;
                }
                deps = depsByKeypath[keypath];
                if (deps) {
                    queueDependants(keypath, deps, mergeQueue, updateQueue);
                    preDomUpdate(this);
                    while (mergeQueue.length) {
                        mergeQueue.pop().merge(newIndices);
                    }
                    while (updateQueue.length) {
                        updateQueue.pop().update();
                    }
                }
            }
            processDeferredUpdates(this);
            upstreamQueue = [];
            keys = keypath.split('.');
            while (keys.length) {
                keys.pop();
                upstreamQueue[upstreamQueue.length] = keys.join('.');
            }
            notifyDependants.multiple(this, upstreamQueue, true);
            if (oldArray.length !== newArray.length) {
                notifyDependants(this, keypath + '.length', true);
            }
            this._transitionManager = previousTransitionManager;
            transitionManager.ready();
        };
        function stringify(item) {
            return JSON.stringify(item);
        }
        function getIdentifier(str) {
            if (!identifiers[str]) {
                identifiers[str] = function (item) {
                    return item[str];
                };
            }
            return identifiers[str];
        }
    }(utils_warn, utils_isArray, shared_clearCache, shared_preDomUpdate, shared_processDeferredUpdates, shared_makeTransitionManager, shared_notifyDependants, Ractive_prototype_shared_replaceData, Ractive_prototype_merge_mapOldToNewIndex, Ractive_prototype_merge_queueDependants);
var Ractive_prototype_detach = function () {
        
        return function () {
            return this.fragment.detach();
        };
    }();
var Ractive_prototype_insert = function (getElement) {
        
        return function (target, anchor) {
            target = getElement(target);
            anchor = getElement(anchor) || null;
            if (!target) {
                throw new Error('You must specify a valid target to insert into');
            }
            target.insertBefore(this.detach(), anchor);
            this.fragment.pNode = target;
        };
    }(utils_getElement);
var Ractive_prototype__prototype = function (get, set, update, updateModel, animate, on, off, observe, fire, find, findAll, findComponent, findAllComponents, render, renderHTML, toHTML, teardown, add, subtract, toggle, merge, detach, insert) {
        
        return {
            get: get,
            set: set,
            update: update,
            updateModel: updateModel,
            animate: animate,
            on: on,
            off: off,
            observe: observe,
            fire: fire,
            find: find,
            findAll: findAll,
            findComponent: findComponent,
            findAllComponents: findAllComponents,
            renderHTML: renderHTML,
            toHTML: toHTML,
            render: render,
            teardown: teardown,
            add: add,
            subtract: subtract,
            toggle: toggle,
            merge: merge,
            detach: detach,
            insert: insert
        };
    }(Ractive_prototype_get__get, Ractive_prototype_set, Ractive_prototype_update, Ractive_prototype_updateModel, Ractive_prototype_animate__animate, Ractive_prototype_on, Ractive_prototype_off, Ractive_prototype_observe__observe, Ractive_prototype_fire, Ractive_prototype_find, Ractive_prototype_findAll, Ractive_prototype_findComponent, Ractive_prototype_findAllComponents, Ractive_prototype_render, Ractive_prototype_renderHTML, Ractive_prototype_toHTML, Ractive_prototype_teardown, Ractive_prototype_add, Ractive_prototype_subtract, Ractive_prototype_toggle, Ractive_prototype_merge__merge, Ractive_prototype_detach, Ractive_prototype_insert);
var extend_registries = function () {
        
        return [
            'partials',
            'transitions',
            'events',
            'components',
            'decorators',
            'data'
        ];
    }();
var extend_initOptions = function () {
        
        return [
            'el',
            'template',
            'complete',
            'modifyArrays',
            'magic',
            'twoway',
            'lazy',
            'append',
            'preserveWhitespace',
            'sanitize',
            'stripComments',
            'noIntro',
            'transitionsEnabled',
            'adaptors'
        ];
    }();
var extend_inheritFromParent = function (registries, initOptions, create) {
        
        return function (Child, Parent) {
            registries.forEach(function (property) {
                if (Parent[property]) {
                    Child[property] = create(Parent[property]);
                }
            });
            initOptions.forEach(function (property) {
                Child[property] = Parent[property];
            });
        };
    }(extend_registries, extend_initOptions, utils_create);
var extend_wrapMethod = function () {
        
        return function (method, superMethod) {
            if (/_super/.test(method)) {
                return function () {
                    var _super = this._super, result;
                    this._super = superMethod;
                    result = method.apply(this, arguments);
                    this._super = _super;
                    return result;
                };
            } else {
                return method;
            }
        };
    }();
var extend_utils_augment = function () {
        
        return function (target, source) {
            var key;
            for (key in source) {
                if (source.hasOwnProperty(key)) {
                    target[key] = source[key];
                }
            }
            return target;
        };
    }();
var extend_inheritFromChildProps = function (registries, initOptions, wrapMethod, augment) {
        
        var blacklist, blacklisted;
        blacklist = registries.concat(initOptions);
        blacklisted = {};
        blacklist.forEach(function (property) {
            blacklisted[property] = true;
        });
        return function (Child, childProps) {
            var key, member;
            registries.forEach(function (property) {
                var value = childProps[property];
                if (value) {
                    if (Child[property]) {
                        augment(Child[property], value);
                    } else {
                        Child[property] = value;
                    }
                }
            });
            initOptions.forEach(function (property) {
                var value = childProps[property];
                if (value !== undefined) {
                    if (typeof value === 'function' && typeof Child[property] === 'function') {
                        Child[property] = wrapMethod(value, Child[property]);
                    } else {
                        Child[property] = childProps[property];
                    }
                }
            });
            for (key in childProps) {
                if (childProps.hasOwnProperty(key) && !blacklisted[key]) {
                    member = childProps[key];
                    if (typeof member === 'function' && typeof Child.prototype[key] === 'function') {
                        Child.prototype[key] = wrapMethod(member, Child.prototype[key]);
                    } else {
                        Child.prototype[key] = member;
                    }
                }
            }
        };
    }(extend_registries, extend_initOptions, extend_wrapMethod, extend_utils_augment);
var extend_extractInlinePartials = function (isObject, augment) {
        
        return function (Child, childProps) {
            if (isObject(Child.template)) {
                if (!Child.partials) {
                    Child.partials = {};
                }
                augment(Child.partials, Child.template.partials);
                if (childProps.partials) {
                    augment(Child.partials, childProps.partials);
                }
                Child.template = Child.template.main;
            }
        };
    }(utils_isObject, extend_utils_augment);
var extend_conditionallyParseTemplate = function (errors, isClient, parse) {
        
        return function (Child) {
            var templateEl;
            if (typeof Child.template === 'string') {
                if (!parse) {
                    throw new Error(errors.missingParser);
                }
                if (Child.template.charAt(0) === '#' && isClient) {
                    templateEl = document.getElementById(Child.template.substring(1));
                    if (templateEl && templateEl.tagName === 'SCRIPT') {
                        Child.template = parse(templateEl.innerHTML, Child);
                    } else {
                        throw new Error('Could not find template element (' + Child.template + ')');
                    }
                } else {
                    Child.template = parse(Child.template, Child);
                }
            }
        };
    }(config_errors, config_isClient, parse__parse);
var extend_conditionallyParsePartials = function (errors, parse) {
        
        return function (Child) {
            var key;
            if (Child.partials) {
                for (key in Child.partials) {
                    if (Child.partials.hasOwnProperty(key) && typeof Child.partials[key] === 'string') {
                        if (!parse) {
                            throw new Error(errors.missingParser);
                        }
                        Child.partials[key] = parse(Child.partials[key], Child);
                    }
                }
            }
        };
    }(config_errors, parse__parse);
var extend_utils_clone = function () {
        
        return function (source) {
            var target = {}, key;
            for (key in source) {
                if (source.hasOwnProperty(key)) {
                    target[key] = source[key];
                }
            }
            return target;
        };
    }();
var utils_extend = function () {
        
        return function (target) {
            var prop, source, sources = Array.prototype.slice.call(arguments, 1);
            while (source = sources.shift()) {
                for (prop in source) {
                    if (source.hasOwnProperty(prop)) {
                        target[prop] = source[prop];
                    }
                }
            }
            return target;
        };
    }();
var Ractive_initialise = function (isClient, errors, warn, create, extend, defineProperty, defineProperties, getElement, isObject, magicAdaptor, parse) {
        
        var getObject, getArray, defaultOptions, registries;
        getObject = function () {
            return {};
        };
        getArray = function () {
            return [];
        };
        defaultOptions = create(null);
        defineProperties(defaultOptions, {
            preserveWhitespace: {
                enumerable: true,
                value: false
            },
            append: {
                enumerable: true,
                value: false
            },
            twoway: {
                enumerable: true,
                value: true
            },
            modifyArrays: {
                enumerable: true,
                value: true
            },
            data: {
                enumerable: true,
                value: getObject
            },
            lazy: {
                enumerable: true,
                value: false
            },
            debug: {
                enumerable: true,
                value: false
            },
            transitions: {
                enumerable: true,
                value: getObject
            },
            decorators: {
                enumerable: true,
                value: getObject
            },
            events: {
                enumerable: true,
                value: getObject
            },
            noIntro: {
                enumerable: true,
                value: false
            },
            transitionsEnabled: {
                enumerable: true,
                value: true
            },
            magic: {
                enumerable: true,
                value: false
            },
            adaptors: {
                enumerable: true,
                value: getArray
            }
        });
        registries = [
            'components',
            'decorators',
            'events',
            'partials',
            'transitions',
            'data'
        ];
        return function (ractive, options) {
            var key, template, templateEl, parsedTemplate;
            for (key in defaultOptions) {
                if (options[key] === undefined) {
                    options[key] = typeof defaultOptions[key] === 'function' ? defaultOptions[key]() : defaultOptions[key];
                }
            }
            defineProperties(ractive, {
                _initing: {
                    value: true,
                    writable: true
                },
                _guid: {
                    value: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                        var r, v;
                        r = Math.random() * 16 | 0;
                        v = c == 'x' ? r : r & 3 | 8;
                        return v.toString(16);
                    })
                },
                _subs: {
                    value: create(null),
                    configurable: true
                },
                _cache: { value: {} },
                _cacheMap: { value: create(null) },
                _deps: { value: [] },
                _depsMap: { value: create(null) },
                _patternObservers: { value: [] },
                _pendingResolution: { value: [] },
                _deferred: { value: {} },
                _evaluators: { value: create(null) },
                _twowayBindings: { value: {} },
                _transitionManager: {
                    value: null,
                    writable: true
                },
                _animations: { value: [] },
                nodes: { value: {} },
                _wrapped: { value: create(null) },
                _liveQueries: { value: [] },
                _liveComponentQueries: { value: [] }
            });
            defineProperties(ractive._deferred, {
                attrs: { value: [] },
                evals: { value: [] },
                selectValues: { value: [] },
                checkboxes: { value: [] },
                radios: { value: [] },
                observers: { value: [] },
                transitions: { value: [] },
                liveQueries: { value: [] },
                decorators: { value: [] },
                focusable: {
                    value: null,
                    writable: true
                }
            });
            ractive.adaptors = options.adaptors;
            ractive.modifyArrays = options.modifyArrays;
            ractive.magic = options.magic;
            ractive.twoway = options.twoway;
            ractive.lazy = options.lazy;
            ractive.debug = options.debug;
            if (ractive.magic && !magicAdaptor) {
                throw new Error('Getters and setters (magic mode) are not supported in this browser');
            }
            if (options._parent) {
                defineProperty(ractive, '_parent', { value: options._parent });
            }
            if (options.el) {
                ractive.el = getElement(options.el);
                if (!ractive.el && ractive.debug) {
                    throw new Error('Could not find container element');
                }
            }
            if (options.eventDefinitions) {
                warn('ractive.eventDefinitions has been deprecated in favour of ractive.events. Support will be removed in future versions');
                options.events = options.eventDefinitions;
            }
            registries.forEach(function (registry) {
                if (ractive.constructor[registry]) {
                    ractive[registry] = extend(create(ractive.constructor[registry] || {}), options[registry]);
                } else if (options[registry]) {
                    ractive[registry] = options[registry];
                }
            });
            template = options.template;
            if (typeof template === 'string') {
                if (!parse) {
                    throw new Error(errors.missingParser);
                }
                if (template.charAt(0) === '#' && isClient) {
                    templateEl = document.getElementById(template.substring(1));
                    if (templateEl) {
                        parsedTemplate = parse(templateEl.innerHTML, options);
                    } else {
                        throw new Error('Could not find template element (' + template + ')');
                    }
                } else {
                    parsedTemplate = parse(template, options);
                }
            } else {
                parsedTemplate = template;
            }
            if (isObject(parsedTemplate)) {
                extend(ractive.partials, parsedTemplate.partials);
                parsedTemplate = parsedTemplate.main;
            }
            if (parsedTemplate && parsedTemplate.length === 1 && typeof parsedTemplate[0] === 'string') {
                parsedTemplate = parsedTemplate[0];
            }
            ractive.template = parsedTemplate;
            extend(ractive.partials, options.partials);
            ractive.parseOptions = {
                preserveWhitespace: options.preserveWhitespace,
                sanitize: options.sanitize,
                stripComments: options.stripComments
            };
            ractive.transitionsEnabled = options.noIntro ? false : options.transitionsEnabled;
            if (isClient && !ractive.el) {
                ractive.el = document.createDocumentFragment();
            }
            if (ractive.el && !options.append) {
                ractive.el.innerHTML = '';
            }
            ractive.render(ractive.el, options.complete);
            ractive.transitionsEnabled = options.transitionsEnabled;
            ractive._initing = false;
        };
    }(config_isClient, config_errors, utils_warn, utils_create, utils_extend, utils_defineProperty, utils_defineProperties, utils_getElement, utils_isObject, Ractive_prototype_get_magicAdaptor, parse__parse);
var extend_initChildInstance = function (fillGaps, initOptions, clone, wrapMethod, initialise) {
        
        return function (child, Child, options) {
            initOptions.forEach(function (property) {
                var value = options[property], defaultValue = Child[property];
                if (typeof value === 'function' && typeof defaultValue === 'function') {
                    options[property] = wrapMethod(value, defaultValue);
                } else if (value === undefined && defaultValue !== undefined) {
                    options[property] = defaultValue;
                }
            });
            if (child.beforeInit) {
                child.beforeInit(options);
            }
            initialise(child, options);
            if (child.init) {
                child.init(options);
            }
        };
    }(utils_fillGaps, extend_initOptions, extend_utils_clone, extend_wrapMethod, Ractive_initialise);
var extend__extend = function (create, inheritFromParent, inheritFromChildProps, extractInlinePartials, conditionallyParseTemplate, conditionallyParsePartials, initChildInstance, circular) {
        
        var Ractive;
        circular.push(function () {
            Ractive = circular.Ractive;
        });
        return function (childProps) {
            var Parent = this, Child;
            Child = function (options) {
                initChildInstance(this, Child, options || {});
            };
            Child.prototype = create(Parent.prototype);
            Child.prototype.constructor = Child;
            inheritFromParent(Child, Parent);
            inheritFromChildProps(Child, childProps);
            conditionallyParseTemplate(Child);
            extractInlinePartials(Child, childProps);
            conditionallyParsePartials(Child);
            Child.extend = Parent.extend;
            return Child;
        };
    }(utils_create, extend_inheritFromParent, extend_inheritFromChildProps, extend_extractInlinePartials, extend_conditionallyParseTemplate, extend_conditionallyParsePartials, extend_initChildInstance, circular);
var Ractive__Ractive = function (svg, create, defineProperties, prototype, partialRegistry, adaptorRegistry, easingRegistry, Ractive_extend, parse, initialise, circular) {
        
        var Ractive = function (options) {
            initialise(this, options);
        };
        defineProperties(Ractive, {
            prototype: { value: prototype },
            partials: { value: partialRegistry },
            adaptors: { value: adaptorRegistry },
            easing: { value: easingRegistry },
            transitions: { value: {} },
            events: { value: {} },
            components: { value: {} },
            decorators: { value: {} },
            svg: { value: svg },
            VERSION: { value: '0.3.9' }
        });
        Ractive.eventDefinitions = Ractive.events;
        Ractive.prototype.constructor = Ractive;
        Ractive.delimiters = [
            '{{',
            '}}'
        ];
        Ractive.tripleDelimiters = [
            '{{{',
            '}}}'
        ];
        Ractive.extend = Ractive_extend;
        Ractive.parse = parse;
        circular.Ractive = Ractive;
        return Ractive;
    }(config_svg, utils_create, utils_defineProperties, Ractive_prototype__prototype, registries_partials, registries_adaptors, registries_easing, extend__extend, parse__parse, Ractive_initialise, circular);
var Ractive = function (Ractive, circular) {
        
        if (typeof window !== 'undefined' && window.Node && !window.Node.prototype.contains && window.HTMLElement && window.HTMLElement.prototype.contains) {
            window.Node.prototype.contains = window.HTMLElement.prototype.contains;
        }
        while (circular.length) {
            circular.pop()();
        }
        return Ractive;
    }(Ractive__Ractive, circular);
// export as Common JS module...
if ( typeof module !== "undefined" && module.exports ) {
	module.exports = Ractive;
}

// ... or as AMD module
else if ( typeof define === "function" && define.amd ) {
	define( function () {
		return Ractive;
	});
}

// ... or as browser global
else {
	global.Ractive = Ractive;
}

}( typeof window !== 'undefined' ? window : this ));
},{}],103:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":130}],104:[function(require,module,exports){

},{}],105:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],106:[function(require,module,exports){
var http = module.exports;
var EventEmitter = require('events').EventEmitter;
var Request = require('./lib/request');

http.request = function (params, cb) {
    if (!params) params = {};
    if (!params.host && !params.port) {
        params.port = parseInt(window.location.port, 10);
    }
    if (!params.host && params.hostname) {
        params.host = params.hostname;
    }
    
    if (!params.scheme) params.scheme = window.location.protocol.split(':')[0];
    if (!params.host) {
        params.host = window.location.hostname || window.location.host;
    }
    if (/:/.test(params.host)) {
        if (!params.port) {
            params.port = params.host.split(':')[1];
        }
        params.host = params.host.split(':')[0];
    }
    if (!params.port) params.port = params.scheme == 'https' ? 443 : 80;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

},{"./lib/request":107,"events":105}],107:[function(require,module,exports){
var Stream = require('stream');
var Response = require('./response');
var Base64 = require('Base64');
var inherits = require('inherits');

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.writable = true;
    self.xhr = xhr;
    self.body = [];
    
    self.uri = (params.scheme || 'http') + '://'
        + params.host
        + (params.port ? ':' + params.port : '')
        + (params.path || '/')
    ;
    
    try { xhr.withCredentials = true }
    catch (e) {}
    
    xhr.open(
        params.method || 'GET',
        self.uri,
        true
    );
    
    if (params.headers) {
        var keys = objectKeys(params.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!self.isSafeRequestHeader(key)) continue;
            var value = params.headers[key];
            if (isArray(value)) {
                for (var j = 0; j < value.length; j++) {
                    xhr.setRequestHeader(key, value[j]);
                }
            }
            else xhr.setRequestHeader(key, value)
        }
    }
    
    if (params.auth) {
        //basic auth
        this.setHeader('Authorization', 'Basic ' + Base64.btoa(params.auth));
    }

    var res = new Response;
    res.on('close', function () {
        self.emit('close');
    });
    
    res.on('ready', function () {
        self.emit('response', res);
    });
    
    xhr.onreadystatechange = function () {
        res.handle(xhr);
    };
};

inherits(Request, Stream);

Request.prototype.setHeader = function (key, value) {
    if (isArray(value)) {
        for (var i = 0; i < value.length; i++) {
            this.xhr.setRequestHeader(key, value[i]);
        }
    }
    else {
        this.xhr.setRequestHeader(key, value);
    }
};

Request.prototype.write = function (s) {
    this.body.push(s);
};

Request.prototype.destroy = function (s) {
    this.xhr.abort();
    this.emit('close');
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.body.push(s);
    if (this.body.length === 0) {
        this.xhr.send('');
    }
    else if (typeof this.body[0] === 'string') {
        this.xhr.send(this.body.join(''));
    }
    else if (isArray(this.body[0])) {
        var body = [];
        for (var i = 0; i < this.body.length; i++) {
            body.push.apply(body, this.body[i]);
        }
        this.xhr.send(body);
    }
    else if (/Array/.test(Object.prototype.toString.call(this.body[0]))) {
        var len = 0;
        for (var i = 0; i < this.body.length; i++) {
            len += this.body[i].length;
        }
        var body = new(this.body[0].constructor)(len);
        var k = 0;
        
        for (var i = 0; i < this.body.length; i++) {
            var b = this.body[i];
            for (var j = 0; j < b.length; j++) {
                body[k++] = b[j];
            }
        }
        this.xhr.send(body);
    }
    else {
        var body = '';
        for (var i = 0; i < this.body.length; i++) {
            body += this.body[i].toString();
        }
        this.xhr.send(body);
    }
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var indexOf = function (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
};

},{"./response":108,"Base64":109,"inherits":110,"stream":121}],108:[function(require,module,exports){
var Stream = require('stream');
var util = require('util');

var Response = module.exports = function (res) {
    this.offset = 0;
    this.readable = true;
};

util.inherits(Response, Stream);

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
            
                if (isArray(headers[key])) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getResponse = function (xhr) {
    var respType = String(xhr.responseType).toLowerCase();
    if (respType === 'blob') return xhr.responseBlob || xhr.response;
    if (respType === 'arraybuffer') return xhr.response;
    return xhr.responseText;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this._emitData(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this._emitData(res);
        
        if (res.error) {
            this.emit('error', this.getResponse(res));
        }
        else this.emit('end');
        
        this.emit('close');
    }
};

Response.prototype._emitData = function (res) {
    var respBody = this.getResponse(res);
    if (respBody.toString().match(/ArrayBuffer/)) {
        this.emit('data', new Uint8Array(respBody, this.offset));
        this.offset = respBody.byteLength;
        return;
    }
    if (respBody.length > this.offset) {
        this.emit('data', respBody.slice(this.offset));
        this.offset = respBody.length;
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

},{"stream":121,"util":130}],109:[function(require,module,exports){
;(function () {

  var object = typeof exports != 'undefined' ? exports : this; // #8: web workers
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function InvalidCharacterError(message) {
    this.message = message;
  }
  InvalidCharacterError.prototype = new Error;
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';

  // encoder
  // [https://gist.github.com/999166] by [https://github.com/nignag]
  object.btoa || (
  object.btoa = function (input) {
    for (
      // initialize result and counter
      var block, charCode, idx = 0, map = chars, output = '';
      // if the next input index does not exist:
      //   change the mapping table to "="
      //   check if d has no fractional digits
      input.charAt(idx | 0) || (map = '=', idx % 1);
      // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
      output += map.charAt(63 & block >> 8 - idx % 1 * 8)
    ) {
      charCode = input.charCodeAt(idx += 3/4);
      if (charCode > 0xFF) {
        throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  });

  // decoder
  // [https://gist.github.com/1020396] by [https://github.com/atk]
  object.atob || (
  object.atob = function (input) {
    input = input.replace(/=+$/, '')
    if (input.length % 4 == 1) {
      throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (
      // initialize result and counters
      var bc = 0, bs, buffer, idx = 0, output = '';
      // get next character
      buffer = input.charAt(idx++);
      // character found in table? initialize bit storage and add its ascii value;
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        // and if not first of each 4 characters,
        // convert the first 8 bits to one ascii character
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      // try to find character in table (0-63, not found => -1)
      buffer = chars.indexOf(buffer);
    }
    return output;
  });

}());

},{}],110:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],111:[function(require,module,exports){
require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"PcZj9L":[function(require,module,exports){
var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `browserSupport`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
var browserSupport = (function () {
   // Detect if browser supports Typed Arrays. Supported browsers are IE 10+,
   // Firefox 4+, Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+.
   if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined' ||
        typeof DataView === 'undefined')
      return false

  // Does the browser support adding properties to `Uint8Array` instances? If
  // not, then that's the same as no `Uint8Array` support. We need to be able to
  // add all the node Buffer API methods.
  // Relevant Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var arr = new Uint8Array(0)
    arr.foo = function () { return 42 }
    return 42 === arr.foo()
  } catch (e) {
    return false
  }
})()


/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // Assume object is an array
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (browserSupport) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = augment(new Uint8Array(length))
  } else {
    // Fallback: Return this instance of Buffer
    buf = this
    buf.length = length
  }

  var i
  if (Buffer.isBuffer(subject)) {
    // Speed optimization -- use set if we're copying from a Uint8Array
    buf.set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !browserSupport && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
      return true

    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return b && b._isBuffer
}

Buffer.byteLength = function (str, encoding) {
  switch (encoding || 'utf8') {
    case 'hex':
      return str.length / 2

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length

    case 'ascii':
    case 'binary':
      return str.length

    case 'base64':
      return base64ToBytes(str).length

    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) {
    throw new Error('Usage: Buffer.concat(list, [totalLength])\n' +
        'list should be an Array.')
  }

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
}

function _asciiWrite (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  switch (encoding) {
    case 'hex':
      return _hexWrite(this, string, offset, length)

    case 'utf8':
    case 'utf-8':
      return _utf8Write(this, string, offset, length)

    case 'ascii':
      return _asciiWrite(this, string, offset, length)

    case 'binary':
      return _binaryWrite(this, string, offset, length)

    case 'base64':
      return _base64Write(this, string, offset, length)

    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  switch (encoding) {
    case 'hex':
      return _hexSlice(self, start, end)

    case 'utf8':
    case 'utf-8':
      return _utf8Slice(self, start, end)

    case 'ascii':
      return _asciiSlice(self, start, end)

    case 'binary':
      return _binarySlice(self, start, end)

    case 'base64':
      return _base64Slice(self, start, end)

    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  if (end < start)
    throw new Error('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new Error('targetStart out of bounds')
  if (start < 0 || start >= source.length)
    throw new Error('sourceStart out of bounds')
  if (end < 0 || end > source.length)
    throw new Error('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  // copy!
  for (var i = 0; i < end - start; i++)
    target[i + target_start] = this[i + start]
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

// TODO: add test that modifying the new buffer slice will modify memory in the
// original buffer! Use code from:
// http://nodejs.org/api/buffer.html#buffer_buf_slice_start_end
Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (browserSupport) {
    return augment(this.subarray(start, end))
  } else {
    // TODO: slicing works, with limitations (no parent tracking/update)
    // https://github.com/feross/native-buffer-browserify/issues/9
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'Trying to read beyond buffer length')
  }

  if (offset >= buf.length)
    return

  return buf[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 < len) {
      return buf._dataview.getUint16(offset, littleEndian)
    } else {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setUint8(0, buf[len - 1])
      return dv.getUint16(0, littleEndian)
    }
  } else {
    var val
    if (littleEndian) {
      val = buf[offset]
      if (offset + 1 < len)
        val |= buf[offset + 1] << 8
    } else {
      val = buf[offset] << 8
      if (offset + 1 < len)
        val |= buf[offset + 1]
    }
    return val
  }
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 < len) {
      return buf._dataview.getUint32(offset, littleEndian)
    } else {
      var dv = new DataView(new ArrayBuffer(4))
      for (var i = 0; i + offset < len; i++) {
        dv.setUint8(i, buf[i + offset])
      }
      return dv.getUint32(0, littleEndian)
    }
  } else {
    var val
    if (littleEndian) {
      if (offset + 2 < len)
        val = buf[offset + 2] << 16
      if (offset + 1 < len)
        val |= buf[offset + 1] << 8
      val |= buf[offset]
      if (offset + 3 < len)
        val = val + (buf[offset + 3] << 24 >>> 0)
    } else {
      if (offset + 1 < len)
        val = buf[offset + 1] << 16
      if (offset + 2 < len)
        val |= buf[offset + 2] << 8
      if (offset + 3 < len)
        val |= buf[offset + 3]
      val = val + (buf[offset] << 24 >>> 0)
    }
    return val
  }
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < buf.length, 'Trying to read beyond buffer length')
  }

  if (offset >= buf.length)
    return

  if (browserSupport) {
    return buf._dataview.getInt8(offset)
  } else {
    var neg = buf[offset] & 0x80
    if (neg)
      return (0xff - buf[offset] + 1) * -1
    else
      return buf[offset]
  }
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 === len) {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setUint8(0, buf[len - 1])
      return dv.getInt16(0, littleEndian)
    } else {
      return buf._dataview.getInt16(offset, littleEndian)
    }
  } else {
    var val = _readUInt16(buf, offset, littleEndian, true)
    var neg = val & 0x8000
    if (neg)
      return (0xffff - val + 1) * -1
    else
      return val
  }
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      for (var i = 0; i + offset < len; i++) {
        dv.setUint8(i, buf[i + offset])
      }
      return dv.getInt32(0, littleEndian)
    } else {
      return buf._dataview.getInt32(offset, littleEndian)
    }
  } else {
    var val = _readUInt32(buf, offset, littleEndian, true)
    var neg = val & 0x80000000
    if (neg)
      return (0xffffffff - val + 1) * -1
    else
      return val
  }
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  if (browserSupport) {
    return buf._dataview.getFloat32(offset, littleEndian)
  } else {
    return ieee754.read(buf, offset, littleEndian, 23, 4)
  }
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  if (browserSupport) {
    return buf._dataview.getFloat64(offset, littleEndian)
  } else {
    return ieee754.read(buf, offset, littleEndian, 52, 8)
  }
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= buf.length) return

  buf[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 === len) {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setUint16(0, value, littleEndian)
      buf[offset] = dv.getUint8(0)
    } else {
      buf._dataview.setUint16(offset, value, littleEndian)
    }
  } else {
    for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
      buf[offset + i] =
          (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
              (littleEndian ? i : 1 - i) * 8
    }
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  var i
  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      dv.setUint32(0, value, littleEndian)
      for (i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setUint32(offset, value, littleEndian)
    }
  } else {
    for (i = 0, j = Math.min(len - offset, 4); i < j; i++) {
      buf[offset + i] =
          (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
    }
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= buf.length)
    return

  if (browserSupport) {
    buf._dataview.setInt8(offset, value)
  } else {
    if (value >= 0)
      buf.writeUInt8(value, offset, noAssert)
    else
      buf.writeUInt8(0xff + value + 1, offset, noAssert)
  }
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 === len) {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setInt16(0, value, littleEndian)
      buf[offset] = dv.getUint8(0)
    } else {
      buf._dataview.setInt16(offset, value, littleEndian)
    }
  } else {
    if (value >= 0)
      _writeUInt16(buf, value, offset, littleEndian, noAssert)
    else
      _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  }
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      dv.setInt32(0, value, littleEndian)
      for (var i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setInt32(offset, value, littleEndian)
    }
  } else {
    if (value >= 0)
      _writeUInt32(buf, value, offset, littleEndian, noAssert)
    else
      _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  }
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      dv.setFloat32(0, value, littleEndian)
      for (var i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setFloat32(offset, value, littleEndian)
    }
  } else {
    ieee754.write(buf, value, offset, littleEndian, 23, 4)
  }
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 7 >= len) {
      var dv = new DataView(new ArrayBuffer(8))
      dv.setFloat64(0, value, littleEndian)
      for (var i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setFloat64(offset, value, littleEndian)
    }
  } else {
    ieee754.write(buf, value, offset, littleEndian, 52, 8)
  }
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('value is not a number')
  }

  if (end < start) throw new Error('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds')
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds')
  }

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Not added to Buffer.prototype since it should only
 * be available in browsers that support ArrayBuffer.
 */
function BufferToArrayBuffer () {
  return (new Buffer(this)).buffer
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

function augment (arr) {
  arr._isBuffer = true

  // Augment the Uint8Array *instance* (not the class!) with Buffer methods
  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BufferToArrayBuffer

  if (arr.byteLength !== 0)
    arr._dataview = new DataView(arr.buffer, arr.byteOffset, arr.byteLength)

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value >= 0,
      'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":3,"ieee754":4}],"native-buffer-browserify":[function(require,module,exports){
module.exports=require('PcZj9L');
},{}],3:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = indexOf(b64, '=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (indexOf(lookup, b64.charAt(i)) << 18) | (indexOf(lookup, b64.charAt(i + 1)) << 12) | (indexOf(lookup, b64.charAt(i + 2)) << 6) | indexOf(lookup, b64.charAt(i + 3));
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (indexOf(lookup, b64.charAt(i)) << 2) | (indexOf(lookup, b64.charAt(i + 1)) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (indexOf(lookup, b64.charAt(i)) << 10) | (indexOf(lookup, b64.charAt(i + 1)) << 4) | (indexOf(lookup, b64.charAt(i + 2)) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup.charAt(num >> 18 & 0x3F) + lookup.charAt(num >> 12 & 0x3F) + lookup.charAt(num >> 6 & 0x3F) + lookup.charAt(num & 0x3F);
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup.charAt(temp >> 2);
				output += lookup.charAt((temp << 4) & 0x3F);
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup.charAt(temp >> 10);
				output += lookup.charAt((temp >> 4) & 0x3F);
				output += lookup.charAt((temp << 2) & 0x3F);
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

function indexOf (arr, elt /*, from*/) {
	var len = arr.length;

	var from = Number(arguments[1]) || 0;
	from = (from < 0)
		? Math.ceil(from)
		: Math.floor(from);
	if (from < 0)
		from += len;

	for (; from < len; from++) {
		if ((typeof arr === 'string' && arr.charAt(from) === elt) ||
				(typeof arr !== 'string' && arr[from] === elt)) {
			return from;
		}
	}
	return -1;
}

},{}],4:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}]},{},[])
;;module.exports=require("native-buffer-browserify").Buffer

},{}],112:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],113:[function(require,module,exports){
var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
   // Detect if browser supports Typed Arrays. Supported browsers are IE 10+,
   // Firefox 4+, Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+.
   if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined')
      return false

  // Does the browser support adding properties to `Uint8Array` instances? If
  // not, then that's the same as no `Uint8Array` support. We need to be able to
  // add all the node Buffer API methods.
  // Relevant Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var arr = new Uint8Array(0)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // Assume object is an array
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = augment(new Uint8Array(length))
  } else {
    // Fallback: Return this instance of Buffer
    buf = this
    buf.length = length
  }

  var i
  if (Buffer.isBuffer(subject)) {
    // Speed optimization -- use set if we're copying from a Uint8Array
    buf.set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return b && b._isBuffer
}

Buffer.byteLength = function (str, encoding) {
  switch (encoding || 'utf8') {
    case 'hex':
      return str.length / 2
    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length
    case 'ascii':
    case 'binary':
      return str.length
    case 'base64':
      return base64ToBytes(str).length
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
}

function _asciiWrite (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  switch (encoding) {
    case 'hex':
      return _hexWrite(this, string, offset, length)
    case 'utf8':
    case 'utf-8':
      return _utf8Write(this, string, offset, length)
    case 'ascii':
      return _asciiWrite(this, string, offset, length)
    case 'binary':
      return _binaryWrite(this, string, offset, length)
    case 'base64':
      return _base64Write(this, string, offset, length)
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  switch (encoding) {
    case 'hex':
      return _hexSlice(self, start, end)
    case 'utf8':
    case 'utf-8':
      return _utf8Slice(self, start, end)
    case 'ascii':
      return _asciiSlice(self, start, end)
    case 'binary':
      return _binarySlice(self, start, end)
    case 'base64':
      return _base64Slice(self, start, end)
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  // copy!
  for (var i = 0; i < end - start; i++)
    target[i + target_start] = this[i + start]
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

// http://nodejs.org/api/buffer.html#buffer_buf_slice_start_end
Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'Trying to read beyond buffer length')
  }

  if (offset >= buf.length)
    return

  return buf[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < buf.length, 'Trying to read beyond buffer length')
  }

  if (offset >= buf.length)
    return

  var neg = buf[offset] & 0x80
  if (neg)
    return (0xff - buf[offset] + 1) * -1
  else
    return buf[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= buf.length) return

  buf[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= buf.length)
    return

  if (value >= 0)
    buf.writeUInt8(value, offset, noAssert)
  else
    buf.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Not added to Buffer.prototype since it should only
 * be available in browsers that support ArrayBuffer.
 */
function BufferToArrayBuffer () {
  return (new Buffer(this)).buffer
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

function augment (arr) {
  arr._isBuffer = true

  // Augment the Uint8Array *instance* (not the class!) with Buffer methods
  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BufferToArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value >= 0,
      'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":114,"ieee754":115}],114:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if(code === PLUS)
			return 62 // '+'
		if(code === SLASH)
			return 63 // '/'
		if(code < NUMBER)
			return -1 //no match
		if(code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if(code < UPPER + 26)
			return code - UPPER
		if(code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;

		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars



		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3));
			push((tmp & 0xFF0000) >> 16);
			push((tmp & 0xFF00) >> 8);
			push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4);
			push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2);
			push((tmp >> 8) & 0xFF);
			push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F);
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += encode(temp >> 2);
				output += encode((temp << 4) & 0x3F);
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += encode(temp >> 10);
				output += encode((temp >> 4) & 0x3F);
				output += encode((temp << 2) & 0x3F);
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());


},{}],115:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],116:[function(require,module,exports){
var global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};/*! http://mths.be/punycode v1.2.3 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    length,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.3',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define(function() {
			return punycode;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

},{}],117:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],118:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],119:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":117,"./encode":118}],120:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;
var inherits = require('inherits');
var setImmediate = require('process/browser.js').nextTick;
var Readable = require('./readable.js');
var Writable = require('./writable.js');

inherits(Duplex, Readable);

Duplex.prototype.write = Writable.prototype.write;
Duplex.prototype.end = Writable.prototype.end;
Duplex.prototype._write = Writable.prototype._write;

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  var self = this;
  setImmediate(function () {
    self.end();
  });
}

},{"./readable.js":124,"./writable.js":126,"inherits":110,"process/browser.js":122}],121:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('./readable.js');
Stream.Writable = require('./writable.js');
Stream.Duplex = require('./duplex.js');
Stream.Transform = require('./transform.js');
Stream.PassThrough = require('./passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"./duplex.js":120,"./passthrough.js":123,"./readable.js":124,"./transform.js":125,"./writable.js":126,"events":105,"inherits":110}],122:[function(require,module,exports){
module.exports=require(112)
},{}],123:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./transform.js');
var inherits = require('inherits');
inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./transform.js":125,"inherits":110}],124:[function(require,module,exports){
var process=require("__browserify_process");// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;
Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;
var Stream = require('./index.js');
var Buffer = require('buffer').Buffer;
var setImmediate = require('process/browser.js').nextTick;
var StringDecoder;

var inherits = require('inherits');
inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    setImmediate(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    setImmediate(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    setImmediate(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  // check for listeners before emit removes one-time listeners.
  var errListeners = EE.listenerCount(dest, 'error');
  function onerror(er) {
    unpipe();
    if (errListeners === 0 && EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  dest.once('error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    setImmediate(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      setImmediate(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, function (x) {
      return self.emit.apply(self, ev, x);
    });
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    setImmediate(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

},{"./index.js":121,"__browserify_process":112,"buffer":113,"events":105,"inherits":110,"process/browser.js":122,"string_decoder":127}],125:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./duplex.js');
var inherits = require('inherits');
inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./duplex.js":120,"inherits":110}],126:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;
Writable.WritableState = WritableState;

var isUint8Array = typeof Uint8Array !== 'undefined'
  ? function (x) { return x instanceof Uint8Array }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'Uint8Array'
  }
;
var isArrayBuffer = typeof ArrayBuffer !== 'undefined'
  ? function (x) { return x instanceof ArrayBuffer }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'ArrayBuffer'
  }
;

var inherits = require('inherits');
var Stream = require('./index.js');
var setImmediate = require('process/browser.js').nextTick;
var Buffer = require('buffer').Buffer;

inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];
}

function Writable(options) {
  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Stream.Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  setImmediate(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    setImmediate(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isUint8Array(chunk))
    chunk = new Buffer(chunk);
  if (isArrayBuffer(chunk) && typeof Uint8Array !== 'undefined')
    chunk = new Buffer(new Uint8Array(chunk));
  
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  state.needDrain = !ret;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    setImmediate(function() {
      cb(er);
    });
  else
    cb(er);

  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      setImmediate(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      setImmediate(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

},{"./index.js":121,"buffer":113,"inherits":110,"process/browser.js":122}],127:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

function assertEncoding(encoding) {
  if (encoding && !Buffer.isEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  this.charBuffer = new Buffer(6);
  this.charReceived = 0;
  this.charLength = 0;
};


StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  var offset = 0;

  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, offset, i);
    this.charReceived += (i - offset);
    offset = i;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (i == buffer.length) return charStr;

    // otherwise cut off the characters end from the beginning of this buffer
    buffer = buffer.slice(i, buffer.length);
    break;
  }

  var lenIncomplete = this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
    this.charReceived = lenIncomplete;
    end -= lenIncomplete;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }

  return i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 2;
  this.charLength = incomplete ? 2 : 0;
  return incomplete;
}

function base64DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 3;
  this.charLength = incomplete ? 3 : 0;
  return incomplete;
}

},{"buffer":113}],128:[function(require,module,exports){
/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '~', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(delims),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#']
      .concat(unwise).concat(autoEscape),
    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always have a path component.
    pathedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof(url) === 'object' && url.href) return url;

  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var out = {},
      rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    out.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      out.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    // don't enforce full RFC correctness, just be unstupid about it.

    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the first @ sign, unless some non-auth character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    var atSign = rest.indexOf('@');
    if (atSign !== -1) {
      var auth = rest.slice(0, atSign);

      // there *may be* an auth
      var hasAuth = true;
      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
        if (auth.indexOf(nonAuthChars[i]) !== -1) {
          // not a valid auth.  Something like http://foo.com/bar@baz/
          hasAuth = false;
          break;
        }
      }

      if (hasAuth) {
        // pluck off the auth portion.
        out.auth = decodeURIComponent(auth);
        rest = rest.substr(atSign + 1);
      }
    }

    var firstNonHost = -1;
    for (var i = 0, l = nonHostChars.length; i < l; i++) {
      var index = rest.indexOf(nonHostChars[i]);
      if (index !== -1 &&
          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
    }

    if (firstNonHost !== -1) {
      out.host = rest.substr(0, firstNonHost);
      rest = rest.substr(firstNonHost);
    } else {
      out.host = rest;
      rest = '';
    }

    // pull out port.
    var p = parseHost(out.host);
    var keys = Object.keys(p);
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      out[key] = p[key];
    }

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    out.hostname = out.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = out.hostname[0] === '[' &&
        out.hostname[out.hostname.length - 1] === ']';

    // validate a little.
    if (out.hostname.length > hostnameMaxLen) {
      out.hostname = '';
    } else if (!ipv6Hostname) {
      var hostparts = out.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            out.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    // hostnames are always lower case.
    out.hostname = out.hostname.toLowerCase();

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = out.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      out.hostname = newOut.join('.');
    }

    out.host = (out.hostname || '') +
        ((out.port) ? ':' + out.port : '');
    out.href += out.host;

    // strip [ and ] from the hostname
    if (ipv6Hostname) {
      out.hostname = out.hostname.substr(1, out.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    out.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    out.search = rest.substr(qm);
    out.query = rest.substr(qm + 1);
    if (parseQueryString) {
      out.query = querystring.parse(out.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    out.search = '';
    out.query = {};
  }
  if (rest) out.pathname = rest;
  if (slashedProtocol[proto] &&
      out.hostname && !out.pathname) {
    out.pathname = '/';
  }

  //to support http.request
  if (out.pathname || out.search) {
    out.path = (out.pathname ? out.pathname : '') +
               (out.search ? out.search : '');
  }

  // finally, reconstruct the href based on what has been validated.
  out.href = urlFormat(out);
  return out;
}

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof(obj) === 'string') obj = urlParse(obj);

  var auth = obj.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = obj.protocol || '',
      pathname = obj.pathname || '',
      hash = obj.hash || '',
      host = false,
      query = '';

  if (obj.host !== undefined) {
    host = auth + obj.host;
  } else if (obj.hostname !== undefined) {
    host = auth + (obj.hostname.indexOf(':') === -1 ?
        obj.hostname :
        '[' + obj.hostname + ']');
    if (obj.port) {
      host += ':' + obj.port;
    }
  }

  if (obj.query && typeof obj.query === 'object' &&
      Object.keys(obj.query).length) {
    query = querystring.stringify(obj.query);
  }

  var search = obj.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (obj.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  return protocol + host + pathname + search + hash;
}

function urlResolve(source, relative) {
  return urlFormat(urlResolveObject(source, relative));
}

function urlResolveObject(source, relative) {
  if (!source) return relative;

  source = urlParse(urlFormat(source), false, true);
  relative = urlParse(urlFormat(relative), false, true);

  // hash is always overridden, no matter what.
  source.hash = relative.hash;

  if (relative.href === '') {
    source.href = urlFormat(source);
    return source;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    relative.protocol = source.protocol;
    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[relative.protocol] &&
        relative.hostname && !relative.pathname) {
      relative.path = relative.pathname = '/';
    }
    relative.href = urlFormat(relative);
    return relative;
  }

  if (relative.protocol && relative.protocol !== source.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      relative.href = urlFormat(relative);
      return relative;
    }
    source.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      relative.pathname = relPath.join('/');
    }
    source.pathname = relative.pathname;
    source.search = relative.search;
    source.query = relative.query;
    source.host = relative.host || '';
    source.auth = relative.auth;
    source.hostname = relative.hostname || relative.host;
    source.port = relative.port;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.slashes = source.slashes || relative.slashes;
    source.href = urlFormat(source);
    return source;
  }

  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host !== undefined ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (source.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = source.pathname && source.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = source.protocol &&
          !slashedProtocol[source.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // source.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {

    delete source.hostname;
    delete source.port;
    if (source.host) {
      if (srcPath[0] === '') srcPath[0] = source.host;
      else srcPath.unshift(source.host);
    }
    delete source.host;
    if (relative.protocol) {
      delete relative.hostname;
      delete relative.port;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      delete relative.host;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    source.host = (relative.host || relative.host === '') ?
                      relative.host : source.host;
    source.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : source.hostname;
    source.search = relative.search;
    source.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    source.search = relative.search;
    source.query = relative.query;
  } else if ('search' in relative) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      source.hostname = source.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = source.host && source.host.indexOf('@') > 0 ?
                       source.host.split('@') : false;
      if (authInHost) {
        source.auth = authInHost.shift();
        source.host = source.hostname = authInHost.shift();
      }
    }
    source.search = relative.search;
    source.query = relative.query;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.href = urlFormat(source);
    return source;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    delete source.pathname;
    //to support http.request
    if (!source.search) {
      source.path = '/' + source.search;
    } else {
      delete source.path;
    }
    source.href = urlFormat(source);
    return source;
  }
  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (source.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    source.hostname = source.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = source.host && source.host.indexOf('@') > 0 ?
                     source.host.split('@') : false;
    if (authInHost) {
      source.auth = authInHost.shift();
      source.host = source.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  source.pathname = srcPath.join('/');
  //to support request.http
  if (source.pathname !== undefined || source.search !== undefined) {
    source.path = (source.pathname ? source.pathname : '') +
                  (source.search ? source.search : '');
  }
  source.auth = relative.auth || source.auth;
  source.slashes = source.slashes || relative.slashes;
  source.href = urlFormat(source);
  return source;
}

function parseHost(host) {
  var out = {};
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      out.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) out.hostname = host;
  return out;
}

}());

},{"punycode":116,"querystring":119}],129:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],130:[function(require,module,exports){
var process=require("__browserify_process"),global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"./support/isBuffer":129,"__browserify_process":112,"inherits":110}]},{},[3])