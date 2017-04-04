# studiokit-caliper-js

studiokit-caliper-js is a common library of services for implementing applications with the caliper-js Javascript client for [Caliper](http://www.imsglobal.org/caliper) (an implementation of the Caliper SensorAPI™).

## Features

* Events saved to a queue that is persisted to localStorage
* Convenience methods to start and end Session
* Session keep-alive update, using a change to `dateModified`, sent on an time interval
* Session end automatically tracked using `window.onbeforeunload`

## Installation

```
npm install --save studiokit-caliper-js
```

## Options

## Implementation

## Build for use without Node

```
npm run build
```

This will create a browserified file in the `dist` folder.
