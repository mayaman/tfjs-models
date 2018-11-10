'use strict';

let newModel;
let recognizer;
let activations = [];
let labels = [];

function save() {
  const activationsJson = activations.map(activation => {
    return {
      shape: activation.shape,
      values: Array.from(activation.dataSync())
    }
  });
  sessionStorage.setItem('activations', JSON.stringify(activationsJson));
  sessionStorage.setItem('labels', JSON.stringify(labels));
  console.log(`Saved ${activations.length} activations.`);
}
function load() {
  const activationsJson = JSON.parse(sessionStorage.getItem('activations'));
  activations = activationsJson.map(activationJson => {
    return tf.tensor(activationJson.values, activationJson.shape);
  });
  labels = JSON.parse(sessionStorage.getItem('labels'));
  console.log(`Loaded ${activations.length} activations.`);
}


function collect(label) {
  if (label == null) {
    return recognizer.stopStreaming();
  }
  recognizer.startStreaming(example => {
    activations.push(example.embedding);
    labels.push(label);
  }, {overlapFactor: 0.95, includeEmbedding: true});
}

function toggleButtons(enable) {
  document.querySelectorAll('button').forEach(b => b.disabled = !enable);
}

async function train() {
  toggleButtons(false);
  let start = performance.now();
  const ys = tf.oneHot(labels, 3);
  ys.dataSync();
  console.log('oneHot took', performance.now() - start);

  start = performance.now();
  const xs = tf.concat(activations);
  xs.dataSync();
  console.log('concat took', performance.now() - start);

  console.log('done data prep');
  await newModel.fit(xs, ys, {
    batchSize: 10,
    epochs: 15,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(epoch, logs.loss.toFixed(3));
      }
    }
  });
  tf.dispose([xs, ys]);
  toggleButtons(true);
}

let delta = 0.1;

async function moveSlider(labelTensor) {
  const label = (await labelTensor.data())[0];
  const prevValue = +document.getElementById('output').value;
  if (label == 2) {
    return;
  }
  document.getElementById('output').value =
      prevValue + delta * (label === 0 ? 1 : -1);
}

function listen() {
  if (recognizer.isStreaming()) {
    recognizer.stopStreaming();
    toggleButtons(true);
    document.getElementById('listen').textContent = 'Listen';
    return;
  }
  toggleButtons(false);
  document.getElementById('listen').textContent = 'Stop';
  document.getElementById('listen').disabled = false;


  recognizer.startStreaming(async result => {
    const probs = newModel.predict(result.embedding);
    const predLabel = probs.argMax(1);
    await moveSlider(predLabel);
    tf.dispose([result, probs, predLabel]);
  }, {overlapFactor: 0.95, includeEmbedding: true});
}

async function app() {
  console.log('Loading speech commands...')
  // Load the model.
  recognizer = speechCommands.create('BROWSER_FFT');
  await recognizer.ensureModelLoaded();
  // Warmup.
  await recognizer.recognize(null, {includeEmbedding: true});
  console.log('Sucessfully loaded model');
  // load();

  // Setup the UI.
  document.getElementById('up').onmousedown = () => collect(0);
  document.getElementById('up').onmouseup = () => collect(null);

  document.getElementById('down').onmousedown = () => collect(1);
  document.getElementById('down').onmouseup = () => collect(null);

  document.getElementById('noise').onmousedown = () => collect(2);
  document.getElementById('noise').onmouseup = () => collect(null);

  document.getElementById('train').onmousedown = () => train();
  document.getElementById('listen').onmouseup = () => listen();

  // Create a new model.
  newModel = tf.sequential();
  newModel.add(
      tf.layers.dense({units: 3, inputShape: [2000], activation: 'softmax'}));
  const optimizer = tf.train.sgd(0.1);
  newModel.compile({optimizer, loss: 'categoricalCrossentropy'});
  // Warmup the new model.
  tf.tidy(() => newModel.predict(tf.zeros([1, 2000])));
}

app();
