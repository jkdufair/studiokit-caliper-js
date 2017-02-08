var options = {
	// sensorId: "https://example.edu/sensor",
	// sensorOptions: {
	// 	hostname: 'eventstore.example.edu',
	// 	port: '443',
	// 	path: '/events',
	// 	method: 'POST'
	// },
	sendInterval: 5000
};

module.exports = {
	default: options,
	validate: function(options, label) {
		label = label || 'options';
		if (typeof options === 'undefined' || !options) {
			throw new Error('`' + label + '` is required');
		}
		if (typeof options.sensorId === 'undefined' || !options.sensorId) {
			throw new Error('`' + label + '.sensorId` is required');
		}
		if (typeof options.sensorOptions === 'undefined' || !options.sensorOptions) {
			throw new Error('`' + label + '.sensorOptions` is required');
		}
	}
};
