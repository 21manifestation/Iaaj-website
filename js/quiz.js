// Hormonal-type quiz. Maps answers to a starting point, captures name/email/phone
// (for retargeting), logs + emails the matching guide via Apps Script, then routes to WhatsApp.
document.addEventListener('DOMContentLoaded', function () {
  var card = document.querySelector('.quiz-card');
  if (!card) return;

  var WA = 'https://wa.me/919403912211?text=';

  // Paste the deployment URL from the quiz Apps Script here once it's set up.
  // Until then, the quiz still works end to end, it just doesn't log/email anything.
  var QUIZ_ENDPOINT = 'YOUR_APPS_SCRIPT_URL';

  var QUESTIONS = [
    {
      q: "What feels most out of your control right now?",
      options: [
        { t: "Cravings and energy crashes", type: "insulin" },
        { t: "Constant fatigue and a scale that won't move", type: "thyroid" },
        { t: "Stress, poor sleep, and late-night eating", type: "stress" }
      ]
    },
    {
      q: "How do your mornings usually feel?",
      options: [
        { t: "Okay early on, it's the afternoon slump that gets me", type: "insulin" },
        { t: "I wake up already drained", type: "thyroid" },
        { t: "Tired, because I couldn't switch off the night before", type: "stress" }
      ]
    },
    {
      q: "Where do you notice weight the most?",
      options: [
        { t: "Around my middle", type: "insulin" },
        { t: "All over, and it just will not budge", type: "thyroid" },
        { t: "It moves with my stress and sleep", type: "stress" }
      ]
    },
    {
      q: "What do your cravings actually look like?",
      options: [
        { t: "Sudden and sharp, mostly for sugar or carbs", type: "insulin" },
        { t: "Low appetite most days, but tired all the time", type: "thyroid" },
        { t: "Late at night, when I am overtired or overwhelmed", type: "stress" }
      ]
    },
    {
      q: "How would you describe your sleep?",
      options: [
        { t: "I sleep fine but wake up hungry", type: "insulin" },
        { t: "I sleep plenty and still wake up exhausted", type: "thyroid" },
        { t: "My mind races, I struggle to fall asleep", type: "stress" }
      ]
    },
    {
      q: "What happens after a workout?",
      options: [
        { t: "I get ravenous within the hour", type: "insulin" },
        { t: "I feel wiped out for the rest of the day", type: "thyroid" },
        { t: "I skip it half the time, no energy to start", type: "stress" }
      ]
    },
    {
      q: "How do you feel around food at social events?",
      options: [
        { t: "Fine, until dessert or the bread basket shows up", type: "insulin" },
        { t: "I eat normally and still do not lose weight", type: "thyroid" },
        { t: "I overeat when I am anxious or emotional", type: "stress" }
      ]
    },
    {
      q: "What quietly derails you the most?",
      options: [
        { t: "Sugar cravings winning at the wrong moment", type: "insulin" },
        { t: "Feeling like nothing works, no matter what I try", type: "thyroid" },
        { t: "Life just getting in the way, no time to breathe", type: "stress" }
      ]
    },
    {
      q: "If you had to pick one, what would help you most right now?",
      options: [
        { t: "Steadier energy, without the crashes", type: "insulin" },
        { t: "Actually feeling my metabolism respond", type: "thyroid" },
        { t: "Finally getting real sleep and calm", type: "stress" }
      ]
    }
  ];

  var RESULTS = {
    insulin: {
      type: "Blood sugar & insulin",
      desc: "Your answers point to a blood-sugar rollercoaster: cravings, crashes, and weight around the middle. The fix is not eating less. It is changing how and when you eat so insulin settles down. A good place to start is the Insulin & Blood Sugar guide.",
      guideName: "Insulin & Blood Sugar Guide",
      guideUrl: "https://itsallaboutjourney.com/guides/iaaj-insulin-guide.pdf",
      wa: "Hi, I took the quiz and my starting point looks like blood sugar and insulin. I'd like to know more about coaching."
    },
    thyroid: {
      type: "Metabolism & energy",
      desc: "Fatigue and a stuck scale point to a slower metabolism. Crash diets make this worse, not better. The fix is steady, sustainable structure that protects your energy. A good place to start is the Protein guide.",
      guideName: "Protein Guide",
      guideUrl: "https://itsallaboutjourney.com/guides/iaaj-protein-guide.pdf",
      wa: "Hi, I took the quiz and my starting point looks like metabolism and energy. I'd like to know more about coaching."
    },
    stress: {
      type: "Stress & sleep",
      desc: "Tired-but-wired, broken sleep and stress eating point to cortisol running the show. The fix starts with sleep and stress, not willpower. A good place to start is the Stress & Cortisol guide.",
      guideName: "Stress & Cortisol Guide",
      guideUrl: "https://itsallaboutjourney.com/guides/iaaj-stress-cortisol-guide.pdf",
      wa: "Hi, I took the quiz and my starting point looks like stress and sleep. I'd like to know more about coaching."
    }
  };

  var intro = document.querySelector('#quiz-intro');
  var qScreen = document.querySelector('#quiz-question-screen');
  var captureScreen = document.querySelector('#quiz-capture-screen');
  var rScreen = document.querySelector('#quiz-result-screen');
  var bar = document.querySelector('#quiz-bar');
  var progressLabel = document.querySelector('#quiz-progress-label');
  var qText = document.querySelector('#quiz-question-text');
  var optionsWrap = document.querySelector('#quiz-options');
  var backBtn = document.querySelector('#quiz-back');
  var captureForm = document.querySelector('#quiz-capture-form');

  var current = 0;
  var answers = [];
  var winnerType = null;

  function show(screen) {
    [intro, qScreen, captureScreen, rScreen].forEach(function (s) { s.classList.remove('active'); });
    screen.classList.add('active');
  }

  function renderQuestion() {
    var q = QUESTIONS[current];
    bar.style.width = (current / QUESTIONS.length * 100) + '%';
    progressLabel.textContent = 'Question ' + (current + 1) + ' of ' + QUESTIONS.length;
    qText.textContent = q.q;
    optionsWrap.innerHTML = '';
    q.options.forEach(function (opt) {
      var b = document.createElement('button');
      b.className = 'quiz-option';
      b.type = 'button';
      b.textContent = opt.t;
      b.addEventListener('click', function () { choose(opt.type); });
      optionsWrap.appendChild(b);
    });
    backBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
  }

  function choose(type) {
    answers[current] = type;
    if (current < QUESTIONS.length - 1) {
      current++;
      renderQuestion();
    } else {
      bar.style.width = '100%';
      var tally = {};
      answers.forEach(function (t) { tally[t] = (tally[t] || 0) + 1; });
      var winner = answers[answers.length - 1];
      var best = 0;
      Object.keys(tally).forEach(function (k) {
        if (tally[k] > best) { best = tally[k]; winner = k; }
      });
      winnerType = winner;
      show(captureScreen);
    }
  }

  function showResult() {
    var r = RESULTS[winnerType];
    document.querySelector('#quiz-result-type').textContent = r.type;
    document.querySelector('#quiz-result-desc').textContent = r.desc;
    document.querySelector('#quiz-result-actions').innerHTML =
      '<a class="btn btn-primary" href="contact.html">Fill the enquiry form</a>' +
      '<a class="btn btn-outline" target="_blank" rel="noopener" href="' + WA + encodeURIComponent(r.wa) + '">Message us on WhatsApp</a>' +
      '<a class="btn btn-outline" href="guides.html">Get your free guide</a>';
    show(rScreen);
  }

  document.querySelector('#quiz-start').addEventListener('click', function () {
    current = 0;
    answers = [];
    renderQuestion();
    show(qScreen);
  });

  backBtn.addEventListener('click', function () {
    if (current > 0) { current--; renderQuestion(); }
  });

  captureForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = RESULTS[winnerType];
    var payload = {
      name: document.querySelector('#qz-name').value.trim(),
      email: document.querySelector('#qz-email').value.trim(),
      phone: document.querySelector('#qz-phone').value.trim(),
      resultType: r.type,
      guideName: r.guideName,
      guideUrl: r.guideUrl,
      page: 'Hormonal quiz'
    };
    if (QUIZ_ENDPOINT.indexOf('script.google.com') !== -1) {
      var body = new URLSearchParams(payload);
      fetch(QUIZ_ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
    }
    showResult();
  });

  document.querySelector('#quiz-retake').addEventListener('click', function () {
    bar.style.width = '0';
    captureForm.reset();
    show(intro);
  });
});
