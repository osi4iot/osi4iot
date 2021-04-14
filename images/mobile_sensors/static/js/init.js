var calcular = 0;
var ver_resultados = 1;
var estado = 0;
var IsReaded = 0;
var IsReading = 0;
var Total_reading_time = 20; //seconds
var Sampling_freq = 25; //samples/sec
var Initial_Transient_time = 5; //seconds
var totaTimeReadead=0.0;
var deltaT;
var Nyquist_freq;
var t_vec = [];
var az_vec = [];
var f_vec = [];
var Az_vec = [];
var client = {};
var currAccel = [0.0, 0.0, 0.0];

var body_list = ["#bodyCalculator", "#bodyGraph", "#bodyAbout"];
window.addEventListener("resize", function () {
  if (IsReaded) draw();
});

window.addEventListener('devicemotion', function(event) {
  currAccel[0] = event.acceleration.x;
  currAccel[1] = event.acceleration.y;
  currAccel[2] = event.acceleration.y;
});

function ActiveBody(body_curr) {
  for (ibody = 0; ibody < body_list.length; ibody++) {
    if (body_list[ibody] == body_curr) $(body_list[ibody]).show();
    else $(body_list[ibody]).hide();
  }
}

function load() {
  ActiveBody("#bodyCalculator");
  
  // Create a client instance
  //client = new Paho.MQTT.Client(location.hostname, Number(location.port), "clientId");
  const hostname = window && window.location && window.location.hostname;
  const port = 9001;
  const clientId = "clientId_" + Math.floor(Math.random() * 1000);
  client = new Paho.MQTT.Client(hostname, port, clientId);

  // set callback handlers
  client.onConnectionLost = onConnectionLost;
  client.onMessageArrived = onMessageArrived;

  // // connect the client
  client.connect({
    useSSL: true,
    timeout: 3,
    //cleanSession : false,
    onSuccess: onConnect
  });
}

// called when the client connects
function onConnect() {
  // Once a connection has been made, make a subscription and send a message.
  console.log("onConnect");
  BotonConectado();
}

// called when the client loses its connection
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0) {
    console.log("onConnectionLost:"+responseObject.errorMessage);
  }
  BotonDesconectado();
}

// called when a message arrives
function onMessageArrived(message) {
  console.log("onMessageArrived:"+message.payloadString);
}

function Volver() {
  ActiveBody("#bodyCalculator");
}

function CancelPreferences() {
  ActiveBody("#bodyCalculator");
}

function ConfigList() {
  document.getElementById("ConfigListMenu").classList.toggle("show");
}

//Close the dropdown if the user clicks outside of it
window.onclick = function (event) {
  var no_event_target_match = true;
  if (event.target.matches('#btnConfig')) no_event_target_match = false;;
  if (no_event_target_match) {
    var dropdowns = document.getElementsByClassName("dropdown-content");
    var i;
    for (i = 0; i < dropdowns.length; i++) {
      var openDropdown = dropdowns[i];
      if (openDropdown.classList.contains('show')) {
        openDropdown.classList.remove('show');
      }
    }
  }
}

function ChangeColorButton() {
  if (IsReaded) {
    estado = (estado == calcular ? ver_resultados : calcular);
    var button_id = document.getElementById('btnReadings');
    var color = "#E69500";
    var valor = "Read accelerations";
    if (estado == ver_resultados) {
      color = "#3ADF00";
      valor = "View plots"
    }
    button_id.style.backgroundColor = color;
    button_id.innerHTML = valor;
  }
}

function BotonConectado() {
  var button_id = document.getElementById('btnReadings');
  var color = "#80ced6";
  button_id.style.backgroundColor = color;
}

function BotonDesconectado() {
  var button_id = document.getElementById('btnReadings');
  var color = "#E69500";
  button_id.style.backgroundColor = color;
}



function BotonCalculando() {
  var button_id = document.getElementById('btnReadings');
  var color = "#FF0000";
  var valor = "Reading...";
  button_id.style.backgroundColor = color;
  button_id.innerHTML = valor;
}

function ChangeState(elem) {
  if (isNaN(elem.value)) {
    alert("Error: Solo se admiten números.");
    elem.value = elem.value.replace(/[^0-9.]+/, '');
    return;
  }
  ChangeColorButton();
  $("#samplesReaded").hide();
  $("#totalTime").hide();
  var elemMyBar = document.getElementById("myBar");
  elemMyBar.innerHTML = '0%';
  elemMyBar.style.width = '0%';
  IsReaded = 0;
}

function Read_Manager() {
  $(document).ready(function () {
    if (!IsReading) {
      if (!IsReaded) {

        var mySelecTiempo_total = document.getElementById('reading_time');
        Total_reading_time = parseFloat(mySelecTiempo_total.value);

        var mySelecSampling_freq = document.getElementById('sampling_freq');
        Sampling_freq = parseFloat(mySelecSampling_freq.value);

        deltaT = 1.0 / Sampling_freq;
        Nyquist_freq = 0.5 * Sampling_freq;

        var mySelecTransient_time = document.getElementById('transient_time');
        Initial_Transient_time = parseFloat(mySelecTransient_time.value);
        if (Initial_Transient_time > Total_reading_time) {
          alert("Initial transient time can not be greater than the total reading time!!!");
          return;
        }

        ReadAccelerations();

      } else {
        ActiveBody("#bodyGraph");
        Draw();
      }
    }
  });
}


function ReadAccelerations() {
  var readings_cont = 0;
  var total_readings = parseInt(Total_reading_time / deltaT);
  var number_initial_readings = parseInt(Initial_Transient_time / deltaT);
  var t0 = 0.0;
  var startTime, endTime;
  t_vec = [];
  az_vec = [];
  $("#myProgress").show();
  var elemMyBar = document.getElementById("myBar");


  //sensor = new LinearAccelerationSensor({ frequency: Sampling_freq, referenceFrame: "device" });
  sensor = new Accelerometer({ frequency: Sampling_freq, referenceFrame: "device" });
  sensor.start();
  sensor.onreading = function () {
    if (readings_cont <= total_readings) {
      BotonCalculando();
      IsReading = 1;
      var width = parseInt(readings_cont * 100 / total_readings);
      elemMyBar.style.width = width + '%';
      elemMyBar.innerHTML = width * 1 + '%';

      if (readings_cont == number_initial_readings) {
        t0 = sensor.timestamp;
      }
      if (readings_cont >= number_initial_readings) {
        t_vec[t_vec.length] = (sensor.timestamp - t0) / 1000;
        //az_vec[az_vec.length] = sensor.z;
        az_vec_value = sensor.z - 9.81;
        az_vec[az_vec.length] = az_vec_value;

        const payload = { ax: currAccel[0], ay: currAccel[1], az: az_vec_value };
        message = new Paho.MQTT.Message(JSON.stringify(payload));
        message.destinationName = "IOT_Demos/accelerations";
        client.send(message);
      }
      readings_cont++;
    } else {
      totaTimeReadead = t_vec[t_vec.length - 1];
      sensor.stop();
      var N = t_vec.length;
      if (N % 2 != 0) {
        N = N - 1;
        az_vec.pop();
        t_vec.pop();
      }
      if (N >= 2) {
        var az_mean=0;
        for (var i = 0; i < N; i++) {
          az_mean += az_vec[i];
        }
        az_mean = az_mean / N;
        for (var i = 0; i < N; i++) {
          az_vec[i] = az_vec[i] - az_mean;
        }
        var img_vec = new Array(N);
        img_vec.fill(0.0);
        var z = (new numeric.T(az_vec, img_vec)).fft();
        var Delta_f = 1.0 / (N * deltaT);
        var N_half = N / 2;
        f_vec = [];
        Az_vec = [];
        for (var i = 0; i <= N_half; i++) {
          f_vec[f_vec.length] = Delta_f * i;
          Az_vec[Az_vec.length] = Math.sqrt(z.x[i] * z.x[i] + z.y[i] * z.y[i]);
        }
      }
      IsReaded = 1;
      IsReading = 0;
      ChangeColorButton();
      $("#myProgress").hide();
      var samplesReaded_div = document.getElementById('samplesReaded');
      $(samplesReaded_div).show();
      var text = "Num. samples readed: " + (readings_cont-1);
      samplesReaded_div.innerHTML = text;
      var totalTime_div = document.getElementById('totalTime');
      $(totalTime_div).show();
      var totalTimeText = "Total time readed: " + totaTimeReadead.toFixed(4) + " seg"
      totalTime_div.innerHTML = totalTimeText;
    }
  };
}


function Draw() {
  try {
    // evaluate the expression repeatedly for different values of
    var az_max = -10000;
    var az_min = 10000;
    var Tiempo_total = t_vec[t_vec.length - 1];
    for (var i = 0; i < t_vec.length; i++) {
      if (az_vec[i] > az_max) az_max = az_vec[i];
      if (az_vec[i] < az_min) az_min = az_vec[i];
    }

    var dtick_x = parseInt(Tiempo_total / 10.0);
    if (dtick_x < 1) dtick_x = 1;
    var dtick_y = parseInt((az_max - az_max) / 10.0);
    az_max *= 1.05;
    az_min *= 0.95;

    // render the plot using plotly
    const trace1 = {
      x: t_vec,
      y: az_vec,
      type: 'scatter'
    }

    var layout1 = {
      xaxis: {
        range: [0.0, Tiempo_total],
        title: 'Tiempo [s]',
        titlefont: {
          family: 'Arial, sans-serif',
          size: 15,
          color: 'black',
        },
        showgrid: 'True',
        zeroline: 'True',
        showline: 'True',
        mirror: 'ticks',
        dtick: dtick_x,
        gridcolor: '#bdbdbd',
        gridwidth: 1,
        zerolinecolor: '#969696',
        zerolinewidth: 2,
        linecolor: '#636363',
        linewidth: 2,
      },
      yaxis: {
        range: [az_min, az_max],
        title: 'az [m/s^2]',
        titlefont: {
          family: 'Arial, sans-serif',
          size: 15,
          color: 'black',
        },
        showgrid: 'True',
        zeroline: 'True',
        showline: 'True',
        mirror: 'ticks',
        dtick: dtick_y,
        gridcolor: '#bdbdbd',
        gridwidth: 1,
        zerolinecolor: '#969696',
        zerolinewidth: 2,
        linecolor: '#636363',
        linewidth: 2,
      },
      legend: {
        y: 0.5,
        yref: 'paper',
        font: {
          family: 'Arial, sans-serif',
          size: 18,
          color: 'black',
        }
      },
      paper_bgcolor: "#F6E3CE",
      title: 'FFT acceleration in z direction',
      titlefont: {
        family: 'Arial, sans-serif',
        size: 18,
        color: 'black',
      },
      margin: {
        l: 55,
        r: 15
      }
    };

    const data1 = [trace1];
    Plotly.newPlot('plot', data1, layout1, {responsive: true});

    var Az_max = -10000;
    var Az_min = 0.0;
    var Max_freq = f_vec[f_vec.length - 1];
    var imax = -1;
    for (var i = 0; i < f_vec.length; i++) {
      if (Az_vec[i] > Az_max) {
        Az_max = Az_vec[i];
        imax = i;
      }
    }
    dtick_x = parseInt(Max_freq / 10.0);
    if (dtick_x < 1) dtick_x = 1;
    dtick_y = parseInt(Az_max / 10.0);
    Az_max *= 1.05;

    // render the plot using plotly
    const trace2 = {
      x: f_vec,
      y: Az_vec,
      type: 'scatter'
    }

    var layout2 = {
      xaxis: {
        range: [0.0, Max_freq],
        title: 'Frequency [Hz]',
        titlefont: {
          family: 'Arial, sans-serif',
          size: 15,
          color: 'black',
        },
        showgrid: 'True',
        zeroline: 'True',
        showline: 'True',
        mirror: 'ticks',
        dtick: dtick_x,
        gridcolor: '#bdbdbd',
        gridwidth: 1,
        zerolinecolor: '#969696',
        zerolinewidth: 2,
        linecolor: '#636363',
        linewidth: 2,
      },
      yaxis: {
        range: [0, Az_max],
        title: 'Az [m/s^2]',
        titlefont: {
          family: 'Arial, sans-serif',
          size: 15,
          color: 'black',
        },
        showgrid: 'True',
        zeroline: 'True',
        showline: 'True',
        mirror: 'ticks',
        dtick: dtick_y,
        gridcolor: '#bdbdbd',
        gridwidth: 1,
        zerolinecolor: '#969696',
        zerolinewidth: 2,
        linecolor: '#636363',
        linewidth: 2,
      },
      legend: {
        y: 0.5,
        yref: 'paper',
        font: {
          family: 'Arial, sans-serif',
          size: 15,
          color: 'black',
        }
      },
      paper_bgcolor: "#F6E3CE",
      title: 'FFT acceleration in z direction',
      titlefont: {
        family: 'Arial, sans-serif',
        size: 18,
        color: 'black',
      },
      margin: {
        l: 55,
        r: 15
      }
    };

    const data2 = [trace2];
    Plotly.newPlot('fft', data2, layout2, { responsive: true });

  }
  catch (err) {
    console.error(err)
    alert(err)
  }
}


