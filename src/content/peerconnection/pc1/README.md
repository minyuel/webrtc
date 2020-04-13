# Audio Video Synchronization Metric Prototype Demo
Shows a basic example of how to estimate delay between audio and video tracks
in WebRTC.

This works on Chrome M84 (Canary and Dev channel currently).

Run example with any HTTP server. For e.g. assuming python 2.7:
```
python -m SimpleHTTPServer 8123
```

Go to `localhost:8123` (note localhost as you need secure context to request
`getUserMedia`) and press `Start` and `Call` buttons. You should be able to see
no delay between audio and video. Then press `Delay Audio By 2 Seconds`, 2
seconds delay between audio and video should gradually appear.



