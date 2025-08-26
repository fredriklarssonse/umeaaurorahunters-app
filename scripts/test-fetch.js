import fetch from 'node-fetch';

(async () => {
  const res = await fetch('https://services.swpc.noaa.gov/json/ace/mag/ace_mag_1h.json');
  const data = await res.json();
  console.log(data[data.length - 1]);
})();