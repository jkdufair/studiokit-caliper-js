var Caliper = require('./caliper-js-public');
var CaliperService = require('./lib/caliper-service');

var options = {
	sensorId: "https://example.edu/sensor",
	sensorOptions: {
		hostname: 'eventstore.example.edu',
		port: '443',
		path: '/events',
		method: 'POST'
	},
	sendInterval: 5000
};

// e.g. fetch(), $http.get()
var getToken = function() {
	return new Promise(function(resolve, reject){
		resolve();
	});
};

// e.g. localStorage
var store = {};
var storageService = {
	get: function(key) {
		return store[key];
	},
	set: function(key, value) {
		store[key] = value;
	},
	remove: function(key) {
		delete store[key];
	}
};

var caliperService = new CaliperService(options, getToken, storageService);
caliperService.setSoftwareApplication('https://example.edu/sensor', 'Example');
caliperService.setPerson('https://example.edu/user/1', 'Some', 'Guy');
caliperService.startSession();

module.exports = CaliperService;
