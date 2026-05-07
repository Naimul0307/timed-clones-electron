const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("leapMotion", {
  start(callback) {
    const ws = new WebSocket("ws://127.0.0.1:6437/v6.json");

    ws.onopen = () => {
      console.log("Leap Motion WebSocket connected");

      ws.send(JSON.stringify({
        enableGestures: true
      }));
    };

    ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);

      if (!frame.hands || frame.hands.length === 0) return;

      const hand = frame.hands[0];

      callback({
        palmX: hand.palmPosition[0],
        palmY: hand.palmPosition[1],
        palmZ: hand.palmPosition[2],
        pinch: hand.pinchStrength || 0,
        grab: hand.grabStrength || 0,
        fingers: frame.pointables ? frame.pointables.length : 0
      });
    };

    ws.onerror = (err) => {
      console.error("Leap Motion WebSocket error:", err);
    };

    ws.onclose = () => {
      console.log("Leap Motion WebSocket closed");
    };
  }
});