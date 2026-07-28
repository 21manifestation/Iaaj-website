// Floating "Ask a question" widget. Answers instantly from the FAQ list below by
// matching keywords in what the visitor types. No API, no server, everything runs
// in the browser. If nothing matches confidently, it hands off to WhatsApp.
//
// To update the answers the bot gives, edit the FAQS array. Keep "keywords" as
// extra words/phrases a visitor might type that don't appear in the question itself.
(function () {
  var WHATSAPP_NUMBER = '919403912211';

  var FAQS = [
    {
      q: 'How do I start?',
      a: 'Message us on WhatsApp or fill the enquiry form. We will understand what you are dealing with and walk you through everything after that.',
      keywords: ['start', 'begin', 'join', 'sign up', 'get started', 'enquiry', 'first step'],
      link: { text: 'Fill the enquiry form', href: 'contact.html' }
    },
    {
      q: 'Is this paid?',
      a: "Yes. It is a paid, personalised coaching program. We explain everything clearly after your enquiry.",
      keywords: ['cost', 'price', 'pricing', 'fee', 'money', 'free', 'charges', 'how much does it cost']
    },
    {
      q: 'Is the coaching online?',
      a: 'Yes, fully online. Everything runs through your private WhatsApp group and video calls, so you can be coached from anywhere.',
      keywords: ['online', 'remote', 'video call', 'whatsapp group', 'in person', 'location']
    },
    {
      q: 'Do you work with clients outside India?',
      a: 'Yes. We coach women across India and internationally.',
      keywords: ['outside india', 'international', 'abroad', 'overseas', 'usa', 'uk', 'canada', 'dubai']
    },
    {
      q: 'I have a thyroid condition, not PCOS. Can you help?',
      a: 'Yes. We work with PCOS, PCOD, thyroid and general hormonal fat loss. The plan is built around what your body is actually doing.',
      keywords: ['thyroid', 'hypothyroid', 'hashimoto', 'not pcos', 'pcod']
    },
    {
      q: 'Do I need a gym?',
      a: 'No. Your plan is built for whatever you have, home or gym, and matched to your schedule and body.',
      keywords: ['gym', 'equipment', 'home workout', 'no gym', 'workout at home']
    },
    {
      q: 'How much weight will I lose in 90 days?',
      a: 'We focus on fat loss and visible change in your inches, not just the number on the scale. Results depend on your genetics, medical history, previous attempts and, most of all, your consistency.',
      keywords: ['how much weight', 'results', 'kg', 'lose weight', 'timeline', 'how long', 'how fast']
    },
    {
      q: 'What do I get once I join?',
      a: 'A personalised plan delivered as one clear Google Sheet with five sections: nutrition, workout, lifestyle, supplements and a weekly tracking sheet. Plus daily meal checks and weekly calls with your Journey Masters.',
      keywords: ['what do i get', 'included', 'plan', 'sheet', 'diet plan', 'workout plan', "what's inside"],
      link: { text: 'See the full journey', href: 'journey.html' }
    },
    {
      q: 'Who builds and checks my plan?',
      a: 'Your Nutrition Journey Master and Workout Journey Master build it, and Gaurav personally checks every plan before it reaches you.',
      keywords: ['who builds', 'dietician', 'nutritionist', 'coach', 'trainer', 'who checks']
    },
    {
      q: 'What is the BLESS Method?',
      a: 'It is our framework: Balanced hormones, Lifestyle tweaks, Empowered choices, Support and Sustainable change.',
      keywords: ['bless method', 'bless', 'framework', 'method', 'approach'],
      link: { text: 'Read more about the method', href: 'program.html' }
    },
    {
      q: 'How many clients do you take each month?',
      a: 'Slots are limited, since coaching is personal and hands on. Message us to check current availability.',
      keywords: ['slots', 'availability', 'spots', 'how many clients', 'waitlist']
    }
  ];

  var STOPWORDS = ['a', 'an', 'the', 'is', 'it', 'do', 'does', 'did', 'i', 'you', 'my', 'me',
    'to', 'for', 'of', 'in', 'on', 'and', 'or', 'with', 'can', 'will', 'how', 'what', 'are',
    'am', 'be', 'this', 'that', 'your', 'yours', 'about', 'if', 'so', 'need', 'want'];

  function tokenize(str) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (w) {
      return w.length > 1 && STOPWORDS.indexOf(w) === -1;
    });
  }

  function scoreFaq(faq, userTokens, rawInput) {
    var score = 0;
    var qTokens = tokenize(faq.q);
    var aTokens = tokenize(faq.a);

    userTokens.forEach(function (tok) {
      if (qTokens.indexOf(tok) !== -1) score += 3;
      if (aTokens.indexOf(tok) !== -1) score += 1;
    });

    (faq.keywords || []).forEach(function (phrase) {
      if (rawInput.indexOf(phrase) !== -1) score += 4;
    });

    return score;
  }

  function findBestMatch(userInput) {
    var rawInput = userInput.toLowerCase();
    var userTokens = tokenize(userInput);
    if (userTokens.length === 0) return null;

    var best = null;
    var bestScore = 0;
    FAQS.forEach(function (faq) {
      var s = scoreFaq(faq, userTokens, rawInput);
      if (s > bestScore) {
        bestScore = s;
        best = faq;
      }
    });

    return bestScore >= 3 ? best : null;
  }

  function waLink(text) {
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var floatBtn = document.createElement('button');
    floatBtn.className = 'faqbot-float';
    floatBtn.setAttribute('aria-label', 'Ask a quick question');
    floatBtn.innerHTML =
      '<svg class="faqbot-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
      '<svg class="faqbot-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    var panel = document.createElement('div');
    panel.className = 'faqbot-panel';
    panel.innerHTML =
      '<div class="faqbot-header">' +
        '<div>' +
          '<strong>Journey Master</strong>' +
          '<span>Instant answers &middot; not a real person</span>' +
        '</div>' +
        '<button type="button" class="faqbot-close" aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="faqbot-body" id="faqbot-body"></div>' +
      '<div class="faqbot-inputrow">' +
        '<input type="text" id="faqbot-input" placeholder="Type your question..." autocomplete="off">' +
        '<button id="faqbot-send" aria-label="Send">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>';

    document.body.appendChild(floatBtn);
    document.body.appendChild(panel);

    var body = panel.querySelector('#faqbot-body');
    var input = panel.querySelector('#faqbot-input');
    var sendBtn = panel.querySelector('#faqbot-send');
    var opened = false;

    function scrollToBottom() {
      body.scrollTop = body.scrollHeight;
    }

    function addBubble(text, who) {
      var row = document.createElement('div');
      row.className = 'faqbot-msg ' + who;
      var bubble = document.createElement('div');
      bubble.className = 'faqbot-bubble';
      bubble.textContent = text;
      row.appendChild(bubble);
      body.appendChild(row);
      scrollToBottom();
      return row;
    }

    function addBotAnswer(faq) {
      var row = document.createElement('div');
      row.className = 'faqbot-msg bot';
      var bubble = document.createElement('div');
      bubble.className = 'faqbot-bubble';
      bubble.textContent = faq.a;
      row.appendChild(bubble);
      if (faq.link) {
        var a = document.createElement('a');
        a.href = faq.link.href;
        a.className = 'faqbot-link';
        a.textContent = faq.link.text + ' →';
        row.appendChild(a);
      }
      body.appendChild(row);
      scrollToBottom();
    }

    function addFallback(userText) {
      var row = document.createElement('div');
      row.className = 'faqbot-msg bot';
      var bubble = document.createElement('div');
      bubble.className = 'faqbot-bubble';
      bubble.textContent = "I don't want to guess wrong on that one. Message us directly and a real person on the team will help you.";
      row.appendChild(bubble);

      var actions = document.createElement('div');
      actions.className = 'faqbot-fallback-actions';

      var wa = document.createElement('a');
      wa.href = waLink('Hi, I had a question: ' + userText);
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.className = 'btn btn-primary faqbot-fallback-btn';
      wa.textContent = 'Message us on WhatsApp';
      actions.appendChild(wa);

      var contact = document.createElement('a');
      contact.href = 'contact.html';
      contact.className = 'btn btn-outline faqbot-fallback-btn';
      contact.textContent = 'Fill the enquiry form';
      actions.appendChild(contact);

      row.appendChild(actions);
      body.appendChild(row);
      scrollToBottom();
    }

    function showTyping() {
      var row = document.createElement('div');
      row.className = 'faqbot-msg bot faqbot-typing-row';
      row.innerHTML = '<div class="faqbot-bubble faqbot-typing"><span></span><span></span><span></span></div>';
      body.appendChild(row);
      scrollToBottom();
      return row;
    }

    function handleUserText(text) {
      text = text.trim();
      if (!text) return;

      addBubble(text, 'user');
      input.value = '';

      var typingRow = showTyping();
      var match = findBestMatch(text);

      setTimeout(function () {
        typingRow.remove();
        if (match) {
          addBotAnswer(match);
        } else {
          addFallback(text);
        }
      }, 500 + Math.random() * 400);
    }

    function addChips() {
      var chipsRow = document.createElement('div');
      chipsRow.className = 'faqbot-chips';
      var suggestions = FAQS.slice(0, 4);
      suggestions.forEach(function (faq) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'faqbot-chip';
        chip.textContent = faq.q;
        chip.addEventListener('click', function () {
          chipsRow.remove();
          handleUserText(faq.q);
        });
        chipsRow.appendChild(chip);
      });
      body.appendChild(chipsRow);
      scrollToBottom();
    }

    function openPanel() {
      opened = true;
      panel.classList.add('open');
      floatBtn.classList.add('open');
      if (!body.hasChildNodes()) {
        addBubble("Hi! I'm Journey Master, here to give you instant answers. Ask me anything about the coaching, PCOS, thyroid or getting started.", 'bot');
        addChips();
      }
      setTimeout(function () { input.focus(); }, 200);
    }

    function closePanel() {
      opened = false;
      panel.classList.remove('open');
      floatBtn.classList.remove('open');
    }

    floatBtn.addEventListener('click', function () {
      if (opened) { closePanel(); } else { openPanel(); }
    });

    panel.querySelector('.faqbot-close').addEventListener('click', closePanel);

    sendBtn.addEventListener('click', function () { handleUserText(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); handleUserText(input.value); }
    });
  });
})();
