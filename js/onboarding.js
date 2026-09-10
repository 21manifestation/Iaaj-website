// Client onboarding form -> /api/onboarding proxy -> Apps Script -> Google
// Sheet (+ photos to Drive). The Apps Script deployment URL lives
// server-side in api/onboarding.js, not here - see that file for why.
document.addEventListener('DOMContentLoaded', function () {
  var form = document.querySelector('#onboarding-form');
  if (!form) return;

  var statusEl = document.querySelector('#onboarding-status');
  var submitBtn = document.querySelector('#onboarding-submit');

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
      // Human-readable keys become the Google Sheet column headers, in this order.
      var payload = {
        'Submitted At': new Date().toLocaleString(),
        'First Name': val('firstName'),
        'Last Name': val('lastName'),
        'Email': val('email'),
        'Contact Number': val('phone'),
        'Emergency Contact': val('emergencyPhone'),
        'Instagram ID': val('instagramId'),
        'State/Country': val('location'),
        'Address': val('address'),
        'Gender': val('gender'),
        'Occupation': val('occupation'),
        'Date of Birth': val('dob'),
        'Age': val('age'),
        'Water Intake': val('water'),
        'Food Preference': val('foodPref'),
        'Breakfast': val('breakfast'),
        'Lunch': val('lunch'),
        'Dinner': val('dinner'),
        'Snacks': val('snacks'),
        'Oils': val('oils'),
        'Meal Timing': val('mealTiming'),
        'Dairy OK': val('dairy'),
        'Supplements': checkGroup('supplements'),
        'Activity Level': val('activityLevel'),
        'Workout Time': val('workoutTime'),
        'Fitness Goal': val('fitnessGoal'),
        'Bodyweight': val('bodyweight'),
        'Height': val('height'),
        'Stress': val('stress'),
        'Sleep Hours': val('sleepHours'),
        'Neck': val('m_neck'),
        'Shoulder': val('m_shoulder'),
        'Chest': val('m_chest'),
        'Upper Arm': val('m_upperArm'),
        'Waist': val('m_waist'),
        'Navel': val('m_navel'),
        'Hips': val('m_hips'),
        'Lower Belly': val('m_lowerBelly'),
        'Thigh Left': val('m_thighLeft'),
        'Thigh Right': val('m_thighRight'),
        'Calves': val('m_calves'),
        'Sleep Quality (1-5)': val('sleepQualityScale'),
        'Energy (1-5)': val('energyLevel'),
        'Hunger (1-5)': val('hungerLevel'),
        'Mood (1-5)': val('moodLevel'),
        'PCOS/Thyroid': val('diagnosis'),
        'Periods': val('periods'),
        'Why Join': val('whyJoin'),
        'Self Acceptance': val('selfAccept'),
        'Biggest Blocker': val('blocker'),
        'Mindfulness': val('mindfulness'),
        'Meditation': val('meditation'),
        'Allergies': val('allergies'),
        'Medical Issues': checkGroup('medicalIssues'),
        'Injuries': checkGroup('injuries'),
        'Medication': val('medication'),
        'Smoke/Drink': val('smokeDrink'),
        'Strength Training': val('strengthTraining'),
        'Workout Intensity': val('workoutIntensity'),
        'Found Us Via': val('foundUs'),
        'Anything Else': val('anythingElse'),
        'Front Photo': photos[0],
        'Side Photo': photos[1]
      };

      // Through the same-origin /api/onboarding proxy, NOT mode:'no-cors'
      // direct to Apps Script. The old code called finish() - the success
      // screen - in BOTH the .then() and the .catch(), so a client whose
      // submission failed to save was told it had succeeded either way,
      // with no photos, no intake, and no way for anyone to know to
      // re-contact them. The proxy retries once server-side and now a
      // genuine failure shows an error and leaves the form filled in
      // instead of quietly discarding a paying client's intake.
      var body = new URLSearchParams(payload);
      fetch('/api/onboarding', { method: 'POST', body: body })
        .then(function (res) { return res.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data || data.status !== 'success') throw new Error('onboarding save failed');
          finish();
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit and start my journey';
          showStatus('Something went wrong sending your details. Please try again, or send us a message on WhatsApp so nothing gets lost.', true);
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
