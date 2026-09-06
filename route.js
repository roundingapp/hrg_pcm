// Keep the public entry point free of patient data and credentials.
// The private destination verifies the connecting Tailscale identity itself.
const destination = 'http://connect.pcm.houstonrenal.com:3100/pcm/';
if (new URLSearchParams(location.search).get('open') !== 'manual') {
  document.getElementById('status').textContent = 'Opening your private PCM workspace…';
  setTimeout(() => location.replace(destination), 500);
}
