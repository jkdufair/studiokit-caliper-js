const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-things'));
chai.use(chaiAsPromised);
const expect = chai.expect;
chai.should();
const _ = require('lodash');
const CaliperService = require('./caliper-service');

describe('CaliperService', function() {
	it('throws error for missing options constructor parameter', function() {
		expect(() => new CaliperService()).to.throw(Error);
		expect(() => new CaliperService(null)).to.throw(Error);
	});
	it('can instantiate with valid options', function() {
		const store = {};
		const options = {
			sensorId: 'https://app.example.edu/sensor',
			sensorOptions: {
				protocol: 'http:',
				hostname: 'localhost',
				port: '3001',
				path: '/collector',
				method: 'POST'
			},
			appId: 'https://app.example.edu',
			appName: 'Example App',
			getToken: function() {},
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
		expect(() => new CaliperService(options)).to.not.throw(Error);
	});
});
