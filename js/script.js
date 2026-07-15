// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.querySelector('.mobile-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      menu.classList.toggle('open');
    });
  }

  // Enquiry form: show a friendly success message without leaving the page.
  // Works once the form's "action" is set to a real Formspree endpoint (see contact.html comments).
  var form = document.querySelector('#enquiry-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      var action = form.getAttribute('action') || '';
      if (action.indexOf('YOUR_FORM_ID') !== -1) {
        // Form is not connected yet, let the user know instead of failing silently.
        e.preventDefault();
        alert('This form is not connected yet. Message us on WhatsApp instead, or ask your site builder to finish the Formspree setup.');
        return;
      }

      e.preventDefault();
      var data = new FormData(form);
      fetch(action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      }).then(function (response) {
        if (response.ok) {
          form.reset();
          document.querySelector('#form-success').style.display = 'block';
          form.style.display = 'none';
        } else {
          alert('Something went wrong sending your message. Please try WhatsApp instead.');
        }
      }).catch(function () {
        alert('Something went wrong sending your message. Please try WhatsApp instead.');
      });
    });
  }
});
