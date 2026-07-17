// Client onboarding form -> Google Apps Script -> Google Sheet (+ photos to Drive).
// Paste the deployment URL from the onboarding Apps Script between the quotes below.
document.addEventListener('DOMContentLoaded', function () {
  var ONBOARDING_ENDPOINT = 'YOUR_ONBOARDING_APPS_SCRIPT_URL';

  var form = document.querySelector('#onboarding-form');
  if (!form) return;

  var statusEl = document.querySelector('#onboarding-status');
  var submitBtn = document.querySelector('#onboarding-submit');

  // Every plain field id we collect, in a sensible column order.
  var FIELDS = [
    'firstName', 'lastName', 'email', 'phone', 'emergencyPhone', 'location', 'address',
    'gender', 'occupation', 'dob', 'age',
    'water', 'foodPref', 'breakfast', 'lunch', 'dinner', 'snacks', 'oils', 'mealTiming', 'dairy',
    'activityLevel', 'workoutTime', 'fitnessGoal', 'bodyweight', 'height', 'waist',
    'stress', 'sleepHours', 'sleepQuality',
    'diagnosis', 'periods',
    'whyJoin', 'selfAccept', 'blocker', 'mindfulness', 'meditation',
    'allergies', 'medication', 'smokeDrink', 'strengthTraining', 'workoutIntensity', 'foundUs', 'anythingElse'
  ];

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function checkGroup(name) {
    var boxes = document.querySelectorAll('.check-group[data-name="' + name + '"] input:checked');
    return Array.prototype.map.call(boxes, function (b) { return b.value; }).join(', ');
  }

  // Resize + compress a photo file to a small JPEG data URL so mobile uploads stay light.
  function compressPhoto(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(''); return; }
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
          else if (h >= w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    // Require at least one box in each required checkbox group.
    var requiredGroups = ['supplements', 'medicalIssues', 'injuries'];
    for (var i = 0; i < requiredGroups.length; i++) {
      if (!checkGroup(requiredGroups[i])) {
        showStatus('Please answer every checkbox question (pick at least one option, or "None").', true);
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading, please wait...';
    showStatus('Compressing your photos and sending. This can take a few seconds.', false);

    var frontFile = document.getElementById('frontPhoto').files[0];
    var sideFile = document.getElementById('sidePhoto').files[0];

    Promise.all([
      compressPhoto(frontFile, 1280, 0.72),
      compressPhoto(sideFile, 1280, 0.72)
    ]).then(function (photos) {
      var payload = { submittedAt: new Date().toLocaleString() };
      FIELDS.forEach(function (id) { payload[id] = val(id); });
      payload.supplements = checkGroup('supplements');
      payload.medicalIssues = checkGroup('medicalIssues');
      payload.injuries = checkGroup('injuries');
      payload.frontPhoto = photos[0];
      payload.sidePhoto = photos[1];

      if (ONBOARDING_ENDPOINT.indexOf('script.google.com') === -1) {
        // Endpoint not wired yet: don't lose the client, just confirm.
        finish();
        return;
      }

      var body = new URLSearchParams(payload);
      fetch(ONBOARDING_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body })
        .then(finish)
        .catch(function () {
          // no-cors gives an opaque response; a network error is rare but handle it.
          finish();
        });
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit and start my journey';
      showStatus('Something went wrong reading your photos. Please try smaller images, or tell us on WhatsApp.', true);
    });
  });

  function finish() {
    form.style.display = 'none';
    document.querySelector('#onboarding-success').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showStatus(msg, isError) {
    statusEl.style.display = 'block';
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--red)' : 'var(--grey)';
  }
});
