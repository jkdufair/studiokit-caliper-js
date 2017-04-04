# studiokit-caliper-js

studiokit-caliper-js provides an extra layer of convenience and functionality for implementing the caliper-js Javascript client for [Caliper](http://www.imsglobal.org/caliper) that provides an implementation of the Caliper SensorAPI™.

## Features

* Saves events to a queue that is persisted to localStorage
* Convenience methods to start and end Session
* Session keep-alive update, using a change to `dateModified`, sent on an time interval

## Installation

```
npm install --save studiokit-caliper-js
```

## Build for use without Node

```
npm run build
```

This will create a browserified file in the `dist` folder.
