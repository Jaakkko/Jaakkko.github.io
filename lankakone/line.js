  importScripts(
    './opencv.js',
    'https://cdn.jsdelivr.net/gh/nicolaspanel/numjs@0.15.1/dist/numjs.min.js'
  )

self.onmessage = async (event) => {
  await new Promise((resolve) => cv['onRuntimeInitialized'] = resolve)

  console.log('hello from worker')
  const { pixels } = event.data

  let IMG_SIZE = 500;
  let MAX_LINES = event.data.MAX_LINES;// 4000;
  let N_PINS = event.data.N_PINS;
  let MIN_LOOP = 20;
  let MIN_DISTANCE = 20;
  let LINE_WEIGHT = 20;
  let SCALE = 20;
  let HOOP_DIAMETER = 0.625;

  let length;
  var R = {};

  //pre initilization
  let pin_coords;
  let center;
  let radius;

  let line_cache_y;
  let line_cache_x;
  let line_cache_length;
  let line_cache_weight;

  //line variables
  let error;
  let result;
  let line_mask;

  let line_sequence;
  let pin;
  let thread_length;
  let last_pins;

  length = IMG_SIZE;

  let accumulated_line_sequence = []

  // make grayscale by averaging the RGB channels.
  // extract out the R channel because that's all we need and push graysacle image onto canvas
  R = img_result = nj.ones([IMG_SIZE, IMG_SIZE]).multiply(0xff);
  console.log(pixels.width, pixels.height, IMG_SIZE)
  var rdata = [];
  for (var y = 0; y < pixels.height; y++) {
    for (var x = 0; x < pixels.width; x++) {
      var i = (y * 4) * pixels.width + x * 4;
      rdata.push(pixels.data[i]);
    }
  }
  R.selection.data = rdata;

  // set up necessary variables
  console.log("Calculating pins...");
  self.postMessage({ accumulated_line_sequence, status: "Calculating pins..." })
  pin_coords = [];
  center = length / 2;
  radius = length / 2 - 1 / 2
  for (let i = 0; i < N_PINS; i++) {
    angle = 2 * Math.PI * i / N_PINS;
    pin_coords.push([Math.floor(center + radius * Math.cos(angle)),
    Math.floor(center + radius * Math.sin(angle))]);
  }

  // set up necessary variables
  console.log("Precalculating all lines...");
  self.postMessage({ accumulated_line_sequence, status: "Precalculating all lines..." })
  line_cache_y = new Array(N_PINS * N_PINS).fill(undefined);
  line_cache_x = new Array(N_PINS * N_PINS).fill(undefined);
  line_cache_length = new Array(N_PINS * N_PINS).fill(0)
  line_cache_weight = new Array(N_PINS * N_PINS).fill(1)
  for (let a = 0; a < N_PINS; a++) {
    for (b = a + MIN_DISTANCE; b < N_PINS; b++) {
      x0 = pin_coords[a][0];
      y0 = pin_coords[a][1];

      x1 = pin_coords[b][0];
      y1 = pin_coords[b][1];

      d = Math.floor(Number(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0))));
      xs = linspace(x0, x1, d);
      ys = linspace(y0, y1, d);

      line_cache_y[b * N_PINS + a] = ys;
      line_cache_y[a * N_PINS + b] = ys;
      line_cache_x[b * N_PINS + a] = xs;
      line_cache_x[a * N_PINS + b] = xs;
      line_cache_length[b * N_PINS + a] = d;
      line_cache_length[a * N_PINS + b] = d;
    }
  }

  // set up necessary variables
  console.log("Drawing Lines...");
  self.postMessage({ accumulated_line_sequence, status: "Setting up variables", progress: 0 })
  error = nj.ones([IMG_SIZE, IMG_SIZE]).multiply(0xff).subtract(nj.uint8(R.selection.data).reshape(IMG_SIZE, IMG_SIZE));
  img_result = nj.ones([IMG_SIZE, IMG_SIZE]).multiply(0xff);
  result = nj.ones([IMG_SIZE * SCALE, IMG_SIZE * SCALE]).multiply(0xff);
  result = new cv.matFromArray(IMG_SIZE * SCALE, IMG_SIZE * SCALE, cv.CV_8UC1, result.selection.data);
  line_mask = nj.zeros([IMG_SIZE, IMG_SIZE], 'float64');
  self.postMessage({ accumulated_line_sequence, status: "Processing 0 %", progress: 0 })

  line_sequence = [];
  let last_notified = Date.now()
  line_sequence.push = function() {
    Array.prototype.push.apply(accumulated_line_sequence, arguments)
    return Array.prototype.push.apply(this, arguments)
  }
  pin = 0;
  line_sequence.push(pin);
  thread_length = 0;
  last_pins = [];
  for (let l = 0; l < MAX_LINES; l++) {
    max_err = -1;
    best_pin = -1;

    for (offset = MIN_DISTANCE; offset < N_PINS - MIN_DISTANCE; offset++) {
      test_pin = (pin + offset) % N_PINS;
      if (last_pins.includes(test_pin)) {
        continue;
      } else {
        xs = line_cache_x[test_pin * N_PINS + pin];
        ys = line_cache_y[test_pin * N_PINS + pin];

        line_err = getLineErr(error, ys, xs) * line_cache_weight[test_pin * N_PINS + pin];

        if (line_err > max_err) {
          max_err = line_err;
          best_pin = test_pin;
        }
      }
    }

    line_sequence.push(best_pin);
    const now = Date.now()
    if (last_notified + 1000 < now) {
      last_notified = now
      const progress = Math.round(100 * (line_sequence.length - 1) / MAX_LINES)
      self.postMessage({ status: `Computing ${progress} %`, accumulated_line_sequence, progress })
      accumulated_line_sequence = []
    }
    console.log(`${line_sequence.length} / ${MAX_LINES}`)

    xs = line_cache_x[best_pin * N_PINS + pin];
    ys = line_cache_y[best_pin * N_PINS + pin];
    weight = LINE_WEIGHT * line_cache_weight[best_pin * N_PINS + pin];

    line_mask = nj.zeros([IMG_SIZE, IMG_SIZE], 'float64');
    line_mask = setLine(line_mask, ys, xs, weight);
    error = subtractArrays(error, line_mask);



    p = new cv.Point(pin_coords[pin][0] * SCALE, pin_coords[pin][1] * SCALE);
    p2 = new cv.Point(pin_coords[best_pin][0] * SCALE, pin_coords[best_pin][1] * SCALE);
    cv.line(result, p, p2, new cv.Scalar(0, 0, 0), 2, cv.LINE_AA, 0);

    x0 = pin_coords[pin][0];
    y0 = pin_coords[pin][1];

    x1 = pin_coords[best_pin][0];
    y1 = pin_coords[best_pin][1];

    dist = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    thread_length += HOOP_DIAMETER / length * dist;

    last_pins.push(best_pin);
    if (last_pins.length > 20) {
      last_pins.shift();
    }
    pin = best_pin;
  }

  // pinsOutput.value = line_sequence;
  result.delete();
  self.postMessage({ status: 'Done', accumulated_line_sequence, progress: 100 })



  function getLineErr(arr, coords1, coords2) {
    let result = new Uint8Array(coords1.length);
    for (i = 0; i < coords1.length; i++) {
      result[i] = arr.get(coords1[i], coords2[i]);
    }
    return getSum(result);
  }

  function setLine(arr, coords1, coords2, line) {
    for (i = 0; i < coords1.length; i++) {
      arr.set(coords1[i], coords2[i], line);
    }
    return arr;
  }
  function subtractArrays(arr1, arr2) {
    for (i = 0; i < arr1.selection.data.length; i++) {
      arr1.selection.data[i] = arr1.selection.data[i] - arr2.selection.data[i]
      if (arr1.selection.data[i] < 0) {
        arr1.selection.data[i] = 0;
      } else if (arr1.selection.data[i] > 255) {
        arr1.selection.data[i] = 255;
      }
    }
    return arr1;
  }

  function getSum(arr) {
    let v = 0;
    for (i = 0; i < arr.length; i++) {
      v = v + arr[i];
    }
    return v;
  }
  function linspace(a, b, n) {
    if (typeof n === "undefined") n = Math.max(Math.round(b - a) + 1, 1);
    if (n < 2) { return n === 1 ? [a] : []; }
    var i, ret = Array(n);
    n--;
    for (i = n; i >= 0; i--) { ret[i] = Math.floor((i * b + (n - i) * a) / n); }
    return ret;
  }
}