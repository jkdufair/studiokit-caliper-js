const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-things'));
chai.use(chaiAsPromised);
const expect = chai.expect;
chai.should();
const _ = require('lodash');
const CaliperService = require('./caliper-service');
const moment = require('moment');

function getOptions(store) {
	store = store || {};
	return {
		sensorId: 'https://app.example.edu/sensor',
		sensorOptions: {
			protocol: 'https:',
			hostname: 'localhost',
			port: '3001',
			path: '/collector',
			method: 'POST'
		},
		appId: 'https://app.example.edu',
		appName: 'Example App',
		getToken: function() {
			return new Promise(function(resolve, reject){
				resolve({
					accessToken: 'THIS_IS_NOT_A_REAL_ACCESS_TOKEN',
					expires: 'Thu, 09 Feb 2017 06:08:58 GMT'
				});
			});
		},
		storageService: {
			getItem: function(key) {
				return store[key];
			},
			setItem: function(key, value) {
				store[key] = value;
			},
			removeItem: function(key) {
				delete store[key]
			}
		}
	};
}

describe('CaliperService', function() {
	describe('ctor', function(){
		it('requires options parameter', function() {
			expect(() => new CaliperService()).to.throw(Error);
			expect(() => new CaliperService(null)).to.throw(Error);
		});
		it('succeeds with valid options', function() {
			expect(() => new CaliperService(getOptions())).to.not.throw(Error);
		});
	});
	describe('validateOptions', function() {
		it('requires sensorId, type string', function() {
			var options = getOptions();
			options.sensorId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires sensorOptions, plain object', function() {
			var options = getOptions();
			options.sensorOptions = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.sensorOptions;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appId, type string', function() {
			var options = getOptions();
			options.appId = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appId;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires appName, type string', function() {
			var options = getOptions();
			options.appName = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.appName;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires getToken, type function', function() {
			var options = getOptions();
			options.getToken = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.getToken;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService, type object', function() {
			var options = getOptions();
			options.storageService = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			delete options.storageService;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.getItem, type function', function() {
			var options = getOptions();
			options.storageService = {};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService = {
				getItem: 1
			};
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.setItem, type function', function() {
			var options = getOptions();
			options.storageService = {
				getItem: function() {}
			};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService.setItem = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('requires storageService.removeItem, type function', function() {
			var options = getOptions();
			options.storageService = {
				getItem: function() {},
				setItem: function() {}
			};
			expect(() => new CaliperService(options)).to.throw(Error);
			options.storageService.removeItem = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('autoSend, type boolean', function() {
			var options = getOptions();
			options.autoSend = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sendInterval, type number', function() {
			var options = getOptions();
			options.sendInterval = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionIriPrefix, type string, not empty', function() {
			var options = getOptions();
			options.sessionIriPrefix = 1;
			expect(() => new CaliperService(options)).to.throw(Error);
			options.sessionIriPrefix = '';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('autoKeepAliveSession, type boolean', function() {
			var options = getOptions();
			options.autoKeepAliveSession = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionPauseThreshold, type number', function() {
			var options = getOptions();
			options.sessionKeepAliveInterval = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('sessionPauseThreshold, type number', function() {
			var options = getOptions();
			options.sessionPauseThreshold = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
		it('onError, type function', function() {
			var options = getOptions();
			options.onError = 'string';
			expect(() => new CaliperService(options)).to.throw(Error);
		});
	});
	describe('saved Session', function() {
		it('succeeds with recently paused Session', function() {
			expect(() => {
				var store = {};
				store['studioKit:caliperService:person'] = {};
				store['studioKit:caliperService:session'] = {};
				store['studioKit:caliperService:sessionPauseDate'] = moment().toISOString();
				new CaliperService(getOptions(store));
			}).to.not.throw(Error);
		});
		it('succeeds with old paused Session', function() {
			expect(() => {
				var store = {};
				store['studioKit:caliperService:person'] = {};
				store['studioKit:caliperService:session'] = {};
				store['studioKit:caliperService:sessionPauseDate'] = moment().subtract(2, 'minutes').toISOString();
				new CaliperService(getOptions(store));
			}).to.not.throw(Error);
		});
	});
});
