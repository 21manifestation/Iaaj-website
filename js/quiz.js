// Hormonal-type quiz. Maps three quick answers to a starting point and routes to WhatsApp.
document.addEventListener('DOMContentLoaded', function () {
  var card = document.querySelector('.quiz-card');
  if (!card) return;

  var WA = 'https://wa.me/919403912211?text=';

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
    }
  ];

  var RESULTS = {
    insulin: {
      type: "Blood sugar & insulin",
      desc: "Your answers point to a blood-sugar rollercoaster: cravings, crashes, and weight around the middle. The fix is not eating less. It is changing how and when you eat so insulin settles down. A good place to start is the PCOS & Hormonal guide.",
      wa: "Hi, I took the quiz and my starting point looks like blood sugar and insulin. I'd like to know more about coaching."
    },
    thyroid: {
      type: "Metabolism & energy",
      desc: "Fatigue and a stuck scale point to a slower metabolism. Crash diets make this worse, not better. The fix is steady, sustainable structure that protects your energy. A good place to start is the Protein guide.",
      wa: "Hi, I took the quiz and my starting point looks like metabolism and energy. I'd like to know more about coaching."
    },
    stress: {
      type: "Stress & sleep",
      desc: "Tired-but-wired, broken sleep and stress eating point to cortisol running the show. The fix starts with sleep and stress, not willpower. A good place to start is the Sleep guide.",
      wa: "Hi, I took the quiz and my starting point looks like stress and sleep. I'd like to know more about coaching."
    }
  };

  var intro = document.querySelector('#quiz-intro');
  var qScreen = document.querySelector('#quiz-question-screen');
  var rScreen = document.querySelector('#quiz-result-screen');
  var bar = document.querySelector('#quiz-bar');
  var progressLabel = document.querySelector('#quiz-progress-label');
  var qText = document.querySelector('#quiz-question-text');
  var optionsWrap = document.querySelector('#quiz-options');
  var backBtn = document.querySelector('#quiz-back');

  var current = 0;
  var answers = [];

  function show(screen) {
    [intro, qScreen, rScreen].forEach(function (s) { s.classList.remove('active'); });
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
      showResult();
    }
  }

  function showResult() {
    bar.style.width = '100%';
    var tally = {};
    answers.forEach(function (t) { tally[t] = (tally[t] || 0) + 1; });
    // Default to the most recent answer, then let any clear majority win.
    var winner = answers[answers.length - 1];
    var best = 0;
    Object.keys(tally).forEach(function (k) {
      if (tally[k] > best) { best = tally[k]; winner = k; }
    });
    var r = RESULTS[winner];
    document.querySelector('#quiz-result-type').textContent = r.type;
    document.querySelector('#quiz-result-desc').textContent = r.desc;
    document.querySelector('#quiz-result-actions').innerHTML =
      '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + WA + encodeURIComponent(r.wa) + '">Message us on WhatsApp</a>' +
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

  document.querySelector('#quiz-retake').addEventListener('click', function () {
    bar.style.width = '0';
    show(intro);
  });
});
