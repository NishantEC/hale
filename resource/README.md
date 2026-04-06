# Whoomp

[![whoomp demo video](https://img.youtube.com/vi/wjk0XNbbfKQ/0.jpg)](https://www.youtube.com/watch?v=wjk0XNbbfKQ)

WHOOP 4.0 strap reverse engineering. [Whoomp! There It Is](https://www.youtube.com/watch?v=Z-FPimCmbX8)

## Website

Live at [https://jogolden.github.io/whoomp/](https://jogolden.github.io/whoomp/) !!

This uses the [Web Bluetooth API which](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) is not supported on some browsers.
Most of the interesting functionality is in the `whoop.js` module. This connects, setups event handlers, and implements commands.

## Scripts

Before I started on the website, I created some python scripts. My process was basically reverse engineer Android app, get latest firmware, extract firmware, analyze firmware, rebuild everything in python using the bleak library.
- `whoop.py` basic cli interface for dealing with the whoop
- `packet.py` packet structure class and enums
- `parser.py` this will parse the historical data packets
- `plot.py` this can plot historical data dumps
- `hrv.py` this will do some hrv analysis on historical data dumps

## Future + Contributions

I am looking for people to help expand this project. I promise to not be strict and accept pull requests!

Where can you help?
```
- Heart rate analysis, clean up data
- HRV analysis, frequency and time domain, give a score
- Look at whats happening during sleep
- More graphs!
- Add 'time' labels and navigation on GUI
- Parse historical data on website
- Create an efficient and standard format for historical data
- Load historical data into the website
```
Any other ideas? Create an issue!

TODO: document firmware, update format, extraction, analysis of binaries, hardware schematic, battery pack updater, etc.
