# studiokit-caliper-js

**studiokit-caliper-js** is a common library of services for implementing applications with the [caliper-js](https://github.com/purdue-tlt/caliper-js) Javascript client for [IMS Global Caliper Analytics](http://www.imsglobal.org/caliper) (an implementation of the Caliper SensorAPI™).

**studiokit-caliper-js** current supports **Caliper v1.0**

## Features

* **Persistent Queue**: Events and Entities are saved to a queue that is persisted to localStorage, or another storage method of your choice.
* **Convenience Methods**: Easily start and end Sessions with simplified methods.
* **Session Keep-Alive**: The current Session's `dateModified` is periodically updated and sent to the EventStore to track Session activity before it is ended.
* **Session End**: Sessions are ended automatically when the user is idle (no mouse, touch, keyboard, scroll events) or away from the app for longer than the `sessionEndThreshold`. 

## Installation

```
npm install --save studiokit-caliper-js
```

## Implementation

### With Node

```
const StudioKit = require('studiokit-caliper-js');
// or
import StudioKit from 'studiokit-caliper-js';

const options = {...}; // see below
const caliperService = new StudioKit.CaliperService(options);
```

### Without Node

```
npm run build
```

This will create a browserified file in the `dist` folder.
Add this script to your HTML file like `<script src="dist/studiokit-caliper.js"></script>`.
You can then access the JavaScript global parameter `StudioKit`.

## Options

| name |  required | type | description | default value |
| --- | --- | --- | --- | --- |
| sensorId | **true** | string | The caliper-js Sensor Id |  |
| sensorOptions | **true** | Object | The caliper-js Sensor Options [see the node https docs](https://nodejs.org/api/https.html#https_https_request_options_callback) |  |
| appId | **true** | string (IRI) | The JSON-LD `@id` of the Caliper SoftwareApplication | |
| appName | **true** | string | The name of Caliper SoftwareApplication | |
| getToken | **true** | function | A function that is expected to return a `Promise`, which when complete, returns an OAuth Access Token response containing the following properties: <ul><li>`accessToken`: the OAuth token for the EventStore</li><li>`expires`: A date string representing when the token expires.</li></ul> | |
| storageService | **true** | Object | An object (or service) that provides data persistence, acting as a key-value store, e.g. LocalStorage. Must implement the following methods: <ul><li>`function getItem(key)`: return a saved object by key.</li><li>`function setItem(key, value)`: save an object by key.</li><li>`function removeItem(key)`: remove an object by key.</li></ul> | An in-memory placeholder, does not actually persist data. |
| autoSend | false | boolean | Whether or not to send the queue of Caliper events on a timer. | true |
| sendInterval | false | number (milliseconds) | How often a request containing the current queue of Caliper events is sent, enabled by `autoSend`. | `1000 * 10` // 10 seconds |
| sessionIriPrefix | false | string | The value with which to prefix all Caliper Session `@id` values. Will be prefixed to form valid IRI, e.g. `${sessionIriPrefix}/session/${uuid}` | `null`, defaults to `appId` |
| sessionEndThreshold | false | number (milliseconds) | The amount of time a Session can be idle (e.g. no mouse, keyboard, touch, or scroll events) before the Session is ended. | `1000 * 60 * 30` // 30 minutes |
| sessionKeepAliveThreshold | false | number (milliseconds) | How often the "keep alive" request will be sent. | `1000 * 60 * 15`  // 15 minutes |
| onError | false | function | A function that is called when an error is encountered, e.g. `function(err) {}` | `console.error(err)` |
