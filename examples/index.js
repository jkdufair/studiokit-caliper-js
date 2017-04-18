var StudioKit = require('../');

var sensorId =  "https://app.example.edu/sensor";
var sensorOptions = {
	protocol: 'https:',
	hostname: 'localhost',
	port: '3001',
	path: '/collector',
	method: 'POST'
};

var token = {
	accessToken: 'THIS_IS_NOT_A_REAL_ACCESS_TOKEN', //response.data['access_token'],
	expires: 'Thu, 09 Feb 2017 06:08:58 GMT' //response.data['.expires']
};

// e.g. fetch (React), $http.get() (Angular 1)
var getToken = function() {
	return new Promise(function(resolve, reject){
		resolve(token);
	});
};

// e.g. localStorage
var store = {};
var storageService = {
	getItem: function(key) {
		return store[key];
	},
	setItem: function(key, value) {
		store[key] = value;
	},
	removeItem: function(key) {
		delete store[key]
	}
};

var options = {
	sensorId: sensorId,
	sensorOptions: sensorOptions,
	appId: 'https://app.example.edu',
	appName: 'Example App',
	getToken: getToken,
	storageService: storageService
};

var caliperService = new StudioKit.CaliperService(options);
caliperService.setPerson('https://example.edu/user/1', 'Some', 'Guy');
caliperService.startSession();
setTimeout(function() {
	caliperService.endSession();
	caliperService.send()
		.then(function(result) {
			console.log('success', result);
		})
		.catch(function(err) {
			console.error(err);
		});
//}, 1000 * 60 * 60);
}, 1000 * 3);
