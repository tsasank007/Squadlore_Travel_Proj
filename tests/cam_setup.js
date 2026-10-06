// Fake camera hardware + canvas for jsdom (which has neither).
// Returns { setup(window), state } - state records every stream/track the app opens.
module.exports = function makeCamEnv(opts = {}) {
  const state = { calls: [], streams: [], pending: null };
  function setup(w) {
    const mkStream = () => {
      const track = { stopped: false, stop() { this.stopped = true; } };
      const stream = { getTracks: () => [track], track };
      state.streams.push(stream);
      return stream;
    };
    if (!opts.noMediaDevices) {
      Object.defineProperty(w.navigator, "mediaDevices", { configurable: true, value: {
        getUserMedia: constraints => {
          state.calls.push(constraints);
          if (opts.reject) return Promise.reject(Object.assign(new Error("denied"), { name: opts.reject }));
          if (opts.deferred) return new Promise(res => { state.pending = () => res(mkStream()); });
          return Promise.resolve(mkStream());
        } } });
    }
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperty(w.HTMLVideoElement.prototype, "videoWidth", { get: () => 1280 });
    Object.defineProperty(w.HTMLVideoElement.prototype, "videoHeight", { get: () => 720 });
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob(["jpegbytes"], { type: "image/jpeg" })); };
    w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
    if (opts.setup) opts.setup(w);
  }
  return { setup, state };
};
